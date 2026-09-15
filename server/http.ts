import {apiFetch} from './api-fetch';
import { join, resolve, sep, extname } from "node:path";
import { existsSync, statSync } from "node:fs";
import { db, initializeRuntime, type RuntimeOptions } from "./runtime";
import * as game from "./game-api";
import * as editor from "./editor-api";
import * as upload from "./upload-api";
import * as media from "./media-api";
import {handle as knowledge} from './knowledge-api';
import {handle as search} from './search-api';
import {handle as stableDiffusion} from './stable-diffusion-api';
import {createAiStatusCheck} from './ai-status';
import {twitterApi} from './twitter';
import {withRequestLocale} from './request-locale';
import {localizeResponse} from './response-locale';
import {authoredAssetPath} from '../core/authored-assets';
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};
export function startServer(options: RuntimeOptions & { clientDir: string; version: string }) {
  const close = initializeRuntime(options);
  const checkAi=createAiStatusCheck();
  const client = resolve(options.clientDir);
  let server: ReturnType<typeof Bun.serve>;
  try {
    server = Bun.serve({
      hostname: options.hostname ?? "127.0.0.1",
      port: options.port,
      maxRequestBodySize: 5 * 1024 * 1024,
      idleTimeout: 0,
      async fetch(req) {
        return withRequestLocale(req,async()=>{
        const url = new URL(req.url);
        const allowedHosts = [`localhost:${server.port}`, `127.0.0.1:${server.port}`];
        if (!allowedHosts.includes(req.headers.get("host") ?? ""))
          return localizeResponse(new Response("Invalid local host", { status: 403 }));
        const origin = req.headers.get("origin");
        // Normalise localhost <-> 127.0.0.1 so the dev origin stays valid regardless of how the
        // page was opened; a relative `/api` call carries the page origin on POST but not on GET.
        const originKey = (o: string) => {
          try {
            const u = new URL(o);
            return `${u.protocol}//${u.hostname === "localhost" ? "127.0.0.1" : u.hostname}:${u.port}`;
          } catch {
            return o;
          }
        };
        const allowedOrigins = new Set(
          [...allowedHosts.map((h) => "http://" + h), options.devOrigin].filter((x): x is string => !!x).map(originKey),
        );
        const originIsAllowed = !!origin && allowedOrigins.has(originKey(origin));
        if (origin && !originIsAllowed)
          return localizeResponse(new Response("Cross-origin request rejected", { status: 403 }));
        if (req.headers.get("sec-fetch-site") === "cross-site" && !originIsAllowed)
          return localizeResponse(new Response("Cross-site request rejected", { status: 403 }));
        let response: Response;
        try {
          const path = decodeURIComponent(url.pathname);
          if (path === "/api/health" && req.method === "GET") {
            await db().ready();
            response = Response.json({
              app: "@sw9487/makein-renai-adv",
              version: options.version,
              status: "ready",
              database: options.env.DATABASE_URL ? "postgresql" : "sqlite",
              assets: options.env.S3_ENDPOINT ? "s3" : "filesystem",
            });
          }
          else if (path === '/api/twitter' && ['GET','POST','PATCH'].includes(req.method)) response = await twitterApi(req);
          else if (path === '/api/stable-diffusion' && ['GET','POST'].includes(req.method)) response = await stableDiffusion(req);
          else if (path === '/api/ai-status' && req.method === 'GET') response = Response.json(await checkAi(),{headers:{'Cache-Control':'no-store'}});
          else if (path === "/api/game" && req.method === "GET") response = await game.GET(req);
          else if (path === "/api/game" && req.method === "POST") response = await game.POST(req);
          else if (path === "/api/editor" && req.method === "GET") response = await editor.GET(req);
          else if (path === '/api/knowledge' && ['GET','POST'].includes(req.method)) response = await knowledge(req);
          else if (path === '/api/web-search' && ['GET','POST'].includes(req.method)) response = await search(req);
          else if (path === "/api/editor" && req.method === "POST")
            response = await editor.POST(req);
          else if (path === "/api/upload" && req.method === "POST")
            response = await upload.POST(req);
          else if (path.startsWith("/api/media/") && req.method === "GET")
            response = await media.GET(req, {
              params: Promise.resolve({ key: path.slice("/api/media/".length) }),
            });
          else if (path.startsWith("/api/"))
            response = Response.json({ error: "API route or method not found" }, { status: 404 });
          else if (!["GET", "HEAD"].includes(req.method))
            response = new Response("Method not allowed", { status: 405 });
          else {
            const authoredPath = authoredAssetPath(path);
            if ((options.projectDir || options.packageDir) && authoredPath) {
              const authorAsset = join(
                (options.projectDir || options.packageDir)!,
                "content/assets",
                authoredPath,
              );
              if (existsSync(authorAsset)) {
                const stat = statSync(authorAsset);
                const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
                const headers = {
                  "Content-Type": mime[extname(authorAsset)],
                  "Content-Length": String(stat.size),
                  // Expression PNGs may be replaced at the same URL during
                  // development; always revalidate so a resized reference
                  // cannot be mixed with an hour-old expression sheet.
                  "Cache-Control": path.endsWith("-expression.png") ? "no-cache" : "public, max-age=3600",
                  "ETag": etag,
                  "X-Content-Type-Options": "nosniff",
                  "Cross-Origin-Resource-Policy": "same-origin",
                };
                if (req.headers.get("if-none-match") === etag)
                  return new Response(null, { status: 304, headers });
                return new Response(req.method === "HEAD" ? null : Bun.file(authorAsset), { headers });
              }
            }
            if (options.devOrigin) {
              // 開發模式：把前端（HTML/JS/CSS…）轉送給 vite dev server，讓 9487 也直接呈現最新原始碼，免手動 build。
              const upstream = new URL(options.devOrigin);
              upstream.pathname = path;
              upstream.search = url.search;
              response = await apiFetch(upstream, {
                method: req.method,
                headers: {
                  accept: req.headers.get("accept") ?? "*/*",
                  ...(req.headers.get("if-none-match")
                    ? { "if-none-match": req.headers.get("if-none-match")! }
                    : {}),
                  ...(req.headers.get("if-modified-since")
                    ? { "if-modified-since": req.headers.get("if-modified-since")! }
                    : {}),
                },
              });
            } else {
              let filename =
                path === "/" || path === "/editor" || path === "/editor/"
                  ? join(client, "index.html")
                  : resolve(client, "." + path);
              const relative = filename.slice(client.length + 1);
              const validStaticPath = filename.startsWith(client + sep) && !relative.split(/[\\/]/).some(p=>p.startsWith('.'));
              if (
                !validStaticPath ||
                !existsSync(filename)
              )
                response = new Response("Not found", { status: 404 });
              else {
                const file = Bun.file(filename);
                response = new Response(req.method === "HEAD" ? null : file, {
                  headers: {
                    "Content-Type": mime[extname(filename)] ?? "application/octet-stream",
                    "Cache-Control": filename.endsWith(".html") ? "no-cache" : "public, max-age=3600",
                  },
                });
              }
            }
          }
        } catch {
          response = Response.json({ error: "本機請求失敗，請重新整理後再試。" }, { status: 500 });
        }
        response.headers.set("X-Content-Type-Options", "nosniff");
        response.headers.set("X-Frame-Options", "DENY");
        response.headers.set("Referrer-Policy", "no-referrer");
        response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
        return localizeResponse(response);
        });
      },
      error() {
        return localizeResponse(Response.json({ error: "本機伺服器錯誤。" }, { status: 500 }));
      },
    });
  } catch (error) {
    close();
    throw error;
  }
  return {
    server,
    async stop() {
      await server.stop(true);
      close();
    },
  };
}
