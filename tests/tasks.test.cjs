// Runtime tests for the pure task/history reconciliation (src/lib/tasks.ts),
// compiled to CommonJS by `npm test`. Verifies the main task list converges with
// today's measured calendar entries.
const assert = require("node:assert/strict");
const { reconcileTodayTasks } = require("../.ttbuild/tasks.js");

const TODAY = "2026-06-04";
const mkTask = (over) => ({
  k: "t1", name: "A", cat: "開発", color: "#34d399",
  todaySec: 0, totalSec: 0, sessions: 0, last: "—", done: false, ...over,
});
const mkEntry = (over) => ({
  id: "e" + Math.random(), date: TODAY, name: "A", cat: "開発", color: "#34d399",
  sec: 600, source: "timer", created_at: 1, ...over,
});

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

console.log("tasks reconcile:");

// 1) Empty main list + today's entries → tasks appear (the reported bug).
test("today's measured tasks appear in an empty main list", () => {
  const out = reconcileTodayTasks(
    [],
    [mkEntry({ name: "コードレビュー", cat: "開発", sec: 3600 }), mkEntry({ name: "会議", cat: "会議", sec: 1800 })],
    TODAY,
    null,
  );
  assert.equal(out.length, 2);
  const names = out.map((t) => t.name).sort();
  assert.deepEqual(names, ["コードレビュー", "会議"]);
  const cr = out.find((t) => t.name === "コードレビュー");
  assert.equal(cr.todaySec, 3600);
});

// 2) Multiple entries for the same task aggregate into one task row.
test("multiple entries of one task aggregate to a single task", () => {
  const out = reconcileTodayTasks(
    [],
    [mkEntry({ name: "A", sec: 600 }), mkEntry({ name: "A", sec: 1200 }), mkEntry({ name: "A", sec: 300 })],
    TODAY,
    null,
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].todaySec, 2100);
  assert.equal(out[0].sessions, 3);
});

// 3) Existing task's todaySec is corrected to match today's entries.
test("existing task today total is corrected from entries", () => {
  const out = reconcileTodayTasks(
    [mkTask({ name: "A", todaySec: 0 })],
    [mkEntry({ name: "A", sec: 900 })],
    TODAY,
    null,
  );
  assert.equal(out.find((t) => t.name === "A").todaySec, 900);
});

// 4) The running task is left untouched (its live session isn't flushed yet).
test("running task is not overwritten", () => {
  const running = mkTask({ k: "run1", name: "A", todaySec: 1234 });
  const out = reconcileTodayTasks([running], [mkEntry({ name: "A", sec: 50 })], TODAY, "run1");
  assert.equal(out.find((t) => t.k === "run1").todaySec, 1234); // unchanged
});

// 5) Entries from other days are ignored.
test("entries from other days do not affect today", () => {
  const out = reconcileTodayTasks(
    [],
    [mkEntry({ name: "A", date: "2026-06-01", sec: 3600 })],
    TODAY,
    null,
  );
  assert.equal(out.length, 0);
});

// 6) No-op when nothing changes → SAME array reference (so React bails out).
test("returns same reference when nothing changes", () => {
  const tasks = [mkTask({ name: "A", todaySec: 600 })];
  const out = reconcileTodayTasks(tasks, [mkEntry({ name: "A", sec: 600 })], TODAY, null);
  assert.equal(out, tasks); // identity
});

// 7) Idempotent: a second pass over reconciled output changes nothing.
test("idempotent across repeated passes", () => {
  const entries = [mkEntry({ name: "コードレビュー", sec: 3600 })];
  const first = reconcileTodayTasks([], entries, TODAY, null);
  const second = reconcileTodayTasks(first, entries, TODAY, null);
  assert.equal(second, first); // same ref → no change
});

// 8) Planned task with no measured time is preserved untouched.
test("planned (unmeasured) task is kept as-is", () => {
  const planned = mkTask({ name: "Planned", todaySec: 0 });
  const out = reconcileTodayTasks([planned], [mkEntry({ name: "A", sec: 600 })], TODAY, null);
  assert.ok(out.find((t) => t.name === "Planned"));
  assert.ok(out.find((t) => t.name === "A"));
  assert.equal(out.length, 2);
});

console.log(`\n${passed} passed`);
