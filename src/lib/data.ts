// Seed data and defaults — ported from the design prototype.
import type { Routine, Settings, Task } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  elapsedReminder: true,
  elapsedEveryMin: 25,
  pendingReminder: true,
  pendingAt: "17:30",
  autostart: true,
  trayKeepRunning: true,
  globalShortcut: true,
  globalShortcutKeys: "Ctrl+Alt+S",
  themeMode: "dark",
  accent: "green",
};

export const ROUTINES_SEED: Routine[] = [
  { id: "r1", name: "朝のメールチェック", cat: "雑務" },
  { id: "r2", name: "スタンドアップMTG", cat: "会議" },
  { id: "r3", name: "コードレビュー", cat: "開発" },
  { id: "r4", name: "仕様書レビュー", cat: "プロダクト" },
  { id: "r5", name: "デザインレビュー", cat: "デザイン" },
  { id: "r6", name: "日報作成", cat: "雑務" },
  { id: "r7", name: "競合リサーチ", cat: "リサーチ" },
  { id: "r8", name: "月次レポート作成", cat: "経営" },
];

export const TASK_SEED: Task[] = [
  { k: "1", name: "仕様書レビュー", cat: "プロダクト", color: "#60a5fa", todaySec: 4320, totalSec: 31200, sessions: 5, last: "10:24", done: false },
  { k: "2", name: "API 実装", cat: "開発", color: "#34d399", todaySec: 7500, totalSec: 76680, sessions: 12, last: "13:02", done: false },
  { k: "3", name: "デザインレビュー", cat: "デザイン", color: "#f472b6", todaySec: 2700, totalSec: 23400, sessions: 3, last: "11:50", done: false },
  { k: "4", name: "定例ミーティング", cat: "会議", color: "#fbbf24", todaySec: 1800, totalSec: 15300, sessions: 8, last: "09:30", done: false },
  { k: "5", name: "月次レポート作成", cat: "経営", color: "#a78bfa", todaySec: 0, totalSec: 12000, sessions: 2, last: "昨日", done: false },
  { k: "6", name: "競合調査", cat: "リサーチ", color: "#22d3ee", todaySec: 1080, totalSec: 7500, sessions: 1, last: "昨日", done: false },
  { k: "7", name: "メール返信", cat: "雑務", color: "#94a3b8", todaySec: 1320, totalSec: 33120, sessions: 14, last: "14:10", done: false },
];
