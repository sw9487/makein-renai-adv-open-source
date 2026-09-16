import { test, expect, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultContent } from "../core/content";
import { validateContent } from "../server/validation";
import { initializeRuntime } from "../server/runtime";
import { sourceContent } from "../server/repository";
import { PostgresDatabase } from "../server/database";

const TEST_URL = "postgresql://admin:105114@127.0.0.1:5450/MAKEIN_TEST_DB";

test("Postgres persistence, compare-and-swap and reconnect preserve saved data", async () => {
  const schema = "t_database_" + Math.random().toString(36).slice(2, 10);
  let db: PostgresDatabase | undefined;
  try {
    db = new PostgresDatabase(TEST_URL, schema);
    await db.prepare("INSERT INTO records(key,value,updated) VALUES(?,?,?)").bind("game", "v1", 1).run();
    expect((await db.prepare("UPDATE records SET value=? WHERE key=? AND value=?").bind("v2", "game", "v1").run()).meta.changes).toBe(1);
    expect((await db.prepare("UPDATE records SET value=? WHERE key=? AND value=?").bind("wrong", "game", "v1").run()).meta.changes).toBe(0);
    // Reconnect (fresh client/connection) and confirm the row survives.
    db.close();
    db = new PostgresDatabase(TEST_URL, schema);
    expect(await db.prepare("SELECT value FROM records WHERE key=?").bind("game").first<{ value: string }>()).toEqual({ value: "v2" });
  } finally {
    db?.close();
    // Leftover `t_` schemas are swept by tests/bootstrap.ts on the next run.
  }
});

test("content validation drops unknown private keys and rejects malformed references", () => {
  const content = structuredClone(defaultContent) as typeof defaultContent & { apiKey?: string };
  content.apiKey = "do-not-publish";
  expect("apiKey" in validateContent(content)).toBe(false);
  content.places[0].weights.anna = -1;
  expect(() => validateContent(content)).toThrow();
});

test("source content accepts a UTF-8 BOM", () => {
  const dir = mkdtempSync(join(tmpdir(), "makein-content-bom-"));
  mkdirSync(join(dir, "content"), { recursive: true });
  writeFileSync(join(dir, "content/game.json"), "\uFEFF" + JSON.stringify(defaultContent));
  const close = initializeRuntime({ dataDir: join(dir, "data"), projectDir: dir, port: 9487, env: { DATABASE_URL: TEST_URL } });
  try {
    expect(sourceContent().settings.town).toBe(defaultContent.settings.town);
  } finally {
    close();
    rmSync(dir, { recursive: true });
  }
});