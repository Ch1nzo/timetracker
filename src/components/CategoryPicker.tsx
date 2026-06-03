import { useEffect, useRef, useState } from "react";
import { Ico } from "../lib/icons";
import { addCategory, removeCategory, useCategories } from "../lib/categories";

/** Horizontal category chooser with inline add / manage. */
export function CategoryPicker({
  value,
  onChange,
  manage = true,
}: {
  value: string;
  onChange?: (name: string) => void;
  manage?: boolean;
}) {
  const cats = useCategories();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(false);
  const inRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (adding && inRef.current) inRef.current.focus();
  }, [adding]);

  const commit = () => {
    const added = addCategory(name);
    if (added) onChange?.(added);
    setName("");
    setAdding(false);
  };

  return (
    <div className="tt-catrow">
      {cats.map((c) => {
        const sel = value === c.name;
        const removable = editing && c.custom;
        return (
          <button
            key={c.name}
            type="button"
            className={"tt-cat" + (sel ? " sel" : "") + (removable ? " rm" : "")}
            style={
              sel
                ? { borderColor: c.color, color: c.color, background: c.color + "22" }
                : undefined
            }
            onClick={() => {
              if (removable) {
                removeCategory(c.name);
                if (value === c.name) onChange?.("未分類");
              } else {
                onChange?.(c.name);
              }
            }}
          >
            <span className="d" style={{ background: c.color }}></span>
            {c.name}
            {removable && (
              <span className="rmx">
                <Ico n="x" />
              </span>
            )}
          </button>
        );
      })}

      {adding ? (
        <span className="tt-cat-addbox">
          <input
            ref={inRef}
            value={name}
            placeholder="カテゴリ名"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") {
                setName("");
                setAdding(false);
              }
            }}
          />
          <button
            type="button"
            className="ok"
            title="追加"
            onClick={commit}
            disabled={!name.trim()}
          >
            <Ico n="check" />
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="tt-cat tt-cat-add"
          title="カテゴリを追加"
          onClick={() => {
            setEditing(false);
            setAdding(true);
          }}
        >
          <Ico n="plus" />
          追加
        </button>
      )}

      {manage && cats.some((c) => c.custom) && !adding && (
        <button
          type="button"
          className={"tt-cat tt-cat-manage" + (editing ? " on" : "")}
          title={editing ? "完了" : "カテゴリを管理"}
          onClick={() => setEditing((v) => !v)}
        >
          <Ico n={editing ? "check" : "settings"} />
          {editing ? "完了" : "編集"}
        </button>
      )}
    </div>
  );
}
