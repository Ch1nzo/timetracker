// Reactive category store. Mirrors the design's tt-shared.jsx behaviour
// (a module-level array mutated in place so every reference stays live) but
// persists to SQLite via an injected callback instead of localStorage.
import { useEffect, useState } from "react";
import type { Category } from "./types";

export const PALETTE = [
  "#60a5fa",
  "#34d399",
  "#f472b6",
  "#fbbf24",
  "#a78bfa",
  "#22d3ee",
  "#94a3b8",
  "#fb923c",
];

const DEFAULT_CATEGORIES: Category[] = [
  { name: "プロダクト", color: "#60a5fa" },
  { name: "開発", color: "#34d399" },
  { name: "デザイン", color: "#f472b6" },
  { name: "会議", color: "#fbbf24" },
  { name: "経営", color: "#a78bfa" },
  { name: "リサーチ", color: "#22d3ee" },
  { name: "雑務", color: "#94a3b8" },
  { name: "未分類", color: "#fb923c" },
];

// Live array — components read this directly and re-render via listeners.
export const CATEGORIES: Category[] = DEFAULT_CATEGORIES.map((c) => ({ ...c }));
const SEED_CAT_NAMES = DEFAULT_CATEGORIES.map((c) => c.name);

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((fn) => fn());
}

export const catColor = (name: string): string =>
  CATEGORIES.find((c) => c.name === name)?.color || "#94a3b8";

// Persistence is injected by the data layer to avoid a circular import.
let persistFn: (cats: Category[]) => void = () => {};
export function registerCatPersist(fn: (cats: Category[]) => void) {
  persistFn = fn;
}
function persist() {
  persistFn(CATEGORIES.map((c) => ({ ...c })));
}

/** Replace the live list from persisted data (called once on startup). */
export function hydrateCategories(raw: unknown) {
  if (!Array.isArray(raw) || raw.length === 0) return;
  const next: Category[] = [];
  (raw as Category[]).forEach((c) => {
    if (c && c.name && !next.some((x) => x.name === c.name)) {
      const seed = CATEGORIES.find((x) => x.name === c.name);
      next.push({
        name: c.name,
        color: c.color || seed?.color || PALETTE[next.length % PALETTE.length],
        custom: !SEED_CAT_NAMES.includes(c.name),
      });
    }
  });
  // Make sure no standard category got lost.
  CATEGORIES.forEach((c) => {
    if (!next.some((x) => x.name === c.name)) next.push({ ...c });
  });
  CATEGORIES.splice(0, CATEGORIES.length, ...next);
  emit();
}

export function addCategory(name: string): string | null {
  const nm = (name || "").trim();
  if (!nm) return null;
  if (CATEGORIES.some((c) => c.name === nm)) return nm;
  const color = PALETTE[CATEGORIES.length % PALETTE.length];
  const i = CATEGORIES.findIndex((c) => c.name === "未分類");
  const entry: Category = { name: nm, color, custom: true };
  if (i >= 0) CATEGORIES.splice(i, 0, entry);
  else CATEGORIES.push(entry);
  persist();
  emit();
  return nm;
}

export function removeCategory(name: string) {
  const i = CATEGORIES.findIndex((c) => c.name === name);
  if (i < 0 || SEED_CAT_NAMES.includes(name)) return;
  CATEGORIES.splice(i, 1);
  persist();
  emit();
}

export function moveCategory(from: number, to: number) {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= CATEGORIES.length ||
    to >= CATEGORIES.length
  )
    return;
  const [it] = CATEGORIES.splice(from, 1);
  CATEGORIES.splice(to, 0, it);
  persist();
  emit();
}

export function useCategories(): Category[] {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((x) => x + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return CATEGORIES;
}
