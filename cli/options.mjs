import { resolve, join } from "node:path";
import { homedir } from "node:os";
export function parseOptions(args, env = process.env, cwd = process.cwd()) {
  const result = {
    port: 9487,
    dataDir: resolve(cwd, env.MAKEIN_DATA_DIR || join(homedir(), ".makein-renai-adv")),
    open: true,
    envFile: undefined,
    help: false,
    version: false,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") result.help = true;
    else if (arg === "--version" || arg === "-v") result.version = true;
    else if (arg === "--no-open") result.open = false;
    else if (["--port", "--data-dir", "--env-file"].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw Error(`${arg} 需要一個值。`);
      if (arg === "--port") {
        if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535)
          throw Error("Port 必須是1–65535的整數。");
        result.port = Number(value);
      } else if (arg === "--data-dir") result.dataDir = resolve(cwd, value);
      else result.envFile = resolve(cwd, value);
    } else throw Error(`未知參數：${arg}。使用 --help 查看用法。`);
  }
  return result;
}
export const help = `負けヒロイン・放課後日記

Usage: bun run start -- [options]

  --port <number>     本機連接埠（預設9487）
  --data-dir <path>   存檔、設定與上傳圖片（預設 ~/.makein-renai-adv）
  --env-file <path>   指定 .env（預設讀取目前目錄與資料夾內的 .env）
  --no-open          不自動開啟瀏覽器
  --help, -h         顯示說明
  --version, -v      顯示版本

僅監聽本機127.0.0.1，不需要雲端帳號。Ctrl+C 停止。
遊戲：http://localhost:9487/  Editor：http://localhost:9487/editor
`;
