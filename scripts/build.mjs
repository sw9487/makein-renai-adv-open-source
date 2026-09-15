import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, existsSync, writeFileSync, cpSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defaultContent } from "../core/content.ts";
import {validateContent} from '../server/validation.ts';
import {hydratePublicAccounts} from '../core/twitter-public.ts';
import {optimizedSceneUrl} from '../web/lib/scene-images.ts';
const root = fileURLToPath(new URL("../", import.meta.url));
const web = fileURLToPath(new URL("../web/", import.meta.url));
const result = spawnSync(
  process.execPath,
  [fileURLToPath(new URL("../web/node_modules/vite/bin/vite.js", import.meta.url)), "build"],
  { cwd: web, stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status ?? 1);
mkdirSync(new URL("../dist/", import.meta.url), { recursive: true });
// CLI consumes the same language files as the application in installed packages.
mkdirSync(new URL('../dist/locales/',import.meta.url),{recursive:true});
for(const language of ['ja','zh-TW','en'])cpSync(new URL('../web/locales/'+language+'.json',import.meta.url),new URL('../dist/locales/'+language+'.json',import.meta.url));
const built = await Bun.build({
  entrypoints: [fileURLToPath(new URL("../server/http.ts", import.meta.url))],
  outdir: fileURLToPath(new URL("../dist/", import.meta.url)),
  naming: "server.mjs",
  target: "bun",
  format: "esm",
  minify: false,
  tsconfig: fileURLToPath(new URL("../tsconfig.json", import.meta.url)),
});
if (!built.success) {
  console.error(built.logs);
  process.exit(1);
}
const sourceFile = new URL("../content/game.json", import.meta.url);
if (!existsSync(sourceFile)) {
  mkdirSync(new URL("../content/", import.meta.url), { recursive: true });
  writeFileSync(sourceFile, JSON.stringify(defaultContent, null, 2) + "\n");
}
const snapshot=validateContent(hydratePublicAccounts(JSON.parse(readFileSync(sourceFile,'utf8'))));
const bundledAssets=new Set();
function visitAssets(value){
 if(typeof value==='string'&&value.startsWith('/assets/'))bundledAssets.add(value);
 else if(Array.isArray(value))value.forEach(visitAssets);
 else if(value&&typeof value==='object')Object.values(value).forEach(visitAssets);
}
visitAssets(snapshot);
const missingAssets=[];
for(const source of bundledAssets){
 for(const url of new Set([source,optimizedSceneUrl(source)])){
  if(!/^\/assets\/[a-zA-Z0-9/_-]+\.(?:png|jpg|jpeg|webp|svg|mp3)$/.test(url))continue;
  const file=url.startsWith('/assets/authored/')
   ?new URL('../content/assets/'+url.slice('/assets/authored/'.length),import.meta.url)
   :new URL('../dist/client'+url,import.meta.url);
  if(!existsSync(file))missingAssets.push(url);
 }
}
if(missingAssets.length)throw Error('Package assets are missing: '+missingAssets.join(', '));
writeFileSync(new URL("../dist/content.json", import.meta.url), JSON.stringify(snapshot,null,2)+'\n');
// Authored images are served and packaged directly from content/assets.
console.log("Local package build complete: dist/client + dist/server.mjs");
