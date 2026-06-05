import { useCallback, useEffect, useRef, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";

import { Ico } from "./lib/icons";
import { addDays, hhmm, hm, hms, nowHM, ymd } from "./lib/format";
import { catColor } from "./lib/categories";
import { DEFAULT_SETTINGS, ROUTINES_SEED } from "./lib/data";
import {
  initData,
  loadMain,
  saveMain,
  teAccumulate,
  teAll,
  teDeleteTaskDay,
} from "./lib/db";
import {
  IS_TAURI,
  checkForUpdate,
  hideToTray,
  installUpdateAndRelaunch,
  notify,
  onQuitRequested,
  onToggleTimer,
  quitApp,
  syncAutostart,
  syncCloseToTray,
  syncGlobalShortcut,
} from "./lib/tauri";
import type { Note, Routine, Settings, Task } from "./lib/types";
import { computeTimer, daySegments, type DaySeg } from "./lib/timer";
import { planCarryover, reconcileTodayTasks } from "./lib/tasks";

const APP_VERSION = "0.5.5";

import { TitleBar } from "./components/TitleBar";
import { StatusBar } from "./components/StatusBar";
import { Footer } from "./components/Footer";
import { MiniLive } from "./components/MiniLive";
import { CategoryPicker } from "./components/CategoryPicker";
import { MorningFlow } from "./screens/MorningFlow";
import { RoutineManager } from "./screens/RoutineManager";
import { TaskEditor } from "./screens/TaskEditor";
import { Settings as SettingsScreen } from "./screens/Settings";
import { Calendar } from "./screens/Calendar";
import { Stats } from "./screens/Stats";
import { CarryoverDialog } from "./screens/CarryoverDialog";

/* normalize a keydown event's main key (robust against Alt remaps) */
function evKeyName(e: KeyboardEvent): string {
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3).toLowerCase();
  if (/^Digit\d$/.test(e.code)) return e.code.slice(5);
  return (e.key || "").toLowerCase();
}
/* does this event match a combo string like "Ctrl+Alt+S"? */
function matchShortcut(e: KeyboardEvent, combo: string): boolean {
  if (!combo) return false;
  const parts = combo.toLowerCase().split("+").map((p) => p.trim()).filter(Boolean);
  const mod = (m: string) => parts.includes(m);
  if (!!e.ctrlKey !== mod("ctrl")) return false;
  if (!!e.altKey !== mod("alt")) return false;
  if (!!e.shiftKey !== mod("shift")) return false;
  if (!!e.metaKey !== (mod("cmd") || mod("meta"))) return false;
  const key = parts.filter((p) => !["ctrl", "alt", "shift", "cmd", "meta"].includes(p))[0] || "";
  return evKeyName(e) === key;
}

