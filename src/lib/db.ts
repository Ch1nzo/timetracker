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

/** Wire up category persistence. Call once on startup. No demo data is seeded —
 *  tasks and measured history start empty and accumulate from real usage. */
export async function initData(): Promise<void> {
  await getDb();
  registerCatPersist(saveCategories);
  const cats = await loadCategories();
  if (cats) hydrateCategories(cats);
}
