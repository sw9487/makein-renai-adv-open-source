import { join } from "node:path";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { PostgresDatabase, type AppDatabase } from "./database";
import { S3Client } from "bun";
export type RuntimeOptions = {
  dataDir: string;
  env: Record<string, string>;
  port: number;
  devOrigin?: string;
  packageDir?: string;
  projectDir?: string;
  version?: string;
  clientDir?: string;
  hostname?: string;
};
export type LocalAssets = {
  put: (
    key: string,
    data: ArrayBuffer,
    options: { httpMetadata: { contentType: string } },
  ) => Promise<void>;
  get: (key: string) => Promise<{ body: Uint8Array; httpMetadata: { contentType: string } } | null>;
};
let database: AppDatabase | undefined;
let assetStore: LocalAssets | undefined;
let config: RuntimeOptions | undefined;
export const bindings: Record<string, string> = {};
export function initializeRuntime(options: RuntimeOptions) {
  if (database) {
    // `bun test` runs every test FILE in one shared process, so a file that
    // forgets to close (or a thrown assertion jumping past close) would leak the
    // singleton into the next file, breaking it with "already initialized".
    // In test mode we tear the previous runtime down instead — the per-dataDir
    // schema already isolated its data, so nothing is lost.
    if (process.env.MAKEIN_TEST !== "1") throw Error("Local runtime already initialized.");
    closeCurrent();
  }
  mkdirSync(options.dataDir, { recursive: true, mode: 0o700 });
  const uploadDir = join(options.dataDir, "uploads");
  const s3Configured = !!(options.env.S3_ENDPOINT && options.env.S3_BUCKET && options.env.S3_ACCESS_KEY && options.env.S3_SECRET_KEY);
  if (!s3Configured) mkdirSync(uploadDir, { recursive: true, mode: 0o700 });
  const path = (key: string) => {
    if (!/^[a-f0-9-]+\.(png|jpg|webp)$/.test(key)) throw Error("無效的圖片ID。");
    return join(uploadDir, key);
  };
  const url = options.env.DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw Error("DATABASE_URL 未設定（SQLite 已移除，需提供 PostgreSQL 連線字串）。");
  // Test-mode schema isolation: in `bun test` each file/run gets a unique
  // dataDir, so derive a schema from it — the postgres equivalent of the old
  // per-test SQLite temp file. Production (no MAKEIN_TEST) stays on `public`.
  let schema = options.env.PG_SCHEMA || process.env.PG_SCHEMA;
  if (!schema && process.env.MAKEIN_TEST === "1") {
    let h = 0;
    for (const ch of options.dataDir) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    schema = "t_" + h.toString(16).padStart(8, "0");
  }
  database = new PostgresDatabase(url, schema);
  const s3 = s3Configured ? new S3Client({
    endpoint: options.env.S3_ENDPOINT,
    bucket: options.env.S3_BUCKET,
    accessKeyId: options.env.S3_ACCESS_KEY,
    secretAccessKey: options.env.S3_SECRET_KEY,
    region: options.env.S3_REGION || "auto",
  }) : undefined;
  assetStore = s3 ? {
    async put(key, data, options) {
      path(key);
      await s3.write(`uploads/${key}`, data, { type: options.httpMetadata.contentType });
    },
    async get(key) {
      path(key);
      const object = s3.file(`uploads/${key}`);
      if (await object.exists()) {
        const mime = key.endsWith(".png") ? "image/png" : key.endsWith(".jpg") ? "image/jpeg" : "image/webp";
        return { body: await object.bytes(), httpMetadata: { contentType: mime } };
      }
      const filename = join(options.projectDir ?? options.packageDir ?? options.dataDir, "content/assets", key);
      if (!existsSync(filename)) return null;
      const mime = key.endsWith(".png") ? "image/png" : key.endsWith(".jpg") ? "image/jpeg" : "image/webp";
      return { body: readFileSync(filename), httpMetadata: { contentType: mime } };
    },
  } : {
    async put(key, data) {
      writeFileSync(path(key), new Uint8Array(data), { flag: "wx", mode: 0o600 });
    },
    async get(key) {
      const filename = existsSync(path(key)) ? path(key) : join(options.projectDir??options.packageDir??options.dataDir,'content/assets',key);
      if (!existsSync(filename)) return null;
      const mime = key.endsWith(".png")
        ? "image/png"
        : key.endsWith(".jpg")
          ? "image/jpeg"
          : "image/webp";
      return { body: readFileSync(filename), httpMetadata: { contentType: mime } };
    },
  };
  config = options;
  Object.assign(bindings, options.env);
  return () => closeCurrent();
}
function closeCurrent() {
  void database?.close();
  database = undefined;
  assetStore = undefined;
  config = undefined;
  for (const key of Object.keys(bindings)) delete bindings[key];
}
export function db() {
  if (!database) throw Error("本機資料庫尚未初始化。");
  return database;
}
export function assets() {
  if (!assetStore) throw Error("本機圖片儲存尚未初始化。");
  return assetStore;
}
export function runtimeConfig() {
  if (!config) throw Error("本機伺服器尚未初始化。");
  return config;
}
