// Drops the leftover `t_` schemas that accumulate in the dedicated test postgres.
// The test bootstrap can't sweep them itself because `bun test` runs files in
// parallel across processes and a drop would race a still-running sibling.
// Run this between test runs:
//   bun scripts/drop-test-schemas.ts
const url = process.env.DATABASE_URL || "postgresql://admin:105114@127.0.0.1:5450/MAKEIN_TEST_DB";
const { SQL } = await import("bun");
const sql = new SQL(url, { prepare: false, connectionTimeout: 10 });
const rows = await sql.unsafe<{ nspname: string }[]>(
  "SELECT nspname FROM pg_namespace WHERE nspname LIKE 't\\_%' ESCAPE '\\' ORDER BY nspname",
);
for (const row of rows) {
  await sql.unsafe(`DROP SCHEMA IF EXISTS "${row.nspname}" CASCADE`).catch(() => {});
  console.log("dropped", row.nspname);
}
await sql.end();
console.log(`done (${rows.length} schemas)`);