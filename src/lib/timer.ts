// Pure measurement core — no React, no Tauri, no DB. Extracted from App.tsx so
// the wall-clock timing math (the part that must stay correct even when a hidden
// tray webview throttles its timers) can be unit-tested headlessly.
//
// The model: a running session is anchored to a wall-clock epoch `startedAt`.
// Elapsed time is ALWAYS derived as Date.now() - startedAt, never by counting
// ticks — so a single sync after a long throttled gap recovers the full elapsed
// time. computeTimer() takes the current anchor + `now` and returns the deltas
// to apply plus any time_entries segments to log; the caller performs the React
// state / SQLite side-effects.
import { ymd } from "./format";

export interface DaySeg {
  date: string; // YYYY-MM-DD
  sec: number;
}

/** Split a wall-clock [startMs, endMs) span into per-calendar-day segments so a
 *  session that crosses midnight is attributed to the correct date(s). */
export function daySegments(startMs: number, endMs: number): DaySeg[] {
  const segs: DaySeg[] = [];
  let cur = startMs;
  let guard = 0;
  while (cur < endMs && guard++ < 800) {
    const d = new Date(cur);
    const nextMid = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const segEnd = Math.min(endMs, nextMid);
    const sec = Math.floor((segEnd - cur) / 1000);
    if (sec > 0) segs.push({ date: ymd(d), sec });
    cur = nextMid;
  }
  return segs;
}

export interface TimerAnchor {
  startedAt: number; // epoch ms the running session started (after any re-anchor)
  lastElapsed: number; // last processed elapsed seconds since startedAt
  todayDate: string; // the day (YYYY-MM-DD) the todaySec counters belong to
  reminderBucket: number; // last fired "every N min" bucket
}

export interface TimerStep {
  /** Whether anything changed (counters/display/log). When false, ignore. */
  changed: boolean;
  /** Whether the wall clock crossed midnight since the last sync. */
  rolled: boolean;
  // --- updated anchor (write these back to the refs) ---
  startedAt: number;
  lastElapsed: number;
  todayDate: string;
  reminderBucket: number;
  // --- effects to apply ---
  sessionSec: number; // new display value for the running session
  totalDelta: number; // add to the running task's totalSec
  runningTodayValue: number | null; // absolute todaySec for running task (set on rollover)
  runningTodayDelta: number; // add to running task's todaySec (when not rolled)
  resetAllToday: boolean; // reset every task's todaySec to 0 (rollover)
  logSegments: DaySeg[]; // pre-midnight portion of the session to write to time_entries
  fireReminder: boolean;
  reminderMinutes: number; // minutes elapsed to announce
}

function noChange(a: TimerAnchor): TimerStep {
  return {
    changed: false,
    rolled: false,
    startedAt: a.startedAt,
    lastElapsed: a.lastElapsed,
    todayDate: a.todayDate,
    reminderBucket: a.reminderBucket,
    sessionSec: 0,
    totalDelta: 0,
    runningTodayValue: null,
    runningTodayDelta: 0,
    resetAllToday: false,
    logSegments: [],
    fireReminder: false,
    reminderMinutes: 0,
  };
}

/** Compute the timer update for the current wall-clock `now`.
 *  `running` = a task is active (anchor.startedAt is its session start). */
export function computeTimer(
  now: number,
  running: boolean,
  a: TimerAnchor,
  cfg: { everyMin: number; elapsedReminder: boolean },
): TimerStep {
  const today = ymd(new Date(now));

  if (!running) {
    // Idle: only roll the "today" counters over at midnight.
    if (today !== a.todayDate) {
      return { ...noChange(a), changed: true, rolled: true, todayDate: today, resetAllToday: true };
    }
    return noChange(a);
  }

  const elapsed = Math.floor((now - a.startedAt) / 1000);
  const rolled = today !== a.todayDate;
  if (elapsed <= a.lastElapsed && !rolled) return noChange(a); // nothing new

  const totalDelta = Math.max(0, elapsed - a.lastElapsed);

  let startedAt = a.startedAt;
  let reminderBucket = a.reminderBucket;
  let todayDate = a.todayDate;
  let logSegments: DaySeg[] = [];
  if (rolled) {
    // Flush the pre-midnight portion to its real date(s), then re-anchor the
    // session to today's midnight so "today" only counts today's seconds.
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    logSegments = daySegments(a.startedAt, midnight.getTime());
    startedAt = midnight.getTime();
    reminderBucket = 0;
    todayDate = today;
  }

  const todayElapsed = Math.floor((now - startedAt) / 1000);
  const sessionSec = rolled ? todayElapsed : elapsed;
  const lastElapsed = rolled ? todayElapsed : elapsed;

  // Elapsed reminder — fire once per crossed N-minute boundary (wall-clock),
  // so a throttled jump past a boundary still fires exactly once (never skips).
  let fireReminder = false;
  let reminderMinutes = 0;
  if (cfg.elapsedReminder) {
    const refSec = rolled ? todayElapsed : elapsed;
    const bucket = Math.floor(refSec / (Math.max(1, cfg.everyMin) * 60));
    if (bucket > reminderBucket) {
      fireReminder = true;
      reminderMinutes = bucket * Math.max(1, cfg.everyMin);
      reminderBucket = bucket;
    }
  }

  return {
    changed: true,
    rolled,
    startedAt,
    lastElapsed,
    todayDate,
    reminderBucket,
    sessionSec,
    totalDelta,
    runningTodayValue: rolled ? todayElapsed : null,
    runningTodayDelta: rolled ? 0 : totalDelta,
    resetAllToday: rolled,
    logSegments,
    fireReminder,
    reminderMinutes,
  };
}
