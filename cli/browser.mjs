import { spawn } from "node:child_process";
export function browserCommand(url, platform = process.platform) {
  if (!/^http:\/\/localhost:\d+\/$/.test(url)) throw Error("Unexpected browser URL.");
  if (platform === "win32") return ["rundll32.exe", ["url.dll,FileProtocolHandler", url]];
  if (platform === "darwin") return ["open", [url]];
  return ["xdg-open", [url]];
}
export async function openBrowser(url, launch = spawn) {
  const [command, args] = browserCommand(url);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (!settled) {
        settled = true;
        resolve(ok);
      }
    };
    try {
      const child = launch(command, args, { stdio: "ignore", windowsHide: true, detached: true });
      child.once("error", () => finish(false));
      child.once("exit", (code) => finish(code === 0));
      child.once("spawn", () => {
        child.unref();
        const timer = setTimeout(() => finish(true), 1200);
        timer.unref();
      });
    } catch {
      finish(false);
    }
  });
}
