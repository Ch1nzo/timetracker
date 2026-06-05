// Pure task/history reconciliation — no React/Tauri/DB. Keeps the main screen's
// "today's tasks" in sync with the calendar's measured history for the current
// day: every task that has time_entries dated `today` is present in the list
// with its today total, so the two views show the same data for today.
import type { Task, TimeEntry } from "./types";

/** Reconcile the working-set task list against today's measured entries.
 *
 *  - Existing (non-running) tasks whose name appears in today's entries get
 *    todaySec set to that name's today total (corrects drift / resurrects a task
 *    that was cleared from the list but still has measured time today).
 *  - Names measured today with no matching task get a task appended, so the
 *    main list always contains every task shown on the calendar for today.
 *  - The currently-running task is left untouched: its live session has not been
 *    flushed to time_entries yet, so its live todaySec is authoritative.
 *
 *  Returns the SAME array reference when nothing changes (so callers can rely on
 *  React bailing out of a no-op state update). Pure + deterministic. */
export function reconcileTodayTasks(
  tasks: Task[],
  entries: TimeEntry[],
  today: string,
  runningKey: string | null,
): Task[] {
  // Group today's entries by task name.
  const groups = new Map<string, { sec: number; n: number; cat: string; color: string }>();
  for (const e of entries) {
    if (e.date !== today) continue;
    const g = groups.get(e.name);
    if (g) {
      g.sec += e.sec;
      g.n += 1;
    } else {
      groups.set(e.name, { sec: e.sec, n: 1, cat: e.cat, color: e.color });
    }
  }

  let changed = false;

  // Correct existing tasks' today totals (skip the running one).
  const out = tasks.map((t) => {
    if (t.k === runningKey) return t;
    const g = groups.get(t.name);
    if (!g || g.sec === t.todaySec) return t;
    changed = true;
    return { ...t, todaySec: g.sec };
  });

  // Append tasks for names measured today that aren't in the list yet.
  const have = new Set(tasks.map((t) => t.name));
  for (const [name, g] of groups) {
    if (have.has(name)) continue;
    changed = true;
    out.push({
      k: "tcal-" + name,
      name,
      cat: g.cat,
      color: g.color,
      todaySec: g.sec,
      totalSec: g.sec,
      sessions: g.n,
      last: "—",
      done: false,
    });
  }

  return changed ? out : tasks;
}

/** Side effects of carrying the given task keys over to tomorrow. */
export interface CarryoverPlan {
  /** Tasks to place on tomorrow's calendar as 0:00 planned rows. */
  carry: { name: string; cat: string; color: string }[];
  /** Names whose (0-min) today row should be dropped — see below. */
  dropToday: string[];
}

/** Decide what a "move to tomorrow" carryover writes.
 *
 *  - Every carried task gets a 0:00 row on tomorrow so it shows up tomorrow on
 *    both the calendar and — via reconcileTodayTasks — the main task list.
 *  - A carried task never worked on today (todaySec === 0) also has its empty
 *    today row dropped, so the carryover "sticks" (reconcile won't resurrect it
 *    onto today when the window reopens) and today's calendar isn't left with a
 *    0-min entry. Tasks with real time logged today are preserved as history.
 *
 *  Pure + deterministic (no Date/DB) so it can be unit-tested. */
export function planCarryover(tasks: Task[], keys: string[]): CarryoverPlan {
  const set = new Set(keys);
  const moved = tasks.filter((t) => set.has(t.k));
  return {
    carry: moved.map((t) => ({ name: t.name, cat: t.cat, color: t.color })),
    dropToday: moved.filter((t) => t.todaySec === 0).map((t) => t.name),
  };
}
