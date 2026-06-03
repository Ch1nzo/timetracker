import { useEffect, useRef, useState } from "react";
import { Ico } from "../lib/icons";
import { catColor } from "../lib/categories";
import { CategoryPicker } from "../components/CategoryPicker";
import type { Task } from "../lib/types";

/** Edit name / category / today & total time of a task. */
export function TaskEditor({
  task,
  onSave,
  onDelete,
  onClose,
}: {
  task: Task;
  onSave: (k: string, patch: Partial<Task>) => void;
  onDelete: (k: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(task.name);
  const [cat, setCat] = useState(task.cat);
  const [th, setTh] = useState(Math.floor(task.todaySec / 3600));
  const [tm, setTm] = useState(Math.floor((task.todaySec % 3600) / 60));
  const [ch, setCh] = useState(Math.floor(task.totalSec / 3600));
  const [cm, setCm] = useState(Math.floor((task.totalSec % 3600) / 60));
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  const clampH = (v: string) => Math.max(0, Math.min(999, parseInt(v, 10) || 0));
  const clampM = (v: string) => Math.max(0, Math.min(59, parseInt(v, 10) || 0));
  const color = catColor(cat);
  const dirty =
    name.trim() !== task.name ||
    cat !== task.cat ||
    th * 3600 + tm * 60 !== task.todaySec ||
    ch * 3600 + cm * 60 !== task.totalSec;

  const addToday = (mins: number) => {
    let total = th * 60 + tm + mins;
    if (total < 0) total = 0;
    setTh(Math.floor(total / 60));
    setTm(total % 60);
  };
  const save = () => {
    const nm = name.trim();
    if (!nm) {
      nameRef.current?.focus();
      return;
    }
    onSave(task.k, {
      name: nm,
      cat,
      color,
      todaySec: th * 3600 + tm * 60,
      totalSec: ch * 3600 + cm * 60,
    });
  };

  return (
    <div className="tt-overlay">
      <div className="tt-ov-head">
        <button className="tt-ov-back" onClick={onClose} title="戻る">
          <Ico n="arrow-left" />
        </button>
        <div className="tt-ov-titles">
          <div className="t">
            <Ico n="pencil" className="ti" /> タスクを編集
          </div>
          <div className="s">
            {task.sessions} 回計測 · 最終 {task.last}
          </div>
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
            ref={nameRef}
            className="tt-textin"
            value={name}
            placeholder="タスク名"
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
          <span className="lbl">今日の作業時間</span>
          <div className="tt-timegrp">
            <span className="tt-timefield">
              <input type="number" value={th} min="0" onChange={(e) => setTh(clampH(e.target.value))} />
              <span className="u">時</span>
            </span>
            <span className="colon">:</span>
            <span className="tt-timefield">
              <input type="number" value={tm} min="0" max="59" onChange={(e) => setTm(clampM(e.target.value))} />
              <span className="u">分</span>
            </span>
          </div>
          <div className="tt-timehint">
            <span>追記:</span>
            <button onClick={() => addToday(15)}>+15分</button>
            <button onClick={() => addToday(30)}>+30分</button>
            <button onClick={() => addToday(60)}>+1時間</button>
          </div>
        </div>

        <div className="tt-field">
          <span className="lbl">累計時間</span>
          <div className="tt-timegrp">
            <span className="tt-timefield">
              <input type="number" value={ch} min="0" onChange={(e) => setCh(clampH(e.target.value))} />
              <span className="u">時</span>
            </span>
            <span className="colon">:</span>
            <span className="tt-timefield">
              <input type="number" value={cm} min="0" max="59" onChange={(e) => setCm(clampM(e.target.value))} />
              <span className="u">分</span>
            </span>
          </div>
        </div>
      </div>

      <div className="tt-ov-foot">
        <button className="tt-btn tt-btn-danger" onClick={() => onDelete(task.k)}>
          <Ico n="trash" /> 削除
        </button>
        <button
          className="tt-btn tt-btn-run block"
          onClick={save}
          disabled={!dirty || !name.trim()}
        >
          <Ico n="check" /> 保存
        </button>
      </div>
    </div>
  );
}
