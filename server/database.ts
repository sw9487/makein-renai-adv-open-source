import { Database, type SQLQueryBindings } from "bun:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { SQL } from "bun";

export type QueryResult<T> = { rows: T[]; changes: number };
export interface DatabaseExecutor {
  query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<QueryResult<T>>;
}
export interface AppDatabase extends DatabaseExecutor {
  readonly dialect: "sqlite" | "postgres";
  prepare(sql: string): ReturnType<LocalDatabase["prepare"]>;
  transaction<T>(work: (tx: DatabaseExecutor) => Promise<T>): Promise<T>;
  ready(): Promise<void>;
  close(): void | Promise<void>;
}

/** Small prepared-statement adapter; game repositories do not depend on Bun APIs. */
export class LocalDatabase {
  readonly dialect = "sqlite" as const;
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
      `CREATE TABLE twitter_jobs (owner TEXT NOT NULL, run_id TEXT NOT NULL, job_id TEXT NOT NULL, value TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY(owner,run_id,job_id));
       CREATE INDEX idx_twitter_jobs_owner_run ON twitter_jobs(owner,run_id);
       CREATE TABLE line_threads (owner TEXT NOT NULL, run_id TEXT NOT NULL, character TEXT NOT NULL, value TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY(owner,run_id,character));
       CREATE TABLE character_memories (owner TEXT NOT NULL, run_id TEXT NOT NULL, character TEXT NOT NULL, value TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY(owner,run_id,character));
       CREATE TABLE twitter_posts (owner TEXT NOT NULL, run_id TEXT NOT NULL, post_id TEXT NOT NULL, value TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY(owner,run_id,post_id));
       CREATE TABLE game_logs (owner TEXT NOT NULL, run_id TEXT NOT NULL, value TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY(owner,run_id));`,
      `CREATE INDEX idx_harness_events_owner_created ON harness_events(owner,created);`,
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
  let text = sql.replace(/json_extract\(([^,]+),\s*'\$\.([A-Za-z0-9_]+)'\)/g,"($1::jsonb->>'$2')");
  text = text.replace(/\?/g, () => `$${++index}`);
  const ignored = /^\s*INSERT\s+OR\s+IGNORE\s+INTO/i.test(text);
  if (ignored) {
    text = text.replace(/INSERT\s+OR\s+IGNORE\s+INTO/i, "INSERT INTO");
    if (!/\bON\s+CONFLICT\b/i.test(text)) text += " ON CONFLICT DO NOTHING";
  }
  return text;
}

