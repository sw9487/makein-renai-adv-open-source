// Flatten existing Twitter reply chains in Postgres to at most one level.
// Every reply's `replyTo` is re-anchored to its thread root, matching the
// applyTwitterDecision behaviour at server/twitter.ts (line 119-122):
//   root = twitterRoot(t, p)   // topmost reachable post, orphan-safe
//   replyTo = root.id
//
// Twitter posts are split into twitter_posts (owner, run_id, post_id, value),
// populated by syncMap in server/repository.ts. This migration:
//   1) reads every twitter_posts row,
//   2) for each reply whose target is itself a reply, re-anchors replyTo to the
//      thread root,
//   3) writes only the rows whose JSON actually changed,
//   4) backs up every original value into a twitter_posts_flatten_backup table.
//
// Uses Bun's built-in `SQL` driver (same as server/database.ts PostgresDatabase),
// so no external package is required.
// Run:  bun scripts/flatten-twitter-replies-pg.ts [DATABASE_URL]
import { SQL } from "bun";

const url =
  process.argv[2] ?? "postgresql://admin:105114@127.0.0.1:5438/MAKEIN_DB";
const sql = new SQL(url);

// Exact clone of server/twitter.ts twitterRoot(), plus an extra cycle guard.
function rootOf(posts: Map<string, any>, post: any): any {
  let root = post, guard = 0;
  while (root.replyTo && posts.get(root.replyTo) && guard++ < 200) root = posts.get(root.replyTo);
  return root;
}

await sql.unsafe(`
  CREATE TABLE IF NOT EXISTS twitter_posts_flatten_backup (
    owner text NOT NULL, run_id text NOT NULL, post_id text NOT NULL,
    value text NOT NULL, updated bigint NOT NULL,
    PRIMARY KEY (owner, run_id, post_id)
  )
`);

const rows = await sql.unsafe<{ owner: string; run_id: string; post_id: string; value: string }[]>(
  "SELECT owner, run_id, post_id, value FROM twitter_posts"
);

// Group posts by (owner, run_id) so root lookups stay within one game thread.
const byKey = new Map<string, { owner: string; run_id: string; posts: Map<string, any>; items: any[] }>();
for (const r of rows) {
  const k = r.owner + "|" + r.run_id;
  let group = byKey.get(k);
  if (!group) { group = { owner: r.owner, run_id: r.run_id, posts: new Map(), items: [] }; byKey.set(k, group); }
  let post: any;
  try { post = JSON.parse(r.value); } catch { continue; }
  group.posts.set(r.post_id, post);
  group.items.push({ post_id: r.post_id, value: r.value, post });
}

let flattened = 0, orphanKept = 0, groups = 0, changedRows = 0;

for (const group of byKey.values()) {
  groups++;
  const { owner, run_id, posts } = group;
  // Determine every reply whose target is itself a reply and needs re-anchoring.
  const newTargets = new Map<string, string>();
  for (const { post_id, post } of group.items) {
    if (!post.replyTo || !posts.get(post.replyTo)) continue; // root post, or orphaned pointer
    const root = rootOf(posts, post);
    if ((root as any).id === post_id) { orphanKept++; continue; } // unresolvable chain
    if ((root as any).id !== post.replyTo) newTargets.set(post_id, (root as any).id);
  }
  if (!newTargets.size) continue;

  for (const item of group.items) {
    const newId = newTargets.get(item.post_id);
    if (!newId) continue;
    const value = JSON.stringify({ ...item.post, replyTo: newId });
    if (value === item.value) continue;
    await sql.unsafe(
      `INSERT INTO twitter_posts_flatten_backup(owner,run_id,post_id,value,updated)
       VALUES($1,$2,$3,$4,$5) ON CONFLICT(owner,run_id,post_id) DO NOTHING`,
      [owner, run_id, item.post_id, item.value, Date.now()]
    );
    await sql.unsafe(
      `UPDATE twitter_posts SET value=$1, updated=$2 WHERE owner=$3 AND run_id=$4 AND post_id=$5`,
      [value, Date.now(), owner, run_id, item.post_id]
    );
    flattened++; changedRows++;
  }
}

await sql.end();
console.log(JSON.stringify({ groups, changedRows, flattened, orphanKept, backupTable: "twitter_posts_flatten_backup" }, null, 2));