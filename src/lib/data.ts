// App defaults. The routine templates below are useful presets that ship with
// the app; the *task list* and the measured *history* start empty so the user
// only ever sees their own real data.
import type { Routine, Settings } from "./types";

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

/** Preset routine templates (editable in ルーティン管理). Not measured data. */
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
