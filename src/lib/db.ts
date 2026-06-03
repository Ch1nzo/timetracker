// SQLite data access. Two stores:
//   * app_state  — JSON blobs for the live working set ("main") and categories.
//   * time_entries — the real measured-session log behind calendar + stats.
import Database from "@tauri-apps/plugin-sql";
import { catColor, hydrateCategories, registerCatPersist } from "./categories";
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

async function teCount(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM time_entries");
  return rows[0]?.n ?? 0;
}

// --- demo history seed (relative to the real current date) -------------
const mulberry32 = (a: number) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const POOL = [
  { name: "仕様書レビュー", cat: "プロダクト" },
  { name: "API 実装", cat: "開発" },
  { name: "デザインレビュー", cat: "デザイン" },
  { name: "定例ミーティング", cat: "会議" },
  { name: "月次レポート作成", cat: "経営" },
  { name: "競合調査", cat: "リサーチ" },
  { name: "メール返信", cat: "雑務" },
  { name: "コードレビュー", cat: "開発" },
  { name: "1on1", cat: "会議" },
];

function seedEntries(): TimeEntry[] {
  const out: TimeEntry[] = [];
  let id = 1;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - 16);
  const end = new Date(today);
  end.setDate(end.getDate() + 10);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    const rnd = mulberry32(
      d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(),
    );
    const future = d > today;
    let n = dow === 0 || dow === 6 ? (rnd() < 0.5 ? 0 : 1) : 2 + Math.floor(rnd() * 3);
    if (future) n = rnd() < 0.6 ? 0 : 1;
    const used = new Set<string>();
    for (let i = 0; i < n; i++) {
      let p = POOL[0];
      let g = 0;
      do {
        p = POOL[Math.floor(rnd() * POOL.length)];
        g++;
      } while (used.has(p.name) && g < 12);
      used.add(p.name);
      out.push({
        id: "e" + id++,
        date: ymd(d),
        name: p.name,
        cat: p.cat,
        color: catColor(p.cat),
        sec: Math.floor(25 + rnd() * 125) * 60,
        source: "seed",
        created_at: d.getTime() + i,
      });
    }
  }
  return out;
}

async function seedTimeEntriesIfEmpty(): Promise<void> {
  if ((await teCount()) > 0) return;
  const db = await getDb();
  const entries = seedEntries();
  // One multi-row transaction keeps the first launch snappy.
  for (const e of entries) await teAdd(e);
  void db; // (kept for clarity; teAdd opens its own handle)
}

/** Wire up persistence and seed demo data. Call once on startup. */
export async function initData(): Promise<void> {
  await getDb();
  registerCatPersist(saveCategories);
  const cats = await loadCategories();
  if (cats) hydrateCategories(cats);
  await seedTimeEntriesIfEmpty();
}
