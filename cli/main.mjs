import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseOptions, help } from "./options.mjs";
import { initializeConfig } from "./config.mjs";
import { openBrowser } from "./browser.mjs";
import {cliText} from './i18n.mjs';
const root = new URL("../", import.meta.url);
export async function main(args = process.argv.slice(2)) {
  try {
    if (typeof Bun === "undefined")
      throw Error("需要 Bun 1.3 以上。請先安裝或更新 Bun。");
    const [major, minor] = Bun.version.split(".").map(Number);
    if (major < 1 || (major === 1 && minor < 3)) throw Error("請將 Bun 更新到1.3以上。");
    const options = parseOptions(args);
    const manifest = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
    if (options.help) {
      console.log(cliText(help));
      return;
    }
    if (options.version) {
      console.log(manifest.version);
      return;
    }
    const projectDir = existsSync(new URL("core/engine.ts", root))
      ? fileURLToPath(root)
      : undefined;

    const entry = new URL("dist/server.mjs", root);
    const clientDir = fileURLToPath(new URL("dist/client", root));
    if (!existsSync(entry) || !existsSync(new URL("dist/client/index.html", root)))
      throw Error(
        "找不到已建置的遊戲。原始碼開發請先執行 bun run build；安裝套件則請重新安裝完整版本。",
      );
    const config = initializeConfig(options);
    const { startServer } = await import(entry.href);
    let app;
    try {
      app = startServer({
        ...options,
        ...config,
        clientDir,
        packageDir: fileURLToPath(root),
        projectDir,
        version: manifest.version,
        hostname: config.env.HOST,
      });
    } catch (error) {
      if (error?.code === "EADDRINUSE")
        throw Error(
          `Port ${options.port} 已被占用。請先關閉該服務，或使用 --port 指定其他連接埠。`,
        );
      throw error;
    }
    const url = `http://localhost:${options.port}/`;
    let stopping = false;
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      console.log(cliText("\n正在保存並關閉本機遊戲…"));
      await app.stop();
      process.exitCode = 0;
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    // Verify the real API before opening the browser, not just the listening socket.
    const ready = await fetch(`http://127.0.0.1:${options.port}/api/health`, {
      timeout: false,
    }).catch(() => null);
    if (!ready?.ok) {
      await app.stop();
      throw Error("本機服務未能通過啟動檢查。");
    }
    console.log(cliText(
      `\n負けヒロイン・放課後日記 v${manifest.version}\n\n遊戲：${url}\nEditor：${url}editor\n資料：${options.dataDir}\n設定：${config.configFile}\n\nCtrl+C 停止；存檔、角色記憶與設定會保留。\n`,
    ));
    if (options.open && !(await openBrowser(url)))
      console.log(cliText("無法自動開啟瀏覽器，請點選上方遊戲網址。"));
  } catch (error) {
    console.error(cliText("啟動失敗：") + cliText(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}
