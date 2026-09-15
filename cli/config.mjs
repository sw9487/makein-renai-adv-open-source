import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
const keys = ["SD_ENABLED", "SD_AUTO_STORY", "SD_API_URL", "SD_API_KEY", "AI_API_URL", "AI_API_KEY", "AI_MODEL", "EDITOR_PASSWORD", "DATABASE_URL", "S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY", "S3_REGION", "HOST"];
export function parseEnv(text) {
  /** @type {Record<string,string>} */
  const result = {};
  for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (!match || !keys.includes(match[1])) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "").trim();
    result[match[1]] = value;
  }
  return result;
}
export function initializeConfig(options, environment = process.env, cwd = process.cwd()) {
  mkdirSync(options.dataDir, { recursive: true, mode: 0o700 });
  const configFile = join(options.dataDir, ".env");
  if (!existsSync(configFile))
    writeFileSync(
      configFile,
      "# OpenAI-compatible Chat Completions API\nAI_API_URL=\nAI_API_KEY=\nAI_MODEL=\n",
      { flag: "wx", mode: 0o600 },
    );
  const files = [configFile, options.envFile ?? join(cwd, ".env")];
  if (options.envFile && !existsSync(options.envFile))
    throw Error(`找不到指定的 env 檔案：${options.envFile}`);
  const values = {};
  for (const file of [...new Set(files)])
    if (existsSync(file)) Object.assign(values, parseEnv(readFileSync(file, "utf8")));
  for (const key of keys) if (environment[key] !== undefined) values[key] = environment[key];
  try {
    chmodSync(configFile, 0o600);
  } catch {}
  return { env: values, configFile };
}
