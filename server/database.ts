import { Database, type SQLQueryBindings } from "bun:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { SQL } from "bun";

export type QueryResult<T> = { rows: T[]; changes: number };
export interface DatabaseExecutor {
  query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<QueryResult<T>>;
}
export interface AppDatabase extends DatabaseExecutor {
  prepare(sql: string): ReturnType<LocalDatabase["prepare"]>;
  transaction<T>(work: (tx: DatabaseExecutor) => Promise<T>): Promise<T>;
  ready(): Promise<void>;
  close(): void | Promise<void>;
}

/** Small prepared-statement adapter; game repositories do not depend on Bun APIs. */
export class LocalDatabase {
  readonly sqlite: Database;
  private transactionQueue: Promise<void> = Promise.resolve();
  constructor(filename: string) {
    mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.sqlite = new Database(filename, { create: true, strict: true });
    try {
      chmodSync(filename, 0o600);
    } catch {
      /* Windows ACLs are inherited. */
    }
    this.sqlite.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
    this.migrate();
  }
  private migrate() {
    const migrations = [
      `CREATE TABLE records (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated INTEGER NOT NULL);
       CREATE TABLE transcripts (id TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, character TEXT NOT NULL, text TEXT NOT NULL, created INTEGER NOT NULL);
       CREATE INDEX idx_transcripts_owner ON transcripts(owner);`,
      `CREATE TABLE harness_requests (owner TEXT NOT NULL, request_id TEXT NOT NULL, run_id TEXT NOT NULL, digest TEXT NOT NULL, status TEXT NOT NULL, result TEXT, code INTEGER, updated INTEGER NOT NULL, PRIMARY KEY(owner,request_id));
       CREATE TABLE harness_events (seq INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, run_id TEXT NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL, created INTEGER NOT NULL);
       CREATE INDEX idx_harness_events_owner ON harness_events(owner,seq);`,
    ];
    this.sqlite.transaction(() => {
      const version = (this.sqlite.query("PRAGMA user_version").get() as { user_version: number })
        .user_version;
      if (version > migrations.length)
        throw new Error("資料庫由較新版本建立，請更新套件後再啟動。");
      for (let i = version; i < migrations.length; i++) {
        this.sqlite.exec(migrations[i]);
        this.sqlite.exec(`PRAGMA user_version=${i + 1}`);
      }
    })();
  }
  prepare(sql: string) {
    const query = this.sqlite.query(sql);
    const bound = (values: SQLQueryBindings[]) => ({
      first: async <T>(): Promise<T | null> => query.get(...values) as T | null,
      run: async () => {
        const result = query.run(...values);
        return { meta: { changes: result.changes } };
      },
    });
    return { bind: (...values: SQLQueryBindings[]) => bound(values), ...bound([]) };
  }
  async query<T = Record<string, unknown>>(sql: string, values: unknown[] = []): Promise<QueryResult<T>> {
    const statement = this.sqlite.query(sql);
    if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) {
      const rows=statement.all(...values as SQLQueryBindings[]) as T[];
      return { rows, changes: rows.length };
    }
    const result = statement.run(...values as SQLQueryBindings[]);
    return { rows: [], changes: result.changes };
  }
  async transaction<T>(work: (tx: DatabaseExecutor) => Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.transactionQueue;
    this.transactionQueue = new Promise<void>(resolve => { release = resolve; });
    await previous;
    this.sqlite.exec("BEGIN IMMEDIATE");
    try { const result = await work(this); this.sqlite.exec("COMMIT"); return result; }
    catch (error) { this.sqlite.exec("ROLLBACK"); throw error; }
    finally { release(); }
  }
  async ready() {}
  close() {
    this.sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    this.sqlite.close();
  }
}

function postgresSql(sql: string) {
  let index = 0;
  let text = sql.replace(/\?/g, () => `$${++index}`);
  const ignored = /^\s*INSERT\s+OR\s+IGNORE\s+INTO/i.test(text);
  if (ignored) {
    text = text.replace(/INSERT\s+OR\s+IGNORE\s+INTO/i, "INSERT INTO");
    if (!/\bON\s+CONFLICT\b/i.test(text)) text += " ON CONFLICT DO NOTHING";
  }
  return text;
}

export class PostgresDatabase implements AppDatabase {
  private readonly client: SQL;
  private readonly initialized: Promise<void>;
  constructor(url: string) {
    // Match copilot-v2's process-wide pool: hot reloads and repeated runtime
    // initialization must not create another independent set of connections.
    const globalForDb = globalThis as typeof globalThis & {
      __makeinePostgresClients?: Map<string, SQL>;
    };
    const clients = globalForDb.__makeinePostgresClients ??= new Map();
    const existing = clients.get(url);
    this.client = existing ?? new SQL(url, {
      max: 30,
      connection: { TimeZone: "UTC" },
      prepare: false,
      connectionTimeout: 10,
      idleTimeout: 30,
    });
    if (!existing) clients.set(url, this.client);
    this.initialized = this.migrate();
  }
  private async migrate() {
    await this.client.unsafe(`
      CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated BIGINT NOT NULL);
      CREATE TABLE IF NOT EXISTS transcripts (id TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, character TEXT NOT NULL, text TEXT NOT NULL, created BIGINT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_transcripts_owner ON transcripts(owner);
      CREATE TABLE IF NOT EXISTS harness_requests (owner TEXT NOT NULL, request_id TEXT NOT NULL, run_id TEXT NOT NULL, digest TEXT NOT NULL, status TEXT NOT NULL, result TEXT, code INTEGER, updated BIGINT NOT NULL, PRIMARY KEY(owner,request_id));
      CREATE TABLE IF NOT EXISTS harness_events (seq BIGSERIAL PRIMARY KEY, owner TEXT NOT NULL, run_id TEXT NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL, created BIGINT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_harness_events_owner ON harness_events(owner,seq);
    `);
  }
  ready() { return this.initialized; }
  async query<T = Record<string, unknown>>(sql: string, values: unknown[] = []): Promise<QueryResult<T>> {
    await this.initialized;
    const rows = await this.client.unsafe(postgresSql(sql), values) as T[] & { count?: number };
    return { rows: Array.from(rows), changes: rows.count ?? rows.length };
  }
  prepare(sql: string) {
    const bound = (values: unknown[]) => ({
      first: async <T>(): Promise<T | null> => (await this.query<T>(sql, values)).rows[0] ?? null,
      run: async () => ({ meta: { changes: (await this.query(sql, values)).changes } }),
    });
    return { bind: (...values: unknown[]) => bound(values), ...bound([]) };
  }
  async transaction<T>(work: (tx: DatabaseExecutor) => Promise<T>): Promise<T> {
    await this.initialized;
    return this.client.begin(async sql => work({ query: async <R>(text: string, values: unknown[] = []) => {
      const rows = await sql.unsafe(postgresSql(text), values) as R[] & { count?: number };
      return { rows: Array.from(rows), changes: rows.count ?? rows.length };
    }}));
  }
  // The process-wide pool deliberately survives runtime/hot-reload teardown.
  // Bun closes it when the process exits, just like copilot-v2's postgres-js pool.
  close() {}
}
