import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { Ico } from "../lib/icons";
import { catColor } from "../lib/categories";
import { CategoryPicker } from "../components/CategoryPicker";
import { addDays, hm, parseYMD, startOfWeek, WD, ymd } from "../lib/format";
import { teAll, teDelete, teMove, teUpdate, todayStr } from "../lib/db";
import type { TimeEntry } from "../lib/types";

const TODAY_STR = todayStr();

/** ⑥ カレンダー — month / week views, drag-to-move, tap-to-edit. */
export function Calendar({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [view, setView] = useState<"month" | "week">("month");
  const [anchor, setAnchor] = useState(TODAY_STR);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);

  useEffect(() => {
    void teAll().then(setEntries);
  }, []);

  const byDate = (s: string) => entries.filter((e) => e.date === s);
  const dayTotal = (s: string) => byDate(s).reduce((a, e) => a + e.sec, 0);

  const move = (id: string, toDate: string) => {
    setEntries((es) => es.map((e) => (e.id === id ? { ...e, date: toDate } : e)));
    void teMove(id, toDate);
  };
  const saveEntry = (id: string, patch: Partial<TimeEntry>) => {
    setEntries((es) => es.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    void teUpdate(id, patch);
    setEditId(null);
  };
  const delEntry = (id: string) => {
    setEntries((es) => es.filter((e) => e.id !== id));
    void teDelete(id);
    setEditId(null);
  };

  const onDrop = (toDate: string) => {
    if (dragId.current) move(dragId.current, toDate);
    dragId.current = null;
    setDragOver(null);
  };

  const cur = parseYMD(anchor);
  const stepPrev = () =>
    setAnchor(
      view === "month"
        ? ymd(new Date(cur.getFullYear(), cur.getMonth() - 1, Math.min(cur.getDate(), 28)))
        : addDays(anchor, -7),
    );
  const stepNext = () =>
    setAnchor(
      view === "month"
        ? ymd(new Date(cur.getFullYear(), cur.getMonth() + 1, Math.min(cur.getDate(), 28)))
        : addDays(anchor, 7),
    );

  if (editId) {
    const e = entries.find((x) => x.id === editId);
    if (e)
      return (
        <CalEntryEditor
          entry={e}
          onSave={saveEntry}
          onDelete={delEntry}
          onClose={() => setEditId(null)}
        />
      );
  }

  const periodLabel =
    view === "month"
      ? `${cur.getFullYear()}年 ${cur.getMonth() + 1}月`
      : (() => {
          const ws = startOfWeek(anchor),
            we = addDays(ws, 6);
          const a = parseYMD(ws),
            b = parseYMD(we);
          return `${a.getMonth() + 1}/${a.getDate()} – ${b.getMonth() + 1}/${b.getDate()}`;
        })();

  return (
    <div className="tt-overlay">
      <div className="tt-ov-head">
        <button className="tt-ov-back" onClick={onClose} title="戻る">
          <Ico n="arrow-left" />
        </button>
        <div className="tt-ov-titles">
          <div className="t">
            <Ico n="calendar-days" className="ti" /> カレンダー
          </div>
          <div className="s">日付ごとの記録を確認・編集・移動</div>
        </div>
      </div>

      <div className="tt-cal-sub">
        <div className="tt-seg">
          <button className={view === "month" ? "sel" : ""} onClick={() => setView("month")}>
            月
          </button>
          <button className={view === "week" ? "sel" : ""} onClick={() => setView("week")}>
            週
          </button>
        </div>
        <span className="tt-cal-spacer"></span>
        <div className="tt-cal-nav">
          <button onClick={stepPrev} title="前へ">
            <Ico n="chevron-left" />
          </button>
          <span className="tt-cal-period">{periodLabel}</span>
          <button onClick={stepNext} title="次へ">
            <Ico n="chevron-right" />
          </button>
        </div>
        <button className="tt-cal-today" onClick={() => setAnchor(TODAY_STR)}>
          今日
        </button>
      </div>

      {view === "month" ? (
        <MonthView
          cur={cur}
          anchor={anchor}
          setAnchor={setAnchor}
          byDate={byDate}
          dayTotal={dayTotal}
          dragOver={dragOver}
          setDragOver={setDragOver}
          dragId={dragId}
          onDrop={onDrop}
          onEdit={setEditId}
        />
      ) : (
        <WeekView
          anchor={anchor}
          byDate={byDate}
          dayTotal={dayTotal}
          dragOver={dragOver}
          setDragOver={setDragOver}
          dragId={dragId}
          onDrop={onDrop}
          onEdit={setEditId}
        />
      )}
    </div>
  );
}

function EntryRow({
  e,
  dragId,
  setDragOver,
  onEdit,
  compact,
}: {
  e: TimeEntry;
  dragId: MutableRefObject<string | null>;
  setDragOver: (s: string | null) => void;
  onEdit: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <div
      className="tt-cal-entry"
      draggable
      onDragStart={() => {
        dragId.current = e.id;
      }}
      onDragEnd={() => {
        dragId.current = null;
        setDragOver(null);
      }}
      onClick={() => onEdit(e.id)}
    >
      <span className="grip">
        <Ico n="grip-vertical" />
      </span>
      <span className="em">
        <span className="d" style={{ background: e.color }}></span>
        <span className="nm">{e.name}</span>
        {!compact && <span className="tg">{e.cat}</span>}
      </span>
      <span className="tm">{hm(e.sec)}</span>
      <span className="grip" style={{ pointerEvents: "none" }}>
        <Ico n="pencil" />
      </span>
    </div>
  );
}

interface ViewShared {
  byDate: (s: string) => TimeEntry[];
  dayTotal: (s: string) => number;
  dragOver: string | null;
  setDragOver: (s: string | null) => void;
  dragId: MutableRefObject<string | null>;
  onDrop: (toDate: string) => void;
  onEdit: (id: string) => void;
}

function MonthView({
  cur,
  anchor,
  setAnchor,
  byDate,
  dayTotal,
  dragOver,
  setDragOver,
  dragId,
  onDrop,
  onEdit,
}: ViewShared & {
  cur: Date;
  anchor: string;
  setAnchor: (s: string) => void;
}) {
  const first = new Date(cur.getFullYear(), cur.getMonth(), 1);
  const startStr = addDays(ymd(first), -first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => addDays(startStr, i));
  const m = cur.getMonth();
  const detail = byDate(anchor);
  const dd = parseYMD(anchor);

  return (
    <div className="tt-cal-body">
      <div className="tt-cal-dow">
        {WD.map((w, i) => (
          <span key={w} className={i === 0 ? "sun" : i === 6 ? "sat" : ""}>
            {w}
          </span>
        ))}
      </div>
      <div className="tt-cal-grid">
        {cells.map((s) => {
          const d = parseYMD(s);
          const list = byDate(s);
          const tot = dayTotal(s);
          const cls =
            "tt-cal-cell" +
            (d.getMonth() !== m ? " other" : "") +
            (s === TODAY_STR ? " today" : "") +
            (s === anchor ? " sel" : "") +
            (dragOver === s ? " dragover" : "");
          return (
            <div
              key={s}
              className={cls}
              onClick={() => setAnchor(s)}
              onDragOver={(ev) => {
                ev.preventDefault();
                if (dragOver !== s) setDragOver(s);
              }}
              onDragLeave={() => setDragOver(dragOver === s ? null : dragOver)}
              onDrop={(ev) => {
                ev.preventDefault();
                onDrop(s);
              }}
            >
              <span className="dn">{d.getDate()}</span>
              {tot > 0 && <span className="tot">{hm(tot)}</span>}
              <span className="dots">
                {list.slice(0, 4).map((e) => (
                  <i key={e.id} style={{ background: e.color }}></i>
                ))}
              </span>
            </div>
          );
        })}
      </div>

      <div className="tt-drag-hint">
        <Ico n="grip-vertical" /> タスクを別の日へドラッグして移動
      </div>

      <div className="tt-cal-detail">
        <div className="dh">
          <span className="dt">
            {dd.getMonth() + 1}月{dd.getDate()}日（{WD[dd.getDay()]}）
          </span>
          <span className="dtot">{detail.length ? "計 " + hm(dayTotal(anchor)) : ""}</span>
        </div>
        {detail.length === 0 ? (
          <div className="empty">この日の記録はありません</div>
        ) : (
          detail.map((e) => (
            <EntryRow key={e.id} e={e} dragId={dragId} setDragOver={setDragOver} onEdit={onEdit} />
          ))
        )}
      </div>
    </div>
  );
}

function WeekView({
  anchor,
  byDate,
  dayTotal,
  dragOver,
  setDragOver,
  dragId,
  onDrop,
  onEdit,
}: ViewShared & { anchor: string }) {
  const ws = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  return (
    <div className="tt-cal-body">
      <div className="tt-week">
        {days.map((s) => {
          const d = parseYMD(s);
          const list = byDate(s);
          const cls =
            "tt-week-day" + (s === TODAY_STR ? " today" : "") + (dragOver === s ? " dragover" : "");
          return (
            <div
              key={s}
              className={cls}
              onDragOver={(ev) => {
                ev.preventDefault();
                if (dragOver !== s) setDragOver(s);
              }}
              onDragLeave={() => setDragOver(dragOver === s ? null : dragOver)}
              onDrop={(ev) => {
                ev.preventDefault();
                onDrop(s);
              }}
            >
              <div className="wh">
                <span className="wd">{WD[d.getDay()]}</span>
                <span className="wn">
                  {d.getMonth() + 1}/{d.getDate()}
                </span>
                <span className="wtot">{list.length ? hm(dayTotal(s)) : "—"}</span>
              </div>
              <div className="wbody">
                {list.length === 0 ? (
                  <div className="wempty">記録なし</div>
                ) : (
                  list.map((e) => (
                    <EntryRow
                      key={e.id}
                      e={e}
                      dragId={dragId}
                      setDragOver={setDragOver}
                      onEdit={onEdit}
                      compact
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalEntryEditor({
  entry,
  onSave,
  onDelete,
  onClose,
}: {
  entry: TimeEntry;
  onSave: (id: string, patch: Partial<TimeEntry>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(entry.name);
  const [cat, setCat] = useState(entry.cat);
  const [h, setH] = useState(Math.floor(entry.sec / 3600));
  const [mn, setMn] = useState(Math.floor((entry.sec % 3600) / 60));
  const [date, setDate] = useState(entry.date);
  const clampH = (v: string) => Math.max(0, Math.min(23, parseInt(v, 10) || 0));
  const clampM = (v: string) => Math.max(0, Math.min(59, parseInt(v, 10) || 0));
  const color = catColor(cat);
  const save = () => {
    const nm = name.trim();
    if (!nm) return;
    onSave(entry.id, { name: nm, cat, color, sec: h * 3600 + mn * 60, date });
  };

  return (
    <div className="tt-overlay">
      <div className="tt-ov-head">
        <button className="tt-ov-back" onClick={onClose} title="戻る">
          <Ico n="arrow-left" />
        </button>
        <div className="tt-ov-titles">
          <div className="t">
            <Ico n="pencil" className="ti" /> 記録を編集
          </div>
          <div className="s">日付の変更でほかの日へ移動できます</div>
        </div>
      </div>
      <div className="tt-ov-body">
        <div className="tt-ed-preview">
          <span className="d" style={{ background: color }}></span>
          <span className="nm">{name.trim() || "（名称未設定）"}</span>
          <span className="tg">{cat}</span>
        </div>
        <div className="tt-field">
          <span className="lbl">タスク名</span>
          <input
            className="tt-textin"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
          />
        </div>
        <div className="tt-field">
          <span className="lbl">カテゴリ</span>
          <CategoryPicker value={cat} onChange={setCat} />
        </div>
        <div className="tt-field">
          <span className="lbl">作業時間</span>
          <div className="tt-timegrp">
            <span className="tt-timefield">
              <input type="number" value={h} min="0" max="23" onChange={(e) => setH(clampH(e.target.value))} />
              <span className="u">時</span>
            </span>
            <span className="colon">:</span>
            <span className="tt-timefield">
              <input type="number" value={mn} min="0" max="59" onChange={(e) => setMn(clampM(e.target.value))} />
              <span className="u">分</span>
            </span>
          </div>
        </div>
        <div className="tt-field">
          <span className="lbl">日付</span>
          <span className="tt-datefield">
            <Ico n="calendar-days" />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </span>
        </div>
      </div>
      <div className="tt-ov-foot">
        <button className="tt-btn tt-btn-danger" onClick={() => onDelete(entry.id)}>
          <Ico n="trash" /> 削除
        </button>
        <button className="tt-btn tt-btn-run block" onClick={save} disabled={!name.trim()}>
          <Ico n="check" /> 保存
        </button>
      </div>
    </div>
  );
}
