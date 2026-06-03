// Time formatting helpers (ported verbatim from the design prototype).

export const pad = (n: number): string => String(n).padStart(2, "0");

/** H:MM:SS */
export const hms = (s: number): string =>
  `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;

/** H:MM */
export const hm = (s: number): string =>
  `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}`;

/** HH:MM (zero-padded hours) */
export const hhmm = (s: number): string =>
  `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}`;

/** Current wall-clock HH:MM */
export const nowHM = (): string => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// --- date helpers (used by calendar / stats) ---------------------------
export const ymd = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseYMD = (s: string): Date => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (s: string, n: number): string => {
  const d = parseYMD(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};

export const startOfWeek = (s: string): string => {
  const d = parseYMD(s);
  d.setDate(d.getDate() - d.getDay());
  return ymd(d);
};

export const WD = ["日", "月", "火", "水", "木", "金", "土"];
