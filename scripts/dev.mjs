import "./build.mjs";
import { startServer } from "../server/http.ts";
import { parseOptions } from "../cli/options.mjs";
import { initializeConfig } from "../cli/config.mjs";
import { fileURLToPath } from "node:url";
const options = parseOptions(["--no-open", ...process.argv.slice(2)]);
const app = startServer({
  ...options,
  ...initializeConfig(options),
  clientDir: fileURLToPath(new URL("../dist/client", import.meta.url)),
  packageDir: fileURLToPath(new URL("../", import.meta.url)),
  projectDir: fileURLToPath(new URL("../", import.meta.url)),
  version: "0.1.0",
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await app.stop();
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
console.log("Development UI and API: http://127.0.0.1:" + options.port);