export class PostgresDatabase implements AppDatabase {
  readonly dialect = "postgres" as const;
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
      max: 10,
      connection: {
        TimeZone: "UTC",
        lock_timeout: "5s",
        idle_in_transaction_session_timeout: "10s",
        statement_timeout: "30s",
      },
      prepare: false,
      connectionTimeout: 10,
      idleTimeout: 30,
    });
    if (!existing) clients.set(url, this.client);
    this.initialized = this.migrate();
  }
  private async migrate() {
    await this.client.unsafe(`
      CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
      CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated BIGINT NOT NULL);
      CREATE TABLE IF NOT EXISTS transcripts (id TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, character TEXT NOT NULL, text TEXT NOT NULL, created BIGINT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_transcripts_owner ON transcripts(owner);
      CREATE TABLE IF NOT EXISTS harness_requests (owner TEXT NOT NULL, request_id TEXT NOT NULL, run_id TEXT NOT NULL, digest TEXT NOT NULL, status TEXT NOT NULL, result TEXT, code INTEGER, updated BIGINT NOT NULL, PRIMARY KEY(owner,request_id));
      CREATE INDEX IF NOT EXISTS idx_harness_requests_retention ON harness_requests(owner,status,updated);
      CREATE TABLE IF NOT EXISTS harness_events (seq BIGSERIAL PRIMARY KEY, owner TEXT NOT NULL, run_id TEXT NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL, created BIGINT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_harness_events_owner ON harness_events(owner,seq);
      CREATE INDEX IF NOT EXISTS idx_harness_events_owner_created ON harness_events(owner,created);
      CREATE TABLE IF NOT EXISTS twitter_jobs (owner TEXT NOT NULL, run_id TEXT NOT NULL, job_id TEXT NOT NULL, value TEXT NOT NULL, updated BIGINT NOT NULL, PRIMARY KEY(owner,run_id,job_id));
      CREATE INDEX IF NOT EXISTS idx_twitter_jobs_owner_run ON twitter_jobs(owner,run_id);
      CREATE TABLE IF NOT EXISTS line_threads (owner TEXT NOT NULL, run_id TEXT NOT NULL, character TEXT NOT NULL, value TEXT NOT NULL, updated BIGINT NOT NULL, PRIMARY KEY(owner,run_id,character));
      CREATE TABLE IF NOT EXISTS character_memories (owner TEXT NOT NULL, run_id TEXT NOT NULL, character TEXT NOT NULL, value TEXT NOT NULL, updated BIGINT NOT NULL, PRIMARY KEY(owner,run_id,character));
      CREATE TABLE IF NOT EXISTS twitter_posts (owner TEXT NOT NULL, run_id TEXT NOT NULL, post_id TEXT NOT NULL, value TEXT NOT NULL, updated BIGINT NOT NULL, PRIMARY KEY(owner,run_id,post_id));
      CREATE TABLE IF NOT EXISTS game_logs (owner TEXT NOT NULL, run_id TEXT NOT NULL, value TEXT NOT NULL, updated BIGINT NOT NULL, PRIMARY KEY(owner,run_id));

      DELETE FROM harness_requests
      WHERE status='succeeded' AND updated < (EXTRACT(EPOCH FROM clock_timestamp())*1000-43200000);

      WITH valid_games AS MATERIALIZED (
        SELECT key,value::jsonb AS state,updated FROM records
        WHERE key LIKE 'game:%' AND pg_input_is_valid(value,'jsonb')
      )
      INSERT INTO twitter_jobs(owner,run_id,job_id,value,updated)
      SELECT substring(r.key from 6),COALESCE(r.state->>'runId',''),job.key,job.value::text,r.updated
      FROM valid_games r CROSS JOIN LATERAL jsonb_each(COALESCE(r.state->'twitter'->'jobs','{}'::jsonb)) job
      ON CONFLICT(owner,run_id,job_id) DO NOTHING;

      WITH valid_games AS MATERIALIZED (
        SELECT key,value::jsonb AS state FROM records
        WHERE key LIKE 'game:%' AND pg_input_is_valid(value,'jsonb')
      )
      UPDATE records r SET value=(v.state #- '{twitter,jobs}')::text
      FROM valid_games v WHERE r.key=v.key AND v.state->'twitter' ? 'jobs';

      WITH valid_games AS MATERIALIZED (SELECT key,value::jsonb state,updated FROM records WHERE key LIKE 'game:%' AND pg_input_is_valid(value,'jsonb'))
      INSERT INTO line_threads(owner,run_id,character,value,updated)
      SELECT substring(r.key from 6),COALESCE(r.state->>'runId',''),item.key,item.value::text,r.updated
      FROM valid_games r CROSS JOIN LATERAL jsonb_each(COALESCE(r.state->'messages','{}'::jsonb)) item
      ON CONFLICT(owner,run_id,character) DO NOTHING;

      WITH valid_games AS MATERIALIZED (SELECT key,value::jsonb state,updated FROM records WHERE key LIKE 'game:%' AND pg_input_is_valid(value,'jsonb'))
      INSERT INTO character_memories(owner,run_id,character,value,updated)
      SELECT substring(r.key from 6),COALESCE(r.state->>'runId',''),item.key,item.value::text,r.updated
      FROM valid_games r CROSS JOIN LATERAL jsonb_each(COALESCE(r.state->'memories','{}'::jsonb)) item
      ON CONFLICT(owner,run_id,character) DO NOTHING;

      WITH valid_games AS MATERIALIZED (SELECT key,value::jsonb state,updated FROM records WHERE key LIKE 'game:%' AND pg_input_is_valid(value,'jsonb'))
      INSERT INTO twitter_posts(owner,run_id,post_id,value,updated)
      SELECT substring(r.key from 6),COALESCE(r.state->>'runId',''),item.key,item.value::text,r.updated
      FROM valid_games r CROSS JOIN LATERAL jsonb_each(COALESCE(r.state->'twitter'->'posts','{}'::jsonb)) item
      ON CONFLICT(owner,run_id,post_id) DO NOTHING;

      WITH valid_games AS MATERIALIZED (SELECT key,value::jsonb state,updated FROM records WHERE key LIKE 'game:%' AND pg_input_is_valid(value,'jsonb'))
      INSERT INTO game_logs(owner,run_id,value,updated)
      SELECT substring(key from 6),COALESCE(state->>'runId',''),COALESCE(state->'log','[]'::jsonb)::text,updated FROM valid_games
      ON CONFLICT(owner,run_id) DO NOTHING;

      WITH valid_games AS MATERIALIZED (
        SELECT key,value::jsonb AS state FROM records
        WHERE key LIKE 'game:%' AND pg_input_is_valid(value,'jsonb')
      )
      UPDATE records r SET value=(((v.state-'messages')-'memories')-'log' #- '{twitter,posts}')::text
      FROM valid_games v WHERE r.key=v.key;

      WITH current_games AS MATERIALIZED (
        SELECT substring(key from 6) owner,state->>'runId' run_id,state->>'date' game_date,
          CASE WHEN state->>'phase' ~ '^\\d+$' THEN (state->>'phase')::int ELSE 99 END game_phase
        FROM (SELECT key,value::jsonb state FROM records WHERE key LIKE 'game:%' AND pg_input_is_valid(value,'jsonb')) games
      )
      UPDATE twitter_jobs jobs SET
        value=jsonb_set(jobs.value::jsonb,'{posts}','[]'::jsonb)::text,
        updated=GREATEST(jobs.updated,(EXTRACT(EPOCH FROM clock_timestamp())*1000)::bigint)
      FROM current_games game
      WHERE jobs.owner=game.owner AND jobs.run_id=game.run_id
        AND jobs.value::jsonb->>'status'='done'
        AND (
          jobs.job_id<>concat(jobs.value::jsonb->>'date',':',jobs.value::jsonb->>'phase',':',jobs.value::jsonb->>'actor')
          OR jobs.value::jsonb->>'date'<game.game_date
          OR (jobs.value::jsonb->>'date'=game.game_date AND
            CASE WHEN jobs.value::jsonb->>'phase' ~ '^\\d+$' THEN (jobs.value::jsonb->>'phase')::int ELSE 99 END<game.game_phase)
        );
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
