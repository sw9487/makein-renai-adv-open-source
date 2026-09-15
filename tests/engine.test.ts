import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultContent } from "../core/content.ts";
import {
  act,
  createGame,
  grade,
  schoolTime,
  weightedPick,
  getEnding,
  compactMemory,
  emptyMemory,
  tick,
  eventEligible,
} from "../core/engine.ts";
const config = () => structuredClone(defaultContent);
function ready() {
  const c = config();
  return { c, s: act(createGame(c, 42), c, { type: "choose", index: 0 }) };
}
test("opening is an enforced canonical-inspired choice with bounded affection", () => {
  const c = config();
  const s = createGame(c, 42);
  assert.equal(s.date, "2026-07-13");
  assert.equal(s.dialogue.eventId, "anna-first");
  assert.throws(() => act(s, c, { type: "advance" }));
  const next = act(s, c, { type: "choose", index: 0 });
  assert.equal(next.affection.anna, 3);
  assert.ok(next.completed.includes("anna-first"));
  assert.ok(next.memories.anna.facts.length);
  assert.throws(() => act(next, c, { type: "choose", index: 0 }));
  assert.equal(s.affection.anna, undefined);
});
test("school weekdays, weekend freedoms and one exploration per phase", () => {
  let { c, s } = ready();
  s.date = "2026-07-14";
  s.phase = 0;
  s.character = "";
  assert.ok(schoolTime(s));
  assert.throws(() => act(s, c, { type: "visit", place: "cafe" }), /上課|課程/);
  s = act(s, c, { type: "advance" });
  assert.equal(s.phase, 1);
  s = act(s, c, { type: "visit", place: "cafe" });
  if (s.dialogue.choices) s = act(s, c, { type: "choose", index: 0 });
  assert.throws(() => act(s, c, { type: "visit", place: "park" }), /探索/);
  s.date = "2026-07-18";
  s.phase = 0;
  assert.equal(schoolTime(s), false);
  assert.throws(() => act(s, c, { type: "visit", place: "club" }), /校舍休息/);
  const next = act(s, c, { type: "visit", place: "park" });
  assert.equal(next.location, "park");
});
test("LINE is earned only after a real meeting and sufficient affinity", () => {
  const { c, s } = ready();
  assert.throws(() => act(s, c, { type: "contact" }), /信任/);
  s.affection.anna = 5;
  const n = act(s, c, { type: "contact" });
  assert.ok(n.contacts.includes("anna"));
  assert.equal(n.messages.anna.length, 1);
  assert.throws(() => act(n, c, { type: "contact" }), /已交換/);
});
test("weights exclude zero, unknown characters and graduated seniors", () => {
  const { c, s } = ready();
  s.date = "2027-04-09";
  assert.equal(grade(s, c), 2);
  for (let i = 0; i < 100; i++)
    assert.equal(
      weightedPick(s, c, { tamaki: 1000, komari: 1, anna: 0, missing: 50 }, true),
      "komari",
    );
  assert.equal(weightedPick(s, c, { anna: 0 }), "");
  assert.equal(weightedPick(s, c, { tamaki: 1 }, false), "tamaki");
});
test("route prerequisites and date gates work independently", () => {
  const { c, s } = ready();
  const e = c.events.find((e) => e.id === "anna-route")!;
  s.location = "cafe";
  s.affection.anna = 80;
  assert.equal(eventEligible(s, c, e), false);
  s.date = "2027-04-02";
  assert.equal(eventEligible(s, c, e), false);
  s.flags.push("anna-trust");
  assert.equal(eventEligible(s, c, e), true);
  s.route = "komari";
  assert.equal(eventEligible(s, c, e), false);
});
test("calendar changes school year on April 1, handles leap year and stops at graduation", () => {
  const { c, s } = ready();
  s.date = "2027-03-31";
  s.phase = 2;
  tick(s, c);
  assert.equal(s.date, "2027-04-01");
  assert.equal(grade(s, c), 2);
  s.date = "2028-02-28";
  s.phase = 2;
  tick(s, c);
  assert.equal(s.date, "2028-02-29");
  s.date = "2029-02-28";
  s.phase = 2;
  tick(s, c);
  assert.equal(s.date, "2029-03-01");
  assert.ok(s.ended);
  assert.equal(s.ending, "ordinary");
  assert.throws(() => act(s, c, { type: "advance" }), /畢業/);
});
test("each configured route has reachable trust and bittersweet endings, plus ordinary and friendship", () => {
  const { c, s } = ready();
  const ends = new Set([getEnding(s, c).id]);
  assert.equal(getEnding(s,c).id,'ordinary');
  s.affection = { anna: 30, lemon: 30, komari: 30 };
  ends.add(getEnding(s, c).id);
  assert.equal(getEnding(s,c).id,'friendship');
  const expected=new Set(['ordinary','friendship']);
  for (const ch of c.characters.filter((c) => c.romance)) {
    s.route = ch.id;
    s.affection[ch.id] = 50;
    assert.equal(getEnding(s,c).id,`bittersweet:${ch.id}`);
    ends.add(getEnding(s, c).id);
    s.affection[ch.id] = 80;
    s.flags.push(ch.id + "-trust");
    assert.equal(getEnding(s,c).id,`love:${ch.id}`);
    ends.add(getEnding(s, c).id);
    expected.add(`bittersweet:${ch.id}`);expected.add(`love:${ch.id}`);
  }
  assert.deepEqual([...ends].sort(),[...expected].sort());
});
test("memory harness remains bounded after long dialogues and characters stay separate", () => {
  const m = emptyMemory();
  const other = emptyMemory();
  for (let i = 0; i < 1000; i++) {
    m.recent.push(
      { role: "user", content: "message" + i + "x".repeat(1500) },
      { role: "assistant", content: "reply" + i + "y".repeat(2400) },
    );
    m.turns++;
    compactMemory(m, 2400, 10);
  }
  assert.ok(m.summary.length <= 2400);
  assert.equal(m.recent.length, 10);
  assert.ok(m.recent[9].content.includes("999"));
  assert.equal(other.summary, "");
  assert.equal(other.recent.length, 0);
});
test("fast forward cannot exceed thirty days or skip unfinished choices", () => {
  const c = config();
  assert.throws(() => act(createGame(c), c, { type: "skip", days: 30 }));
  const { s } = ready();
  assert.throws(() => act(s, c, { type: "skip", days: 31 }));
  assert.throws(() => act(s, c, { type: "skip", days: -1 }));
  const n = act(s, c, { type: "skip", days: 7 });
  assert.ok(n.date <= "2026-07-20");
  if(n.date < "2026-07-20") assert.ok(n.dialogue.choices?.length, 'fast forward stops for a pending encounter');
});
