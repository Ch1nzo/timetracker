import { useEffect, useState } from "react";
import { Ico } from "../lib/icons";
import { catColor } from "../lib/categories";
import { addDays, hm, parseYMD, startOfWeek, WD, ymd } from "../lib/format";
import { teAll, todayStr } from "../lib/db";
import { saveTextFile } from "../lib/tauri";
import type { TimeEntry } from "../lib/types";

/** ⑦ 集計／グラフ — period switch (incl. a free calendar range), category donut,
 *  task ranking, daily trend, and a per-task CSV export for the chosen period. */
export function Stats({ onClose }: { onClose: () => void }) {
  // Recomputed on each open so "today" is correct even after a midnight rollover.
  const today = todayStr();
  const [period, setPeriod] = useState<"day" | "week" | "month" | "custom">("week");
  const [anchor, setAnchor] = useState(today);
  const [cStart, setCStart] = useState(startOfWeek(today));
  const [cEnd, setCEnd] = useState(addDays(startOfWeek(today), 6));
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    void teAll().then(setEntries);
  }, []);

  const cur = parseYMD(anchor);

  let inRange: (e: TimeEntry) => boolean;
  let label: string;
  let days: string[] | null = null;
  let rangeStart: string;
  let rangeEnd: string;
  if (period === "day") {
    inRange = (e) => e.date === anchor;
    label = `${cur.getMonth() + 1}月${cur.getDate()}日（${WD[cur.getDay()]}）`;
    rangeStart = anchor;
    rangeEnd = anchor;
  } else if (period === "week") {
    const ws = startOfWeek(anchor);
    const we = addDays(ws, 6);
    inRange = (e) => e.date >= ws && e.date <= we;
    const a = parseYMD(ws),
      b = parseYMD(we);
    label = `${a.getMonth() + 1}/${a.getDate()} – ${b.getMonth() + 1}/${b.getDate()}`;
    days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
    rangeStart = ws;
    rangeEnd = we;
  } else if (period === "month") {
    const y = cur.getFullYear(),
      m = cur.getMonth();
    inRange = (e) => {
      const d = parseYMD(e.date);
      return d.getFullYear() === y && d.getMonth() === m;
    };
    label = `${y}年 ${m + 1}月`;
    const dim = new Date(y, m + 1, 0).getDate();
    days = Array.from({ length: dim }, (_, i) => ymd(new Date(y, m, i + 1)));
    rangeStart = ymd(new Date(y, m, 1));
    rangeEnd = ymd(new Date(y, m, dim));
  } else {
    // Free calendar range — normalize so start <= end.
    const s = cStart <= cEnd ? cStart : cEnd;
    const e2 = cStart <= cEnd ? cEnd : cStart;
    inRange = (e) => e.date >= s && e.date <= e2;
    const a = parseYMD(s),
      b = parseYMD(e2);
    label = `${a.getMonth() + 1}/${a.getDate()} – ${b.getMonth() + 1}/${b.getDate()}`;
    rangeStart = s;
    rangeEnd = e2;
    const span = Math.round((parseYMD(e2).getTime() - parseYMD(s).getTime()) / 86400000) + 1;
    days = span > 0 && span <= 62 ? Array.from({ length: span }, (_, i) => addDays(s, i)) : null;
  }

  const rows = entries.filter(inRange);
  const total = rows.reduce((a, e) => a + e.sec, 0);

  const step = (dir: number) => {
    if (period === "day") setAnchor(addDays(anchor, dir));
    else if (period === "week") setAnchor(addDays(anchor, dir * 7));
    else if (period === "month") setAnchor(ymd(new Date(cur.getFullYear(), cur.getMonth() + dir, 1)));
  };

  // by category
  const catMap: Record<string, number> = {};
  rows.forEach((e) => {
    catMap[e.cat] = (catMap[e.cat] || 0) + e.sec;
  });
  const catList = Object.entries(catMap)
    .map(([cat, sec]) => ({ cat, sec, color: catColor(cat) }))
    .sort((a, b) => b.sec - a.sec);

  // by task (aggregated — one entry per task name over the period)
  const taskMap: Record<string, { name: string; sec: number; color: string; cat: string }> = {};
  rows.forEach((e) => {
    if (!taskMap[e.name]) taskMap[e.name] = { name: e.name, sec: 0, color: e.color, cat: e.cat };
    taskMap[e.name].sec += e.sec;
  });
  const taskList = Object.values(taskMap).sort((a, b) => b.sec - a.sec);
  const taskMax = taskList.length ? taskList[0].sec : 1;

  // daily trend
  const trend = days
    ? days.map((s) => ({ s, sec: rows.filter((e) => e.date === s).reduce((a, e) => a + e.sec, 0) }))
    : null;
  const trendMax = trend ? Math.max(1, ...trend.map((t) => t.sec)) : 1;

  // CSV: one aggregated row per task for the selected period (minutes only),
  // saved via a native dialog (then revealed in the file manager) under Tauri.
  const exportCsv = async () => {
    const q = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const head = "タスク,カテゴリ,時間(分)";
    const lines = taskList.map((t) => `${q(t.name)},${q(t.cat)},${Math.round(t.sec / 60)}`);
    const totalLine = `${q("合計")},,${Math.round(total / 60)}`;
    const csv = "﻿" + [head, ...lines, totalLine].join("\n");
    const fname =
      rangeStart === rangeEnd
        ? `timetracker_${rangeStart}.csv`
        : `timetracker_${rangeStart}_${rangeEnd}.csv`;
    const r = await saveTextFile(fname, csv);
    if (r.status === "saved") setSaveMsg("保存しました（保存先フォルダを開きました）");
    else if (r.status === "downloaded") setSaveMsg("ダウンロードしました");
    else if (r.status === "error") setSaveMsg("保存に失敗しました");
    else setSaveMsg("");
    if (r.status === "saved" || r.status === "downloaded") {
      window.setTimeout(() => setSaveMsg(""), 3500);
    }
  };

  // donut geometry
  const R = 54,
    C = 2 * Math.PI * R;
  let acc = 0;
  const segs = catList.map((c) => {
    const frac = total ? c.sec / total : 0;
    const seg = { color: c.color, dash: frac * C, offset: -acc * C };
    acc += frac;
    return seg;
  });

  return (
    <div className="tt-overlay">
      <div className="tt-ov-head">
        <button className="tt-ov-back" onClick={onClose} title="戻る">
          <Ico n="arrow-left" />
        </button>
        <div className="tt-ov-titles">
          <div className="t">
            <Ico n="bar-chart-3" className="ti" /> 集計
          </div>
          <div className="s">何にいちばん時間を使っているか</div>
        </div>
      </div>

      <div className="tt-cal-sub">
        <div className="tt-seg">
          <button className={period === "day" ? "sel" : ""} onClick={() => setPeriod("day")}>
            日
          </button>
          <button className={period === "week" ? "sel" : ""} onClick={() => setPeriod("week")}>
            週
          </button>
          <button className={period === "month" ? "sel" : ""} onClick={() => setPeriod("month")}>
            月
          </button>
          <button className={period === "custom" ? "sel" : ""} onClick={() => setPeriod("custom")}>
            期間
          </button>
        </div>
        <span className="tt-cal-spacer"></span>
        {period === "custom" ? (
          <div className="tt-cal-range">
            <span className="tt-datefield">
              <input type="date" value={cStart} onChange={(e) => setCStart(e.target.value)} />
            </span>
            <span className="dash">–</span>
            <span className="tt-datefield">
              <input type="date" value={cEnd} onChange={(e) => setCEnd(e.target.value)} />
            </span>
          </div>
        ) : (
          <div className="tt-cal-nav">
            <button onClick={() => step(-1)} title="前へ">
              <Ico n="chevron-left" />
            </button>
            <span className="tt-cal-period">{label}</span>
            <button onClick={() => step(1)} title="次へ">
              <Ico n="chevron-right" />
            </button>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="tt-stat-empty">
          <span className="ico">
            <Ico n="inbox" />
          </span>
          <h3>この期間の記録はありません</h3>
          <p>計測を行うとここに集計とグラフが表示されます。</p>
        </div>
      ) : (
        <div className="tt-cal-body">
          <div className="tt-stat-summary">
            <div>
              <div className="lbl">合計作業時間</div>
              <div className="big">{hm(total)}</div>
            </div>
            <div className="side">
              <div>
                <b>{taskList.length}</b> タスク
              </div>
              <div>
                <b>{rows.length}</b> セッション
              </div>
            </div>
          </div>

          <div className="tt-stat-card">
            <div className="ch">
              <Ico n="pie-chart" /> カテゴリ別
            </div>
            <div className="tt-donut-wrap">
              <div className="tt-donut">
                <svg viewBox="0 0 128 128" width="124" height="124">
                  <circle cx="64" cy="64" r={R} fill="none" stroke="var(--secondary)" strokeWidth="14" />
                  {segs.map((s, i) => (
                    <circle
                      key={i}
                      cx="64"
                      cy="64"
                      r={R}
                      fill="none"
                      stroke={s.color}
                      strokeWidth="14"
                      strokeDasharray={`${s.dash} ${C - s.dash}`}
                      strokeDashoffset={s.offset}
                    />
                  ))}
                </svg>
                <div className="center">
                  <span className="v">{hm(total)}</span>
                  <span className="k">合計</span>
                </div>
              </div>
              <div className="tt-legend">
                {catList.map((c) => (
                  <div key={c.cat} className="tt-leg">
                    <span className="d" style={{ background: c.color }}></span>
                    <span className="nm">{c.cat}</span>
                    <span className="vv">
                      {hm(c.sec)}
                      <span className="pct"> {Math.round((c.sec / total) * 100)}%</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="tt-stat-card">
            <div className="ch">
              <Ico n="bar-chart-3" /> タスク別 トップ{Math.min(6, taskList.length)}
            </div>
            <div className="tt-bars">
              {taskList.slice(0, 6).map((t) => (
                <div key={t.name} className="tt-bar">
                  <div className="top">
                    <span className="nm">
                      <span className="d" style={{ background: t.color }}></span>
                      <span>{t.name}</span>
                    </span>
                    <span className="vv">{hm(t.sec)}</span>
                  </div>
                  <div className="track">
                    <div
                      className="fill"
                      style={{ width: Math.max(3, (t.sec / taskMax) * 100) + "%", background: t.color }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {trend && (
            <div className="tt-stat-card">
              <div className="ch">
                <Ico n="calendar-days" /> 日別の推移
              </div>
              <div className="tt-trend">
                {trend.map((t) => {
                  const d = parseYMD(t.s);
                  const showLab = period === "week" || d.getDate() % 5 === 1 || d.getDate() === 1;
                  return (
                    <div key={t.s} className={"col" + (t.s === today ? " today" : "")}>
                      <div className="bar" style={{ height: (t.sec / trendMax) * 100 + "%" }}></div>
                      <span className="lab">
                        {period === "week" ? WD[d.getDay()] : showLab ? d.getDate() : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="tt-csv-row">
            <button className="tt-btn tt-btn-ghost block" onClick={() => void exportCsv()}>
              <Ico n="download" /> CSV でエクスポート
            </button>
            {saveMsg && <div className="tt-csv-msg">{saveMsg}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
