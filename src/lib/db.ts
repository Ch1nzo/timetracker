// SQLite data access. Two stores:
//   * app_state  — JSON blobs for the live working set ("main") and categories.
//   * time_entries — the real measured-session log behind calendar + stats.
import Database from "@tauri-apps/plugin-sql";
import { hydrateCategories, registerCatPersist } from "./categories";
import { ymd } from "./format";
import type { Category, MainState, TimeEntry } from "./types";

let dbp: Promise<Database> | null = null;
export function getDb(): Promise<Database> {
  if (!dbp) dbp = Database.load("sqlite:timetracker.db");
  return dbp;
}

/** Real "today" (YYYY-MM-DD), recomputed from the wall clock. */
export const todayStr = (): string => ymd(new Date());

// --- key/value blobs ---------------------------------------------------
async function kvGet<T>(key: string): Promise<T | null> {
  const db = await getDb();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM app_state WHERE key = $1",
    [key],
  );
  if (!rows.length) return null;
  try {
    return JSON.parse(rows[0].value) as T;
  } catch {
    return null;
  }
}
async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO app_state (key, value) VALUES ($1, $2) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, JSON.stringify(value)],
  );
}

export const loadMain = () => kvGet<MainState>("main");
export const saveMain = (state: MainState) => kvSet("main", state);

const loadCategories = () => kvGet<Category[]>("categories");
const saveCategories = (cats: Category[]) => {
  void kvSet("categories", cats);
};

// --- time entries ------------------------------------------------------
export async function teAll(): Promise<TimeEntry[]> {
  const db = await getDb();
  return db.select<TimeEntry[]>(
    "SELECT id, date, name, cat, color, sec, source, created_at FROM time_entries ORDER BY date ASC, created_at ASC",
  );
}

export async function teAdd(e: TimeEntry): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO time_entries (id, date, name, cat, color, sec, source, created_at) " +
      "VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    [e.id, e.date, e.name, e.cat, e.color, e.sec, e.source ?? "timer", e.created_at ?? Date.now()],
  );
}

export async function teUpdate(id: string, patch: Partial<TimeEntry>): Promise<void> {
  const db = await getDb();
  const fields: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const key of ["date", "name", "cat", "color", "sec"] as const) {
    if (patch[key] !== undefined) {
      fields.push(`${key} = $${i++}`);
      vals.push(patch[key]);
    }
  }
  if (!fields.length) return;
  vals.push(id);
  await db.execute(`UPDATE time_entries SET ${fields.join(", ")} WHERE id = $${i}`, vals);
}

export async function teMove(id: string, date: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE time_entries SET date = $1 WHERE id = $2", [date, id]);
}

export async function teDelete(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM time_entries WHERE id = $1", [id]);
}

/** One row per (name, date): add `sec` to that day's row for the task, or create
 *  it. Used both when a task is added to the main list (sec=0) and when a
 *  measured segment is flushed (sec=delta), so a day shows exactly its task list
 *  with no per-session duplicate rows — keeping the main screen and the calendar
 *  in sync for that day. */
export async function teAccumulate(
  date: string,
  name: string,
  cat: string,
  color: string,
  sec: number,
): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ id: string; sec: number }[]>(
    "SELECT id, sec FROM time_entries WHERE date = $1 AND name = $2 ORDER BY created_at ASC LIMIT 1",
    [date, name],
  );
  if (rows.length) {
    await db.execute("UPDATE time_entries SET sec = $1, cat = $2, color = $3 WHERE id = $4", [
      rows[0].sec + sec,
      cat,
      color,
      rows[0].id,
    ]);
  } else {
    await db.execute(
      "INSERT INTO time_entries (id, date, name, cat, color, sec, source, created_at) " +
        "VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [
        "te" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        date,
        name,
        cat,
        color,
        sec,
        "timer",
        Date.now(),
      ],
    );
  }
}

/** Remove a task's record for a given day (symmetric to adding it). */
export async function teDeleteTaskDay(date: string, name: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM time_entries WHERE date = $1 AND name = $2", [date, name]);
}

/** Wire up category persistence. Call once on startup. No demo data is seeded —
 *  tasks and measured history start empty and accumulate from real usage. */
export async function initData(): Promise<void> {
  const db = await getDb();
  // Cleanup for installs upgraded from v0.4.x: those builds seeded a demo
  // history (source='seed'). The seeding code is gone, but the rows lingered in
  // the DB across updates and made the calendar/stats show fake sessions that
  // don't match the (real) main task list. Remove them so the calendar only ever
  // reflects the user's own measured sessions. Idempotent — a no-op once purged.
  try {
    await db.execute("DELETE FROM time_entries WHERE source = $1", ["seed"]);
  } catch {
    /* ignore */
  }
  registerCatPersist(saveCategories);
  const cats = await loadCategories();
  if (cats) hydrateCategories(cats);
}
