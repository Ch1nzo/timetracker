import { useState } from "react";
import { Ico } from "../lib/icons";
import { hm } from "../lib/format";
import type { Task } from "../lib/types";

/** ⑧ 繰り越し確認ダイアログ — move unfinished tasks to tomorrow. */
export function CarryoverDialog({
  tasks,
  onMove,
  onDiscard,
  onClose,
}: {
  tasks: Task[];
  onMove: (keys: string[]) => void;
  onDiscard: (keys: string[]) => void;
  onClose: () => void;
}) {
  const [sel, setSel] = useState<Set<string>>(() => new Set(tasks.map((t) => t.k)));
  const toggle = (k: string) =>
    setSel((p) => {
      const n = new Set(p);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  const allOn = sel.size === tasks.length && tasks.length > 0;
  const toggleAll = () => setSel(allOn ? new Set() : new Set(tasks.map((t) => t.k)));
  const keys = [...sel];
  const n = keys.length;

  return (
    <div className="tt-scrim" onClick={onClose}>
      <div className="tt-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="tt-dlg-head">
          <span className="ico">
            <Ico n="sunrise" />
          </span>
          <div className="tx">
            <div className="t">未完了タスクが {tasks.length} 件あります</div>
            <div className="d">明日に移動しますか？選んだタスクが翌日へ繰り越されます。</div>
          </div>
          <button className="close" onClick={onClose} title="閉じる">
            <Ico n="x" />
          </button>
        </div>

        <div className="tt-dlg-selbar">
          <span className="lbl">対象を選択</span>
          <button className="tt-dlg-selall" onClick={toggleAll}>
            {allOn ? "すべて解除" : "すべて選択"}
          </button>
        </div>

        <div className="tt-dlg-list">
          {tasks.map((t) => {
            const on = sel.has(t.k);
            return (
              <div
                key={t.k}
                className={"tt-checkrow" + (on ? " on" : "")}
                onClick={() => toggle(t.k)}
              >
                <span className="tt-checkbox">
                  <Ico n="check" />
                </span>
                <span className="sw" style={{ background: t.color }}></span>
                <span className="nm">
                  {t.name}
                  <span className="tg">{t.cat}</span>
                </span>
                <span className="tm">今日 {hm(t.todaySec)}</span>
              </div>
            );
          })}
        </div>

        <div className="tt-dlg-foot">
          <button
            className="tt-btn tt-btn-danger"
            onClick={() => onDiscard(keys)}
            disabled={n === 0}
          >
            <Ico n="trash" /> 破棄
          </button>
          <button
            className="tt-btn tt-btn-run block"
            onClick={() => onMove(keys)}
            disabled={n === 0}
          >
            <Ico n="arrow-right" /> 明日に移動{n > 0 ? `（${n}）` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
