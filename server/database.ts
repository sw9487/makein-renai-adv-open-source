import postgres from "postgres";
const QUERY_TIMEOUT = Symbol("makeine-postgres-query-timeout");
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(QUERY_TIMEOUT), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// The client object of postgres.js. `ReturnType<typeof postgres>` avoids needing
// to import the namespace-internal `Sql` type directly.
type Sql = ReturnType<typeof postgres>;
type TransactionSql = Parameters<Parameters<Sql["begin"]>[1]>[0];

export type QueryResult<T> = { rows: T[]; changes: number };
export interface DatabaseExecutor {
  query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<QueryResult<T>>;
}
export interface BoundStatement {
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface PreparedStatement extends BoundStatement {
  bind(...values: unknown[]): BoundStatement;
}
export interface AppDatabase extends DatabaseExecutor {
  readonly dialect: "postgres";
  prepare(sql: string): PreparedStatement;
  transaction<T>(work: (tx: DatabaseExecutor) => Promise<T>): Promise<T>;
  ready(): Promise<void>;
  close(): void | Promise<void>;
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
  private client: Sql;
  private readonly initialized: Promise<void>;
  private readonly schema?: string;
  private readonly url: string;
  private readonly cacheKey: string;
  constructor(url: string, schema?: string) {
    // Match copilot-v2's process-wide pool: hot reloads and repeated runtime
    // initialization must not create another independent set of connections.
    // The schema is part of the cache key so parallel test files (each with
    // its own schema/search_path) never share connections with each other.
    const cacheKey = schema ? `${url}#schema=${schema}` : url;
    const globalForDb = globalThis as typeof globalThis & {
      __makeinePostgresClients?: Map<string, Sql>;
    };
    const clients = globalForDb.__makeinePostgresClients ??= new Map();
    const existing = clients.get(cacheKey);
    this.url = url;
    this.cacheKey = cacheKey;
    this.schema = schema;
    this.client = existing ?? this.makeClient();
    if (!existing) clients.set(cacheKey, this.client);
    this.initialized = this.migrate();
  }
  private makeClient(): Sql {
    const connection: Record<string, string | number | boolean> = {
      application_name: "makeine",
      TimeZone: "UTC",
      lock_timeout: "5s",
      idle_in_transaction_session_timeout: "10s",
      statement_timeout: "30s",
    };
    if (this.schema) connection.search_path = this.schema;
    return postgres(this.url, {
      max: 3,
      connection,
      prepare: false,
      connect_timeout: 10,
      idle_timeout: 30,
      // postgres.js returns BIGINT (int8) as a string by default; this app uses
      // the `updated` revision column (Date.now()) and row counts as JS numbers,
      // so parse int8 back into a number for a consistent API with SQLite.
      types: { int8: { from: [20], to: 20, parse: (v: string) => Number(v), serialize: (v: number) => String(v) } },
    });
  }
  private async reconnect(): Promise<void> {
    // Best-effort close of the desynced client; it may be mid-protocol so do not
    // await it. A fresh pool with the same schema/search_path replaces it.
    try { void this.client.end(); } catch { /* already closed */ }
    this.client = this.makeClient();
    const globalForDb = globalThis as typeof globalThis & {
      __makeinePostgresClients?: Map<string, Sql>;
    };
    globalForDb.__makeinePostgresClients?.set(this.cacheKey, this.client);
  }
  private async guard<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await withTimeout(op(), 2000);
    } catch (e) {
      if (e !== QUERY_TIMEOUT) throw e;
      await this.reconnect();
      return await op();
    }
  }
  private async migrate() {
    if (this.schema) {
      if (!/^[a-z0-9_]{1,63}$/.test(this.schema)) throw Error("無效的資料庫 schema。");
      await this.client.unsafe(`CREATE SCHEMA IF NOT EXISTS ${this.schema}`);
    }
    await this.client.unsafe(`
      CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated BIGINT NOT NULL);
      CREATE TABLE IF NOT EXISTS transcripts (id TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, character TEXT NOT NULL, text TEXT NOT NULL, created BIGINT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_transcripts_owner ON transcripts(owner);
      CREATE TABLE IF NOT EXISTS harness_requests (owner TEXT NOT NULL, request_id TEXT NOT NULL, run_id TEXT NOT NULL, digest TEXT NOT NULL, status TEXT NOT NULL, result TEXT, code INTEGER, updated BIGINT NOT NULL, PRIMARY KEY(owner,request_id));
      CREATE INDEX IF NOT EXISTS idx_harness_requests_retention ON harness_requests(owner,status,updated);
      CREATE TABLE IF NOT EXISTS harness_events (seq BIGSERIAL PRIMARY KEY, owner TEXT NOT NULL, run_id TEXT NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL, created BIGINT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_harness_events_owner ON harness_events(owner,seq);
      CREATE INDEX IF NOT EXISTS idx_harness_events_owner_created ON harness_events(owner,created);
      WITH ranked_events AS (
        SELECT seq,ROW_NUMBER() OVER(PARTITION BY owner ORDER BY seq DESC) AS position FROM harness_events
      )
      DELETE FROM harness_events events USING ranked_events ranked
      WHERE events.seq=ranked.seq AND (events.created < EXTRACT(EPOCH FROM clock_timestamp())*1000-86400000 OR ranked.position>2000);
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
    const rows = await this.guard(() => this.client.unsafe(postgresSql(sql), values as any[])) as T[] & { count?: number };
    return { rows: Array.from(rows), changes: rows.count ?? rows.length };
  }
  prepare(sql: string): PreparedStatement {
    const bound = (values: unknown[]): BoundStatement => ({
      first: async <T>(): Promise<T | null> => (await this.query<T>(sql, values)).rows[0] ?? null,
      run: async () => ({ meta: { changes: (await this.query(sql, values)).changes } }),
    });
    return { bind: (...values: unknown[]) => bound(values), ...bound([]) };
  }
  async transaction<T>(work: (tx: DatabaseExecutor) => Promise<T>): Promise<T> {
    await this.initialized;
    return this.guard(() => this.client.begin(async (sql: TransactionSql) => work({ query: async <R>(text: string, values: unknown[] = []) => {
      const rows = await sql.unsafe(postgresSql(text), values as any[]) as R[] & { count?: number };
      return { rows: Array.from(rows), changes: rows.count ?? rows.length };
    }})) as Promise<T>);
  }
  // The process-wide pool deliberately survives runtime/hot-reload teardown.
  // Bun closes it when the process exits, just like copilot-v2's postgres-js pool.
  // This is why we do NOT call client.end() here: `bun test` runs files serially
  // in one shared process, and ending a client while the pool still has queued
  // work throws "Connection closed". Per-schema clients are bounded by the test
  // postgres max_connections (see compose.test.yaml) and swept by
  // scripts/drop-test-schemas.ts.
  close() {}
}
