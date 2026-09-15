import { join } from "node:path";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { LocalDatabase, PostgresDatabase, type AppDatabase } from "./database";
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
  if (database) throw Error("Local runtime already initialized.");
  mkdirSync(options.dataDir, { recursive: true, mode: 0o700 });
  const uploadDir = join(options.dataDir, "uploads");
  const s3Configured = !!(options.env.S3_ENDPOINT && options.env.S3_BUCKET && options.env.S3_ACCESS_KEY && options.env.S3_SECRET_KEY);
  if (!s3Configured) mkdirSync(uploadDir, { recursive: true, mode: 0o700 });
  const path = (key: string) => {
    if (!/^[a-f0-9-]+\.(png|jpg|webp)$/.test(key)) throw Error("無效的圖片ID。");
    return join(uploadDir, key);
  };
  database = options.env.DATABASE_URL
    ? new PostgresDatabase(options.env.DATABASE_URL)
    : new LocalDatabase(join(options.dataDir, "game.sqlite"));
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
  return () => {
    void database?.close();
    database = undefined;
    assetStore = undefined;
    config = undefined;
    for (const key of Object.keys(bindings)) delete bindings[key];
  };
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
