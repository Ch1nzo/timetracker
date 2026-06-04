// Runtime tests for the pure measurement core (src/lib/timer.ts), compiled to
// CommonJS in .ttbuild by the `npm test` script. These execute the SAME code
// the app ships and assert the wall-clock math is correct under the scenarios
// that are impossible to reproduce by hand: throttled tray ticks, midnight
// crossings, and offline resume.
const assert = require("node:assert/strict");
const { computeTimer, daySegments } = require("../.ttbuild/timer.js");
const { ymd } = require("../.ttbuild/format.js");

// Local-time epoch helper (month is 0-based), matching how the app builds dates.
const T = (y, mo, d, h, mi, s = 0) => new Date(y, mo, d, h, mi, s).getTime();
const anchorAt = (start) => ({
  startedAt: start,
  lastElapsed: 0,
  todayDate: ymd(new Date(start)),
  reminderBucket: 0,
});
const NO_REMIND = { everyMin: 25, elapsedReminder: false };
const REMIND = { everyMin: 25, elapsedReminder: true };

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("timer core:");

// 1) Throttled tray: 1 hour passes with ZERO intermediate ticks (hidden webview
//    fully throttled). One sync must recover the entire hour — the core fix.
test("throttled tray: full hour recovered in a single sync", () => {
  const start = T(2026, 5, 4, 10, 0, 0);
  const r = computeTimer(start + 3600_000, true, anchorAt(start), NO_REMIND);
  assert.equal(r.changed, true);
  assert.equal(r.rolled, false);
  assert.equal(r.sessionSec, 3600);
  assert.equal(r.totalDelta, 3600); // not ~5 ticks — the real elapsed hour
  assert.equal(r.runningTodayDelta, 3600);
  assert.equal(r.lastElapsed, 3600);
});

// 2) Two syncs in the same second must not double-count.
test("idempotent within the same second", () => {
  const start = T(2026, 5, 4, 10, 0, 0);
  const a = { ...anchorAt(start), lastElapsed: 3600 };
  const r = computeTimer(start + 3600_000, true, a, NO_REMIND);
  assert.equal(r.changed, false);
});

// 3) Normal +1s tick advances by exactly one second.
test("incremental tick advances by 1s", () => {
  const start = T(2026, 5, 4, 10, 0, 0);
  const a = { ...anchorAt(start), lastElapsed: 3600 };
  const r = computeTimer(start + 3601_000, true, a, NO_REMIND);
  assert.equal(r.totalDelta, 1);
  assert.equal(r.sessionSec, 3601);
});

// 4) Midnight rollover splits the session: pre-midnight → yesterday's date,
//    today's counter resets to the post-midnight seconds, totalSec continuous.
test("midnight rollover splits and re-anchors correctly", () => {
  const start = T(2026, 5, 4, 23, 30, 0);
  const now = T(2026, 5, 5, 0, 30, 0);
  const r = computeTimer(now, true, anchorAt(start), NO_REMIND);
  assert.equal(r.rolled, true);
  assert.equal(r.logSegments.length, 1);
  assert.equal(r.logSegments[0].date, "2026-06-04");
  assert.equal(r.logSegments[0].sec, 1800); // 23:30 → 00:00
  assert.equal(r.totalDelta, 3600); // full 23:30 → 00:30 to totalSec, once
  assert.equal(r.runningTodayValue, 1800); // today = 00:00 → 00:30
  assert.equal(r.resetAllToday, true);
  assert.equal(r.todayDate, "2026-06-05");
  assert.equal(r.startedAt, T(2026, 5, 5, 0, 0, 0)); // re-anchored to midnight
  assert.equal(r.lastElapsed, 1800);
});

// 5) Multi-day span (e.g. left running for >2 days) splits per calendar day.
test("daySegments splits a multi-day span", () => {
  const segs = daySegments(T(2026, 5, 4, 10, 0, 0), T(2026, 5, 6, 14, 0, 0));
  assert.equal(segs.length, 3);
  assert.deepEqual(segs[0], { date: "2026-06-04", sec: 14 * 3600 });
  assert.deepEqual(segs[1], { date: "2026-06-05", sec: 24 * 3600 });
  assert.deepEqual(segs[2], { date: "2026-06-06", sec: 14 * 3600 });
});

// 6) Reminder must fire exactly once when a throttled jump skips past a boundary
//    (old tick-modulo logic would have missed it).
test("reminder fires once on a throttled jump past the boundary", () => {
  const start = T(2026, 5, 4, 9, 0, 0);
  const r = computeTimer(start + 50 * 60_000, true, anchorAt(start), REMIND);
  assert.equal(r.fireReminder, true);
  assert.equal(r.reminderMinutes, 50); // bucket 2 × 25min
  assert.equal(r.reminderBucket, 2);
  // next minute: same bucket, no re-fire
  const a2 = { ...anchorAt(start), lastElapsed: r.lastElapsed, reminderBucket: 2 };
  const r2 = computeTimer(start + 51 * 60_000, true, a2, REMIND);
  assert.equal(r2.fireReminder, false);
});

// 7) Idle across midnight resets "today" even with no running task.
test("idle rollover resets today at midnight", () => {
  const a = { startedAt: 0, lastElapsed: 0, todayDate: "2026-06-03", reminderBucket: 0 };
  const r = computeTimer(T(2026, 5, 4, 9, 0, 0), false, a, NO_REMIND);
  assert.equal(r.changed, true);
  assert.equal(r.rolled, true);
  assert.equal(r.resetAllToday, true);
  assert.equal(r.todayDate, "2026-06-04");
  assert.equal(r.totalDelta, 0);
});

// 8) Idle within the same day is a no-op.
test("idle within the same day is a no-op", () => {
  const a = { startedAt: 0, lastElapsed: 0, todayDate: "2026-06-04", reminderBucket: 0 };
  const r = computeTimer(T(2026, 5, 4, 15, 0, 0), false, a, NO_REMIND);
  assert.equal(r.changed, false);
});

// 9) Offline resume: a session persisted with 1h of work, app closed 1.5h, then
//    reopened — only the offline gap is added on top of the persisted counters.
test("offline resume adds only the offline gap, fires reminder once", () => {
  const start = T(2026, 5, 4, 10, 0, 0);
  const savedAt = T(2026, 5, 4, 11, 0, 0); // 1h already counted + persisted
  const now = T(2026, 5, 4, 12, 30, 0); // reopened 1.5h later
  const a = {
    startedAt: start,
    lastElapsed: (savedAt - start) / 1000, // 3600
    todayDate: "2026-06-04",
    reminderBucket: Math.floor(3600 / 1500), // 2
  };
  const r = computeTimer(now, true, a, REMIND);
  assert.equal(r.totalDelta, 5400); // only the 1.5h offline gap
  assert.equal(r.sessionSec, 9000); // 2.5h total elapsed
  assert.equal(r.runningTodayDelta, 5400);
  assert.equal(r.fireReminder, true);
  assert.equal(r.reminderMinutes, 150); // bucket 6 × 25min
});

console.log(`\n${passed} passed`);
