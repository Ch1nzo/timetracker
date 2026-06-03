import { useEffect, useRef, useState } from "react";
import { Ico } from "../lib/icons";
import { catColor } from "../lib/categories";
import { CategoryPicker } from "../components/CategoryPicker";
import type { Routine } from "../lib/types";

/** ④ ルーティン管理 — register / list / delete templates. */
export function RoutineManager({
  routines,
  onAdd,
  onDelete,
  onClose,
}: {
  routines: Routine[];
  onAdd: (r: { name: string; cat: string }) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [cat, setCat] = useState("未分類");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const add = () => {
    const nm = name.trim();
    if (!nm) return;
    onAdd({ name: nm, cat });
    setName("");
    setCat("未分類");
    inputRef.current?.focus();
  };

  return (
    <div className="tt-overlay">
      <div className="tt-ov-head">
        <button className="tt-ov-back" onClick={onClose} title="戻る">
          <Ico n="arrow-left" />
        </button>
        <div className="tt-ov-titles">
          <div className="t">
            <Ico n="rotate-cw" className="ti" /> ルーティン管理
          </div>
          <div className="s">繰り返し使うタスクのテンプレートを登録</div>
        </div>
      </div>

      <div className="tt-ov-body">
        <div className="tt-ov-sec">
          <span className="lbl">新しいルーティンを登録</span>
        </div>
        <div className="tt-inline">
          <Ico n="plus" />
          <input
            ref={inputRef}
            value={name}
            placeholder="ルーティン名を入力"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
          />
          <button className="tt-inline-add" onClick={add} disabled={!name.trim()}>
            <Ico n="corner-down-left" />
          </button>
        </div>
        <CategoryPicker value={cat} onChange={setCat} />

        <div className="tt-ov-sec" style={{ marginTop: 18 }}>
          <span className="lbl">
            登録済みルーティン <span className="cnt">{routines.length}</span>
          </span>
        </div>

        {routines.length === 0 ? (
          <div className="tt-ov-empty">
            <Ico n="rotate-cw" />
            <p>
              まだルーティンがありません。よく使うタスクを登録しておくと、朝の準備が一瞬で終わります。
            </p>
          </div>
        ) : (
          routines.map((r) => (
            <div key={r.id} className="tt-rtrow">
              <span className="d" style={{ background: catColor(r.cat) }}></span>
              <span className="nm">{r.name}</span>
              <span className="tg">{r.cat}</span>
              <button className="rm" title="削除" onClick={() => onDelete(r.id)}>
                <Ico n="trash" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="tt-ov-foot">
        <button className="tt-btn tt-btn-ghost block" onClick={onClose}>
          <Ico n="arrow-left" /> メインに戻る
        </button>
      </div>
    </div>
  );
}
