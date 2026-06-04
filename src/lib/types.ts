// Shared domain types for TimeTracker.

export interface Task {
  k: string;
  name: string;
  cat: string;
  color: string;
  todaySec: number;
  totalSec: number;
  sessions: number;
  last: string;
  done: boolean;
}

export interface Routine {
  id: string;
  name: string;
  cat: string;
}

export interface Category {
  name: string;
  color: string;
  custom?: boolean;
}

export type ThemeMode = "dark" | "light";
export type Accent = "green" | "blue" | "amber";

export interface Settings {
  elapsedReminder: boolean;
  elapsedEveryMin: number;
  pendingReminder: boolean;
  pendingAt: string;
  autostart: boolean;
  trayKeepRunning: boolean;
  globalShortcut: boolean;
  globalShortcutKeys: string;
  themeMode: ThemeMode;
  accent: Accent;
}

/** The live working-set blob persisted between launches. */
export interface MainState {
  tasks: Task[];
  routines: Routine[];
  settings: Settings;
  runningKey: string | null;
  sessionSec: number;
  navIndex: number;
  savedAt: number;
  /** Wall-clock epoch (ms) the running session started — null when idle.
   *  Measurement is derived from this anchor, not from counting ticks, so it
   *  stays correct even when the hidden webview throttles its timers. */
  startedAt?: number | null;
  /** The calendar day (YYYY-MM-DD) the per-task `todaySec` counters belong to.
   *  Used to reset "today" at midnight while the app sits in the tray. */
  todayDate?: string;
}

/** A single measured (or manually logged) session — the real history that
 *  powers the calendar and stats screens. */
export interface TimeEntry {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  cat: string;
  color: string;
  sec: number;
  source?: string;
  created_at?: number;
}

export interface Note {
  text: string;
  icon: string;
}
