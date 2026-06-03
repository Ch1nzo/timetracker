import { useRef, useState } from "react";
import { Ico } from "../lib/icons";
import { catColor } from "../lib/categories";
import { CategoryPicker } from "../components/CategoryPicker";
import type { Routine } from "../lib/types";

interface Extra {
  name: string;
  cat: string;
}

/** ③ 朝のタスク入力フロー — pick routines as chips + add custom tasks. */
export function MorningFlow({
  routines,
  existingNames,
  onAddToday,
  onClose,
  onManage,
}: {
  routines: Routine[];
  existingNames: string[];
  onAddToday: (list: Extra[]) => void;
  onClose: () => void;
  onManage: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [extras, setExtras] = useState<Extra[]>([]);
  const [name, setName] = useState("");
  const [cat, setCat] = useState("未分類");
  const inputRef = useRef<HTMLInputElement>(null);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const addExtra = () => {
    const nm = name.trim();
    if (!nm) return;
    setExtras((x) => [...x, { name: nm, cat }]);
    setName("");
    setCat("未分類");
    inputRef.current?.focus();
  };
  const removeExtra = (i: number) =>
    setExtras((x) => x.filter((_, idx) => idx !== i));

  const pickedList = routines.filter((r) => picked.has(r.id));
  const total = pickedList.length + extras.length;
  const commit = () => {
    if (total === 0) return;
    onAddToday([
      ...pickedList.map((r) => ({ name: r.name, cat: r.cat })),
      ...extras,
    ]);
  };

  return (
    <div className="tt-overlay">
      <div className="tt-ov-head">
        <button className="tt-ov-back" onClick={onClose} title="戻る">
          <Ico n="arrow-left" />
        </button>
        <div className="tt-ov-titles">
          <div className="t">
            <Ico n="sunrise" className="ti" /> 今日のタスクを準備
          </div>
          <div className="s">いつものルーティンを選ぶか、新しく追加</div>
        </div>
      </div>

      <div className="tt-ov-body">
        <div className="tt-ov-sec">
          <span className="lbl">ルーティンから選ぶ</span>
          <button className="tt-linkbtn" onClick={onManage}>
            <Ico n="settings" /> 管理
          </button>
        </div>
        <div className="tt-chips">
          {routines.map((r) => {
            const sel = picked.has(r.id);
            const already = existingNames.includes(r.name);
            const c = catColor(r.cat);
            return (
              <button
                key={r.id}
                type="button"
                className={"tt-chip" + (sel ? " sel" : "") + (already ? " already" : "")}
                style={sel ? { borderColor: c, background: c + "22" } : undefined}
                onClick={() => !already && toggle(r.id)}
                title={already ? "すでに今日に追加済み" : ""}
              >
                <span className="d" style={{ background: c }}></span>
                <span className="nm">{r.name}</span>
                {already || sel ? <Ico n="check" className="ck" /> : null}
              </button>
            );
          })}
        </div>

        <div className="tt-ov-sec" style={{ marginTop: 18 }}>
          <span className="lbl">新しいタスクを追加</span>
        </div>
        <div className="tt-inline">
          <Ico n="plus" />
          <input
            ref={inputRef}
            value={name}
            placeholder="タスク名を入力"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addExtra();
            }}
          />
          <button className="tt-inline-add" onClick={addExtra} disabled={!name.trim()}>
            <Ico n="corner-down-left" />
          </button>
        </div>
        <CategoryPicker value={cat} onChange={setCat} />

        {extras.length > 0 && (
          <>
            <div className="tt-ov-sec" style={{ marginTop: 16 }}>
              <span className="lbl">
                追加するタスク <span className="cnt">{extras.length}</span>
              </span>
            </div>
            {extras.map((x, i) => (
              <div key={i} className="tt-pendrow">
                <span className="d" style={{ background: catColor(x.cat) }}></span>
                <span className="nm">{x.name}</span>
                <span className="tg">{x.cat}</span>
                <button className="rm" onClick={() => removeExtra(i)}>
                  <Ico n="x" />
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="tt-ov-foot">
        <button className="tt-btn tt-btn-ghost" onClick={onClose}>
          あとで
        </button>
        <button className="tt-btn tt-btn-run block" onClick={commit} disabled={total === 0}>
          <Ico n="check" /> 今日に追加{total > 0 ? `（${total}件）` : ""}
        </button>
      </div>
    </div>
  );
}