export function App() {
  const [ready, setReady] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [routines, setRoutines] = useState<Routine[]>(ROUTINES_SEED);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [runningKey, setRunning] = useState<string | null>(null);
  const [sessionSec, setSession] = useState(0);
  const [navIndex, setNav] = useState(0);
  const [screen, setScreen] = useState<
    "main" | "morning" | "routines" | "settings" | "calendar" | "stats"
  >("main");
  const [editKey, setEditKey] = useState<string | null>(null);
  const [filtering, setFiltering] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCat, setNewCat] = useState("未分類");
  const [note, setNote] = useState<Note | null>(null);
  const [showCarry, setShowCarry] = useState(false);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [update, setUpdate] = useState<Update | null>(null);
  const [updating, setUpdating] = useState(false);

  const filterRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const noteTimer = useRef<number | undefined>(undefined);
  const tasksRef = useRef(tasks);
  const settingsRef = useRef(settings);
  const runningKeyRef = useRef<string | null>(runningKey);
  // Wall-clock measurement anchors (see daySegments / syncTimer).
  const startedAtRef = useRef<number | null>(null); // epoch ms of current session
  const lastElapsedRef = useRef(0); // last processed elapsed seconds since startedAt
  const reminderBucketRef = useRef(0); // last fired "every N min" bucket
  const todayDateRef = useRef<string>(ymd(new Date())); // day the todaySec counters belong to
  const toggleActiveRef = useRef<() => void>(() => {});
  const doQuitRef = useRef<() => void>(() => {});
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    runningKeyRef.current = runningKey;
  }, [runningKey]);

  const q = query.trim();
  const actives = tasks.filter((t) => !t.done && (!q || t.name.includes(q)));
  const dones = tasks.filter((t) => t.done);
  const clampedNav = Math.min(navIndex, Math.max(0, actives.length - 1));
  const active = runningKey ? tasks.find((t) => t.k === runningKey) : actives[clampedNav];
  const todayTotal = tasks.reduce((a, t) => a + t.todaySec, 0);
  const pending = tasks.filter((t) => !t.done);
  const live = !!runningKey;
  const existingNames = tasks.map((t) => t.name);
  const rootCls = "tt" + (settings.themeMode === "light" ? "" : " dark");
  const accent = settings.accent;

  // --- load persisted state once ----------------------------------------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await initData();
        const init = await loadMain();
        if (!alive) return;
        if (init) {
          const now = Date.now();
          todayDateRef.current = init.todayDate || ymd(new Date(now));
          if (init.runningKey && init.startedAt) {
            const offline = Math.floor((now - (init.savedAt || now)) / 1000);
            if (offline >= 0 && offline < 86400) {
              // Resume the still-running session anchored at its real start.
              // syncTimer (run once after `ready`) reconciles the offline span
              // and any midnight rollover.
              startedAtRef.current = init.startedAt;
              runningKeyRef.current = init.runningKey;
              lastElapsedRef.current = Math.max(
                0,
                Math.floor(((init.savedAt || now) - init.startedAt) / 1000),
              );
              const everyMin = Math.max(1, init.settings?.elapsedEveryMin || 25);
              reminderBucketRef.current = Math.floor((init.sessionSec || 0) / (everyMin * 60));
              setRunning(init.runningKey);
              setSession(init.sessionSec || 0);
            } else {
              // Stale (offline >= 24h or a clock jump): finalize the measured
              // part up to the last save and stop, rather than silently carrying
              // a wrong running time.
              const t = init.tasks.find((x) => x.k === init.runningKey);
              if (t && init.savedAt) logRange(t, init.startedAt, init.savedAt);
              startedAtRef.current = null;
              runningKeyRef.current = null;
            }
          }
          setTasks(init.tasks);
          if (init.routines) setRoutines(init.routines);
          if (init.settings) setSettings({ ...DEFAULT_SETTINGS, ...init.settings });
          setNav(init.navIndex || 0);
        }
      } catch (e) {
        console.error("load failed", e);
      } finally {
        if (alive) setReady(true);
      }
      const u = await checkForUpdate();
      if (alive && u) setUpdate(u);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- persist (debounced) ----------------------------------------------
  useEffect(() => {
    if (!ready) return;
    const id = window.setTimeout(() => {
      void saveMain({
        tasks,
        routines,
        settings,
        runningKey,
        sessionSec,
        navIndex,
        savedAt: Date.now(),
        startedAt: startedAtRef.current,
        todayDate: todayDateRef.current,
      });
    }, 400);
    return () => clearTimeout(id);
  }, [ready, tasks, routines, settings, runningKey, sessionSec, navIndex]);

  // --- sync the main task list with today's measured history ------------
  // Whenever the main screen is shown (incl. first load and returning from the
  // calendar), pull today's time_entries and reconcile so the main list and the
  // calendar show the same tasks for today. The running task is left to its live
  // counter. No-op state update when nothing changed (reconcile returns the same
  // array ref), so this won't loop.
  useEffect(() => {
    if (!ready || screen !== "main") return;
    let alive = true;
    void teAll().then((all) => {
      if (!alive) return;
      setTasks((prev) => reconcileTodayTasks(prev, all, ymd(new Date()), runningKeyRef.current));
    });
    return () => {
      alive = false;
    };
  }, [ready, screen]);

  // --- keep OS integrations in sync with settings -----------------------
  useEffect(() => {
    if (ready) void syncGlobalShortcut(settings.globalShortcutKeys, settings.globalShortcut);
  }, [ready, settings.globalShortcut, settings.globalShortcutKeys]);
  useEffect(() => {
    if (ready) void syncAutostart(settings.autostart);
  }, [ready, settings.autostart]);
  useEffect(() => {
    if (ready) void syncCloseToTray(settings.trayKeepRunning);
  }, [ready, settings.trayKeepRunning]);

  // --- tray / global-shortcut toggle event ------------------------------
  useEffect(() => {
    let un: (() => void) | undefined;
    void onToggleTimer(() => toggleActiveRef.current()).then((fn) => {
      un = fn;
    });
    return () => {
      if (un) un();
    };
  }, []);

  // --- backend-requested quit (close while keep-running is OFF) ----------
  useEffect(() => {
    let un: (() => void) | undefined;
    void onQuitRequested(() => doQuitRef.current()).then((fn) => {
      un = fn;
    });
    return () => {
      if (un) un();
    };
  }, []);

  // --- session logging (real time_entries) ------------------------------
  // Write pre-computed per-day segments for a task. Returns a promise that
  // resolves once the rows are written (awaited on quit; ignored elsewhere).
  const writeSegments = useCallback((task: Task, segs: DaySeg[]): Promise<void> => {
    // Accumulate each day-segment into that task's single row for the day, so
    // the calendar shows one record per task per day (no per-session dupes) and
    // stays in sync with the main task list.
    return Promise.allSettled(
      segs.map((seg) => teAccumulate(seg.date, task.name, task.cat, task.color, seg.sec)),
    ).then(() => {});
  }, []);
  // Log a measured span [startMs, endMs) for a task, split across calendar days
  // so a session crossing midnight lands on the right date(s).
  const logRange = useCallback(
    (task: Task, startMs: number, endMs: number): Promise<void> =>
      writeSegments(task, daySegments(startMs, endMs)),
    [writeSegments],
  );
  // Flush the currently-running session (from its anchor up to `endMs`/now).
  const logRunning = useCallback(
    (key: string, endMs?: number): Promise<void> => {
      const start = startedAtRef.current;
      if (start == null) return Promise.resolve();
      const t = tasksRef.current.find((x) => x.k === key);
      if (!t) return Promise.resolve();
      return logRange(t, start, endMs ?? Date.now());
    },
    [logRange],
  );

  // --- wall-clock timer sync --------------------------------------------
  // Delegates the timing math to the pure computeTimer() core (unit-tested in
  // tests/timer.test.mjs), then applies the React/SQLite side-effects here.
  const syncTimer = useCallback(() => {
    const now = Date.now();
    const runKey = runningKeyRef.current;
    const running = !!runKey && startedAtRef.current != null;
    const s = settingsRef.current;
    const r = computeTimer(
      now,
      running,
      {
        startedAt: startedAtRef.current ?? now,
        lastElapsed: lastElapsedRef.current,
        todayDate: todayDateRef.current,
        reminderBucket: reminderBucketRef.current,
      },
      { everyMin: Math.max(1, s.elapsedEveryMin || 25), elapsedReminder: s.elapsedReminder },
    );
    if (!r.changed) return;

    // Flush the pre-midnight portion of the session to its real date(s).
    if (r.logSegments.length && runKey) {
      const t = tasksRef.current.find((x) => x.k === runKey);
      if (t) void writeSegments(t, r.logSegments);
    }

    // Apply the updated anchor.
    if (running) startedAtRef.current = r.startedAt;
    lastElapsedRef.current = r.lastElapsed;
    todayDateRef.current = r.todayDate;
    reminderBucketRef.current = r.reminderBucket;

    if (running) setSession(r.sessionSec);
    if (running || r.resetAllToday) {
      setTasks((ts) =>
        ts.map((t) => {
          if (running && t.k === runKey) {
            const todaySec =
              r.runningTodayValue != null ? r.runningTodayValue : t.todaySec + r.runningTodayDelta;
            return { ...t, totalSec: t.totalSec + r.totalDelta, todaySec };
          }
          return r.resetAllToday && t.todaySec ? { ...t, todaySec: 0 } : t;
        }),
      );
    }

    if (r.fireReminder) {
      // In-app toast removed per request; the reminder is delivered as the
      // OS-standard notification only.
      const t = tasksRef.current.find((x) => x.k === runKey);
      void notify(t?.name ?? "計測中", `${r.reminderMinutes}分が経過しました`);
    }
  }, [writeSegments]);

  const startTask = useCallback(
    (k: string) => {
      if (runningKeyRef.current === k) return;
      if (runningKeyRef.current) logRunning(runningKeyRef.current); // flush previous
      const now = Date.now();
      const today = ymd(new Date(now));
      const rolled = today !== todayDateRef.current; // starting after a midnight gap
      startedAtRef.current = now;
      runningKeyRef.current = k;
      lastElapsedRef.current = 0;
      reminderBucketRef.current = 0;
      todayDateRef.current = today;
      setSession(0);
      setRunning(k);
      setTasks((ts) =>
        ts.map((t) => {
          const base = rolled ? { ...t, todaySec: 0 } : t;
          return t.k === k
            ? { ...base, sessions: t.sessions + 1, last: nowHM(), done: false }
            : base;
        }),
      );
    },
    [logRunning],
  );
  const stop = useCallback(() => {
    if (runningKeyRef.current) logRunning(runningKeyRef.current);
    startedAtRef.current = null;
    runningKeyRef.current = null;
    lastElapsedRef.current = 0;
    reminderBucketRef.current = 0;
    setSession(0);
    setRunning(null);
  }, [logRunning]);
  const toggleActive = useCallback(() => {
    if (runningKey) {
      stop();
      return;
    }
    if (active) {
      startTask(active.k);
      return;
    }
    // No task selected — warn instead of starting nothing. (flashNote is defined
    // later in the component, so emit the toast directly here.)
    setNote({ text: "計測するタスクを選択してください", icon: "info" });
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(null), 2600);
  }, [runningKey, active, startTask, stop]);
  useEffect(() => {
    toggleActiveRef.current = toggleActive;
  }, [toggleActive]);

  // Reconcile once the persisted state has loaded (applies any offline span and
  // midnight rollover for a resumed session).
  useEffect(() => {
    if (ready) syncTimer();
  }, [ready, syncTimer]);

  // Per-second display update while a task is running.
  useEffect(() => {
    if (!runningKey) return;
    const id = window.setInterval(syncTimer, 1000);
    return () => clearInterval(id);
  }, [runningKey, syncTimer]);

  // Low-frequency guard so the "today" counters still roll over at midnight even
  // when idle (and as a backstop while a hidden tray webview throttles the 1s
  // interval above).
  useEffect(() => {
    const id = window.setInterval(syncTimer, 30000);
    return () => clearInterval(id);
  }, [syncTimer]);

  // Re-sync immediately when the window returns to the foreground (e.g. shown
  // from the tray), recovering any time the throttled timer missed.
  useEffect(() => {
    const onShow = () => {
      if (!document.hidden) syncTimer();
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    return () => {
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
    };
  }, [syncTimer]);

  const complete = (k: string) => {
    if (k === runningKey) stop();
    setTasks((ts) => ts.map((t) => (t.k === k ? { ...t, done: !t.done } : t)));
  };
  const del = (k: string) => {
    if (k === runningKey) stop();
    const t = tasksRef.current.find((x) => x.k === k);
    setTasks((ts) => ts.filter((x) => x.k !== k));
    // Remove today's calendar record too, so deleting a task on the main screen
    // also clears it from today's calendar (and it won't be re-added by the
    // reconcile). Past days' history for the name is left intact.
    if (t) void teDeleteTaskDay(ymd(new Date()), t.name);
  };

  const addTask = (name: string, cat: string) => {
    const nm = name.trim();
    if (!nm) return;
    const c = cat || "未分類";
    const k = "t" + Date.now() + Math.random().toString(36).slice(2, 5);
    setTasks((ts) => [
      ...ts,
      { k, name: nm, cat: c, color: catColor(c), todaySec: 0, totalSec: 0, sessions: 0, last: "—", done: false },
    ]);
    // Mirror into today's calendar so the two views stay in sync (0:00 until measured).
    void teAccumulate(ymd(new Date()), nm, c, catColor(c), 0);
    setNewName("");
    setNewCat("未分類");
    setAdding(false);
  };
  const addManyTasks = (list: { name: string; cat: string }[]) => {
    const today = ymd(new Date());
    setTasks((ts) => {
      const have = new Set(ts.map((t) => t.name));
      const add: Task[] = [];
      for (const x of list) {
        if (have.has(x.name)) continue; // de-dupe vs existing AND within the batch
        have.add(x.name);
        const color = catColor(x.cat);
        add.push({
          k: "t" + Date.now() + add.length,
          name: x.name,
          cat: x.cat,
          color,
          todaySec: 0,
          totalSec: 0,
          sessions: 0,
          last: "—",
          done: false,
        });
        // Mirror into today's calendar (0:00 until measured).
        void teAccumulate(today, x.name, x.cat, color, 0);
      }
      return [...ts, ...add];
    });
    setScreen("main");
  };

  const editTime = (k: string) => setEditKey(k);
  const saveTask = (k: string, patch: Partial<Task>) => {
    setTasks((ts) => ts.map((x) => (x.k === k ? { ...x, ...patch } : x)));
    setEditKey(null);
  };

  const addRoutine = (r: { name: string; cat: string }) =>
    setRoutines((rs) => [...rs, { id: "r" + Date.now(), name: r.name, cat: r.cat }]);
  const delRoutine = (id: string) => setRoutines((rs) => rs.filter((r) => r.id !== id));

  const flashNote = useCallback((text: string, icon = "check") => {
    setNote({ text, icon });
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(null), 2600);
  }, []);

  // Flush the running session, persist, and quit (used when "閉じても計測を続
  // ける" is OFF, from the close button or the backend's app-quit-requested).
  // The session flush is AWAITED so its time_entries row commits before the
  // backend's app.exit(0) tears the process down.
  const doQuit = async () => {
    const k = runningKeyRef.current;
    if (k) {
      try {
        await logRunning(k); // await — must commit before app.exit(0)
      } catch {
        /* ignore */
      }
      startedAtRef.current = null;
      runningKeyRef.current = null;
      lastElapsedRef.current = 0;
      reminderBucketRef.current = 0;
      setSession(0);
      setRunning(null);
    }
    try {
      await saveMain({
        tasks: tasksRef.current,
        routines,
        settings,
        runningKey: null,
        sessionSec: 0,
        navIndex,
        savedAt: Date.now(),
        startedAt: null,
        todayDate: todayDateRef.current,
      });
    } catch {
      /* ignore */
    }
    await quitApp();
  };
  useEffect(() => {
    doQuitRef.current = () => void doQuit();
  });

  const closeApp = () => {
    if (!settings.trayKeepRunning) {
      void doQuit();
      return;
    }
    if (pending.length > 0) {
      setScreen("main"); // the carryover dialog renders on main — make sure it's visible
      setShowCarry(true);
    } else {
      flashNote("今日のタスクはすべて完了！");
      void hideToTray();
    }
  };
  const carryMove = (keys: string[]) => {
    const set = new Set(keys);
    if (runningKey && set.has(runningKey)) stop(); // flush before dropping the task
    const today = ymd(new Date());
    const tomorrow = addDays(today, 1);
    const plan = planCarryover(tasksRef.current, keys);
    setTasks((ts) => ts.filter((t) => !set.has(t.k)));
    // Apply the carryover plan: create tomorrow's 0:00 rows (so the task shows on
    // tomorrow's calendar and main list) and drop empty today rows. See
    // planCarryover for the rationale.
    for (const c of plan.carry) void teAccumulate(tomorrow, c.name, c.cat, c.color, 0);
    for (const name of plan.dropToday) void teDeleteTaskDay(today, name);
    setShowCarry(false);
    flashNote(`${keys.length} 件を明日へ繰り越しました`);
    void hideToTray();
  };
  const carryDiscard = (keys: string[]) => {
    const set = new Set(keys);
    if (runningKey && set.has(runningKey)) stop();
    setTasks((ts) => ts.filter((t) => !set.has(t.k)));
    setShowCarry(false);
    flashNote(`${keys.length} 件を破棄しました`);
    void hideToTray();
  };
  const manualCheckUpdate = async () => {
    setScreen("main");
    flashNote("アップデートを確認中…", "download-cloud");
    const u = await checkForUpdate();
    if (u) {
      setUpdate(u);
      flashNote(`新しいバージョン ${u.version} が利用可能です`, "download-cloud");
    } else {
      flashNote(IS_TAURI ? "お使いのバージョンが最新です" : "更新確認はアプリ版でのみ可能です", "check");
    }
  };
  const installUpdate = async () => {
    if (!update) return;
    setUpdating(true);
    try {
      await installUpdateAndRelaunch(update);
    } catch (e) {
      console.error(e);
      setUpdating(false);
      flashNote("更新に失敗しました", "x");
    }
  };

  // --- keyboard (browser fallback + in-window shortcuts) ----------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = ((e.target as HTMLElement)?.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea";
      // Under Tauri the global shortcut is handled natively; only the browser
      // fallback needs the in-window combo so we avoid a double toggle.
      if (!IS_TAURI && settings.globalShortcut && matchShortcut(e, settings.globalShortcutKeys)) {
        e.preventDefault();
        toggleActive();
        return;
      }
      if (e.key === "Escape") {
        if (showCarry) {
          setShowCarry(false);
          return;
        }
        if (editKey) {
          setEditKey(null);
          return;
        }
        if (screen !== "main") {
          setScreen("main");
          return;
        }
        setFiltering(false);
        setQuery("");
        setAdding(false);
        setNewName("");
        return;
      }
      if (screen !== "main" || editKey || typing) return;
      if (e.code === "Space") {
        e.preventDefault();
        toggleActive();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setNav((i) => Math.min(actives.length - 1, i + 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setNav((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (active) startTask(active.k);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        setAdding(true);
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        setFiltering(true);
        return;
      }
      if (/^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        if (actives[idx]) {
          setNav(idx);
          startTask(actives[idx].k);
          setFlashKey(actives[idx].k);
          setTimeout(() => setFlashKey(null), 500);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actives, active, toggleActive, startTask, screen, editKey, settings]);

  useEffect(() => {
    if (filtering && filterRef.current) filterRef.current.focus();
  }, [filtering]);
  useEffect(() => {
    if (adding && addRef.current) addRef.current.focus();
  }, [adding]);

  // Brief opaque card while the persisted state loads (avoids a transparent flash).
  if (!ready) {
    return <div className={rootCls} data-accent={accent} />;
  }

  const toastStack = (
    <>
      {note && (
        <div className="tt-toast">
          <Ico n={note.icon} className="ti" />
          <span>{note.text}</span>
          <button className="x" onClick={() => setNote(null)}>
            <Ico n="x" />
          </button>
        </div>
      )}
      {update && (
        <div className="tt-toast">
          <Ico n="download-cloud" className="ti" />
          <span>
            新しいバージョン <b>{update.version}</b> が利用可能です
          </span>
          <button
            className="tt-btn tt-btn-run"
            style={{ marginLeft: "auto", padding: "5px 12px", fontSize: 12 }}
            disabled={updating}
            onClick={installUpdate}
          >
            {updating ? "更新中…" : "更新"}
          </button>
          <button className="x" onClick={() => setUpdate(null)}>
            <Ico n="x" />
          </button>
        </div>
      )}
    </>
  );

  /* ---------- task editor ---------- */
  if (editKey) {
    const t = tasks.find((x) => x.k === editKey);
    if (t) {
      return (
        <div className={rootCls} data-accent={accent}>
          <TitleBar subtitle="タスクを編集" onCloseApp={closeApp} />
          <TaskEditor
            task={t}
            onSave={saveTask}
            onDelete={(k) => {
              del(k);
              setEditKey(null);
            }}
            onClose={() => setEditKey(null)}
          />
        </div>
      );
    }
  }

  /* ---------- overlay screens ---------- */
  if (screen === "morning") {
    return (
      <div className={rootCls} data-accent={accent}>
        <TitleBar subtitle="朝の準備" onCloseApp={closeApp} />
        <MorningFlow
          routines={routines}
          existingNames={existingNames}
          onAddToday={addManyTasks}
          onClose={() => setScreen("main")}
          onManage={() => setScreen("routines")}
        />
      </div>
    );
  }
  if (screen === "routines") {
    return (
      <div className={rootCls} data-accent={accent}>
        <TitleBar subtitle="ルーティン管理" onCloseApp={closeApp} />
        <RoutineManager
          routines={routines}
          onAdd={addRoutine}
          onDelete={delRoutine}
          onClose={() => setScreen("main")}
        />
      </div>
    );
  }
  if (screen === "calendar") {
    return (
      <div className={rootCls} data-accent={accent}>
        <TitleBar subtitle="カレンダー" onCloseApp={closeApp} />
        <Calendar onClose={() => setScreen("main")} />
      </div>
    );
  }
  if (screen === "stats") {
    return (
      <div className={rootCls} data-accent={accent}>
        <TitleBar subtitle="集計" onCloseApp={closeApp} />
        <Stats onClose={() => setScreen("main")} />
      </div>
    );
  }
  if (screen === "settings") {
    return (
      <div className={rootCls} data-accent={accent}>
        <TitleBar subtitle="設定" onCloseApp={closeApp} />
        <SettingsScreen
          settings={settings}
          routines={routines}
          onChange={setSettings}
          onManageRoutines={() => setScreen("routines")}
          onCheckUpdate={manualCheckUpdate}
          appVersion={APP_VERSION}
          onReset={() => {
            if (runningKey) stop();
            setTasks([]);
            setNav(0);
            setScreen("main");
          }}
          onClose={() => setScreen("main")}
        />
      </div>
    );
  }

  /* ---------- empty ---------- */
  if (tasks.length === 0) {
    return (
      <div className={rootCls} data-accent={accent}>
        <TitleBar onCloseApp={closeApp} />
        <StatusBar live={false} />
        <div className="tt-empty">
          <span className="ico">
            <Ico n="coffee" />
          </span>
          <h3>今日のタスクがありません</h3>
          <p>朝のルーティンから今日のタスクを準備するか、新しいタスクを追加して計測を始めましょう。</p>
          <div className="cta-row">
            <button className="tt-btn tt-btn-run block" onClick={() => setScreen("morning")}>
              <Ico n="sunrise" /> 朝のタスクを準備
            </button>
            <button className="tt-btn tt-btn-ghost block" onClick={() => setScreen("routines")}>
              <Ico n="rotate-cw" /> ルーティンを管理
            </button>
          </div>
        </div>
        {toastStack}
        <Footer
          onReport={() => setScreen("stats")}
          onCalendar={() => setScreen("calendar")}
          onSettings={() => setScreen("settings")}
        />
      </div>
    );
  }

  /* ---------- main ---------- */
  return (
    <div className={rootCls} data-accent={accent}>
      <TitleBar onCloseApp={closeApp} />
      <StatusBar live={live} />

      <div className={"tt-b-hero" + (live ? " live" : "")}>
        {active ? (
          <span className="tt-b-task">
            <span className="dot" style={{ background: active.color }}></span>
            <span className="nm">{active.name}</span>
            <span className="tag">· {active.cat}</span>
            <button className="tt-b-editbtn" title="時間を編集・追記" onClick={() => editTime(active.k)}>
              <Ico n="pencil" />
            </button>
          </span>
        ) : (
          <span className="tt-b-task">
            <span className="nm" style={{ color: "var(--muted-foreground)", fontWeight: 500 }}>
              タスクを選択
            </span>
          </span>
        )}

        <div className={"tt-b-big mono " + (live ? "live" : "idle")}>
          {live ? hms(sessionSec) : "0:00:00"}
        </div>

        <div className="tt-b-sub">
          <span>
            今日 <b className="mono">{hm(todayTotal)}</b>
          </span>
          {active && (
            <span>
              本日 <b>{active.sessions} 回目</b>
            </span>
          )}
        </div>

        <div className="tt-b-cta">
          {live ? (
            <button className="tt-btn tt-btn-stop block" onClick={stop}>
              <Ico n="square" /> 停止{" "}
              <kbd style={{ opacity: 0.6, background: "rgba(255,255,255,.18)", color: "#fff", borderColor: "transparent" }}>
                Space
              </kbd>
            </button>
          ) : (
            <button className="tt-btn tt-btn-run block" onClick={toggleActive}>
              <Ico n="play" /> 開始 <kbd style={{ opacity: 0.7 }}>Space</kbd>
            </button>
          )}
        </div>
      </div>

      <div className="tt-list scroll" style={{ marginTop: 8, paddingBottom: 8 }}>
        <div className="tt-sec">
          <span className="lbl">
            今日のタスク<span className="count">{actives.length}</span>
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="tt-newbtn" onClick={() => setScreen("morning")} title="朝の準備">
              <Ico n="sunrise" />
            </button>
            <button className="tt-newbtn" onClick={() => setFiltering((f) => !f)} title="絞り込み">
              <Ico n="search" /> <kbd>/</kbd>
            </button>
            <button className="tt-newbtn" onClick={() => setAdding(true)}>
              <Ico n="plus" /> 新規 <kbd>Ctrl N</kbd>
            </button>
          </div>
        </div>

        {filtering && (
          <div className="tt-inline">
            <Ico n="search" />
            <input
              ref={filterRef}
              value={query}
              placeholder="タスク名で絞り込み"
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd className="esc">Esc</kbd>
          </div>
        )}
        {adding && (
          <div className="tt-addbox">
            <div className="tt-inline" style={{ margin: 0, border: 0, padding: "2px 0" }}>
              <Ico n="plus" />
              <input
                ref={addRef}
                value={newName}
                placeholder="新しいタスク名を入力"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addTask(newName, newCat);
                  if (e.key === "Escape") {
                    setAdding(false);
                    setNewName("");
                  }
                }}
              />
              <button
                className="tt-inline-add"
                onClick={() => addTask(newName, newCat)}
                disabled={!newName.trim()}
              >
                <Ico n="corner-down-left" />
              </button>
            </div>
            <CategoryPicker value={newCat} onChange={setNewCat} />
          </div>
        )}

        {actives.map((t, i) => {
          const isRun = t.k === runningKey;
          const isNav = !isRun && i === clampedNav;
          return (
            <div
              key={t.k}
              className={
                "tt-row has-num" +
                (isRun ? " running" : isNav ? " selected" : "") +
                (flashKey === t.k ? " nav-flash" : "")
              }
              onClick={() => setNav(i)}
            >
              <span className="swatch" style={{ background: t.color }}></span>
              <span className="rnum">{i + 1}</span>
              <div className="tt-rmain">
                <div className="tt-rtop">
                  <span className="tt-rname">{t.name}</span>
                  <span className="tt-tag">{t.cat}</span>
                </div>
                <div className="tt-rmeta">
                  {isRun ? (
                    <MiniLive />
                  ) : (
                    <>
                      <span>今日 {hm(t.todaySec)}</span>
                      <span className="sep"></span>
                    </>
                  )}
                  <span>累計 {hhmm(t.totalSec)}</span>
                  <span className="sep"></span>
                  <span>{t.sessions} 回</span>
                  <span className="sep"></span>
                  <span>{isRun ? nowHM() : t.last}</span>
                </div>
              </div>
              <div className="tt-rright">
                <div className="tt-acts">
                  {isRun ? (
                    <button
                      className="del"
                      title="停止"
                      onClick={(e) => {
                        e.stopPropagation();
                        stop();
                      }}
                    >
                      <Ico n="square" />
                    </button>
                  ) : (
                    <button
                      className="play"
                      title="開始"
                      onClick={(e) => {
                        e.stopPropagation();
                        startTask(t.k);
                      }}
                    >
                      <Ico n="play" />
                    </button>
                  )}
                  <button
                    title="編集"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditKey(t.k);
                    }}
                  >
                    <Ico n="pencil" />
                  </button>
                  <button
                    title="完了"
                    onClick={(e) => {
                      e.stopPropagation();
                      complete(t.k);
                    }}
                  >
                    <Ico n="check" />
                  </button>
                  <button
                    className="del"
                    title="削除"
                    onClick={(e) => {
                      e.stopPropagation();
                      del(t.k);
                    }}
                  >
                    <Ico n="x" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {dones.length > 0 && <div className="tt-done-div">完了 {dones.length}</div>}
        {dones.map((t) => (
          <div key={t.k} className="tt-row has-num done" onClick={() => complete(t.k)}>
            <span className="swatch" style={{ background: t.color }}></span>
            <span className="rnum">
              <Ico n="check" />
            </span>
            <div className="tt-rmain">
              <div className="tt-rtop">
                <span className="tt-rname">{t.name}</span>
                <span className="tt-tag">{t.cat}</span>
              </div>
              <div className="tt-rmeta">
                <span>今日 {hm(t.todaySec)}</span>
                <span className="sep"></span>
                <span>累計 {hhmm(t.totalSec)}</span>
              </div>
            </div>
            <div className="tt-rright">
              <div className="tt-acts">
                <button
                  title="戻す"
                  onClick={(e) => {
                    e.stopPropagation();
                    complete(t.k);
                  }}
                >
                  <Ico n="rotate-ccw" />
                </button>
                <button
                  className="del"
                  title="削除"
                  onClick={(e) => {
                    e.stopPropagation();
                    del(t.k);
                  }}
                >
                  <Ico n="x" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {toastStack}

      {showCarry && (
        <CarryoverDialog
          tasks={pending}
          onMove={carryMove}
          onDiscard={carryDiscard}
          onClose={() => setShowCarry(false)}
        />
      )}

      <Footer
        onReport={() => setScreen("stats")}
        onCalendar={() => setScreen("calendar")}
        onSettings={() => setScreen("settings")}
      />
    </div>
  );
}
