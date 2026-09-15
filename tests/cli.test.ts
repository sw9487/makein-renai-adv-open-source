import { test, expect } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseOptions } from "../cli/options.mjs";
import { parseEnv, initializeConfig } from "../cli/config.mjs";
import { browserCommand } from "../cli/browser.mjs";
test("CLI defaults, explicit data paths, and invalid ports", () => {
  const d = parseOptions([], {}, "/project");
  expect(d.port).toBe(9487);
  expect(d.open).toBe(true);
  expect(
    parseOptions(["--port", "9876", "--no-open", "--data-dir", "saved"], {}, process.cwd()),
  ).toMatchObject({ port: 9876, open: false, dataDir: resolve("saved") });
  for (const value of ["0", "65536", "NaN", "9.5", "-2"])
    expect(() => parseOptions(["--port", value])).toThrow();
  expect(() => parseOptions(["--data-dir"])).toThrow();
  expect(() => parseOptions(["--host", "0.0.0.0"])).toThrow();
});
test("config preserves existing values and never executes env input", () => {
  const dir = mkdtempSync(join(tmpdir(), "makein-config-"));
  try {
    const data = join(dir, "data");
    const envFile = join(dir, ".env");
    writeFileSync(
      envFile,
      'AI_API_URL="https://api.example/v1"\nAI_API_KEY=private # comment\nAI_MODEL=$(whoami)\nOTHER=ignore\n',
    );
    const result = initializeConfig({ dataDir: data, envFile }, { AI_MODEL: "override" }, dir);
    expect(result.env).toMatchObject({
      AI_API_URL: "https://api.example/v1",
      AI_API_KEY: "private",
      AI_MODEL: "override",
    });
    expect("OTHER" in result.env).toBe(false);
    const original = readFileSync(join(data, ".env"), "utf8");
    initializeConfig({ dataDir: data }, {}, data);
    expect(readFileSync(join(data, ".env"), "utf8")).toBe(original);
    expect(parseEnv("AI_MODEL=$(whoami)").AI_MODEL).toBe("$(whoami)");
  } finally {
    rmSync(dir, { recursive: true });
  }
});
test("browser launch is a fixed command with unambiguous URL argument", () => {
  expect(browserCommand("http://localhost:9487/", "win32")).toEqual([
    "rundll32.exe",
    ["url.dll,FileProtocolHandler", "http://localhost:9487/"],
  ]);
  expect(browserCommand("http://localhost:9487/", "darwin")[0]).toBe("open");
  expect(browserCommand("http://localhost:9487/", "linux")[0]).toBe("xdg-open");
  expect(() => browserCommand("https://evil.example/")).toThrow();
});
