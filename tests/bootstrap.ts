// Test bootstrap: runs once per test FILE process (see bunfig.toml [test].preload).
// The app has dropped SQLite, so every `bun test` run needs a PostgreSQL
// DATABASE_URL. Each test file (and each unique dataDir) is isolated in its own
// `t_` schema, so parallel test files never share rows.
//
// Do NOT sweep `t_` schemas here: `bun test` runs test files in parallel in
// separate processes, and dropping schemas would tear the tables out from under
// a still-running sibling process. Leftover `t_` schemas accumulate in the
// dedicated test DB by design; run `scripts/drop-test-schemas.ts` (or
// `DROP SCHEMA ... CASCADE` on them) if the volume ever matters.
//
// Default points at the dedicated test container: `docker compose -f compose.test.yaml up -d`.
// Override with MAKEIN_TEST_DATABASE_URL (or DATABASE_URL) if you run your own.
const fallback = "postgresql://admin:105114@127.0.0.1:5450/MAKEIN_TEST_DB";
process.env.MAKEIN_TEST = "1";
process.env.DATABASE_URL ||= process.env.MAKEIN_TEST_DATABASE_URL || fallback;