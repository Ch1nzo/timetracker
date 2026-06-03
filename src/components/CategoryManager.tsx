import { useState } from "react";
import { Ico } from "../lib/icons";
import {
  addCategory,
  moveCategory,
  removeCategory,
  useCategories,
} from "../lib/categories";

/** Full category manager — list + add + delete + drag-reorder (Settings). */
export function CategoryManager() {
  const cats = useCategories();
  const [name, setName] = useState("");
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const add = () => {
    const a = addCategory(name);
    if (a) setName("");
  };
  const drop = () => {
    if (drag != null && over != null && drag !== over) moveCategory(drag, over);
    setDrag(null);
    setOver(null);
  };

  return (
    <div className="tt-catmgr">
      <div className="tt-catmgr-list">
        {cats.map((c, i) => (
          <div
            key={c.name}
            className={
              "tt-catmgr-row" +
              (drag === i ? " dragging" : "") +
              (over === i && drag !== null && drag !== i ? " over" : "")
            }
            draggable
            onDragStart={(e) => {
              setDrag(i);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (over !== i) setOver(i);
            }}
            onDrop={(e) => {
              e.preventDefault();
              drop();
            }}
            onDragEnd={drop}
          >
            <span className="grip" title="ドラッグで並べ替え">
              <Ico n="grip-vertical" />
            </span>
            <span className="d" style={{ background: c.color }}></span>
            <span className="nm">{c.name}</span>
            {c.custom ? (
              <button
                type="button"
                className="rm"
                title="削除"
                onClick={() => removeCategory(c.name)}
              >
                <Ico n="x" />
              </button>
            ) : (
              <span className="std">標準</span>
            )}
          </div>
        ))}
      </div>
      <div className="tt-catmgr-add">
        <Ico n="plus" />
        <input
          value={name}
          placeholder="新しいカテゴリ名を追加"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        <button type="button" className="ok" onClick={add} disabled={!name.trim()}>
          <Ico n="corner-down-left" />
        </button>
      </div>
    </div>
  );
}
