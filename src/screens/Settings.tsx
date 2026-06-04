import { useRef, useState } from "react";
import { Ico } from "../lib/icons";
import { useCategories } from "../lib/categories";
import { CategoryManager } from "../components/CategoryManager";
import type { Routine, Settings as SettingsT } from "../lib/types";

export function Switch({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="tt-switch"
      data-on={!!on}
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={!!on}
    >
      <span className="knob"></span>
    </button>
  );
}

/** Records a keyboard combo (e.g. Ctrl+Alt+S). */
function ShortcutField({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (combo: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      setRecording(false);
      ref.current?.blur();
      return;
    }
    const mods: string[] = [];
    if (e.ctrlKey) mods.push("Ctrl");
    if (e.altKey) mods.push("Alt");
    if (e.shiftKey) mods.push("Shift");
    if (e.metaKey) mods.push("Cmd");
    let key = "";
    if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
    else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
    else if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) key = "";
    else if (e.key.length === 1) key = e.key.toUpperCase();
    else key = e.key;
    if (!key) return; // wait for a non-modifier key
    if (mods.length === 0) return; // require at least one modifier
    onChange([...mods, key].join("+"));
    setRecording(false);
    ref.current?.blur();
  };

  const parts = (value || "").split("+").filter(Boolean);
  return (
    <button
      type="button"
      ref={ref}
      className={"tt-shortcut" + (recording ? " rec" : "")}
      disabled={disabled}
      onClick={() => setRecording(true)}
      onKeyDown={recording ? onKeyDown : undefined}
      onBlur={() => setRecording(false)}
    >
      {recording ? (
        <span className="hint">キーを押してください…</span>
      ) : (
        parts.map((p, i) => <kbd key={i}>{p}</kbd>)
      )}
    </button>
  );
}

const ACCENTS: { key: SettingsT["accent"]; color: string }[] = [
  { key: "green", color: "#34d399" },
  { key: "blue", color: "#60a5fa" },
  { key: "amber", color: "#fbbf24" },
];

export function Settings({
  settings,
  routines,
  onChange,
  onManageRoutines,
  onClose,
  onReset,
  onPreview,
  onCheckUpdate,
  appVersion,
}: {
  settings: SettingsT;
  routines: Routine[];
  onChange: (s: SettingsT) => void;
  onManageRoutines: () => void;
  onClose: () => void;
  onReset: () => void;
  onPreview: () => void;
  onCheckUpdate: () => void;
  appVersion: string;
}) {
  const s = settings;
  const set = (patch: Partial<SettingsT>) => onChange({ ...s, ...patch });
  const clampMin = (v: string) => Math.max(1, Math.min(480, parseInt(v, 10) || 1));
  const cats = useCategories();
  const [catOpen, setCatOpen] = useState(false);

  return (
    <div className="tt-overlay">
      <div className="tt-ov-head">
        <button className="tt-ov-back" onClick={onClose} title="戻る">
          <Ico n="arrow-left" />
        </button>
        <div className="tt-ov-titles">
          <div className="t">
            <Ico n="settings" className="ti" /> 設定
          </div>
          <div className="s">リマインドと常駐の動作を調整</div>
        </div>
      </div>

      <div className="tt-ov-body">
        {/* --- Reminders --- */}
        <div className="tt-set-group">
          <div className="gh">
            <Ico n="bell" /> リマインド
          </div>
          <div className="tt-set-card">
            <div className="tt-set-row">
              <div className="info">
                <div className="t">計測中の経過リマインド</div>
                <div className="d">作業中、一定間隔でそっと通知</div>
              </div>
              <div className="ctrl">
                <Switch on={s.elapsedReminder} onChange={(v) => set({ elapsedReminder: v })} />
              </div>
            </div>
            <div className={"tt-set-row" + (s.elapsedReminder ? "" : " disabled")}>
              <div className="info">
                <div className="t">リマインド間隔</div>
                <div className="d">何分ごとに知らせるか</div>
              </div>
              <div className="ctrl">
                <span className="tt-numfield">
                  <input
                    type="number"
                    min="1"
                    max="480"
                    value={s.elapsedEveryMin}
                    disabled={!s.elapsedReminder}
                    onChange={(e) => set({ elapsedEveryMin: clampMin(e.target.value) })}
                  />
                  <span className="u">分</span>
                </span>
              </div>
            </div>
            <div className="tt-set-row">
              <div className="info">
                <div className="t">残タスクのリマインド</div>
                <div className="d">未完了タスクがある日に通知</div>
              </div>
              <div className="ctrl">
                <Switch on={s.pendingReminder} onChange={(v) => set({ pendingReminder: v })} />
              </div>
            </div>
            <div className={"tt-set-row" + (s.pendingReminder ? "" : " disabled")}>
              <div className="info">
                <div className="t">リマインド時刻</div>
                <div className="d">この時刻に未完了を確認</div>
              </div>
              <div className="ctrl">
                <span className="tt-clockfield">
                  <Ico n="bell" />
                  <input
                    type="time"
                    value={s.pendingAt}
                    disabled={!s.pendingReminder}
                    onChange={(e) => set({ pendingAt: e.target.value })}
                  />
                </span>
              </div>
            </div>
            <div className="tt-set-row clickable" onClick={onPreview}>
              <div className="info">
                <div className="t">通知をプレビュー</div>
                <div className="d">リマインドの表示を試す</div>
              </div>
              <div className="ctrl preview">
                <Ico n="bell" />
              </div>
            </div>
          </div>
          <div className="tt-set-note">
            <Ico n="info" /> リマインドは Windows / macOS の標準通知として表示されます（アプリ内ではプレビューを表示）。
          </div>
        </div>

        {/* --- Startup / tray --- */}
        <div className="tt-set-group">
          <div className="gh">
            <Ico n="timer" /> 起動・常駐
          </div>
          <div className="tt-set-card">
            <div className="tt-set-row">
              <div className="info">
                <div className="t">Windows 起動時に自動起動</div>
                <div className="d">サインイン時にトレイで待機</div>
              </div>
              <div className="ctrl">
                <Switch on={s.autostart} onChange={(v) => set({ autostart: v })} />
              </div>
            </div>
            <div className="tt-set-row">
              <div className="info">
                <div className="t">閉じても計測を続ける</div>
                <div className="d">ウィンドウを閉じてもトレイで継続</div>
              </div>
              <div className="ctrl">
                <Switch on={s.trayKeepRunning} onChange={(v) => set({ trayKeepRunning: v })} />
              </div>
            </div>
          </div>
        </div>

        {/* --- Global shortcut --- */}
        <div className="tt-set-group">
          <div className="gh">
            <Ico n="keyboard" /> グローバルショートカット
          </div>
          <div className="tt-set-card">
            <div className="tt-set-row">
              <div className="info">
                <div className="t">開始／停止のショートカット</div>
                <div className="d">他のアプリ作業中でも計測を切り替え</div>
              </div>
              <div className="ctrl">
                <Switch on={s.globalShortcut} onChange={(v) => set({ globalShortcut: v })} />
              </div>
            </div>
            <div className={"tt-set-row" + (s.globalShortcut ? "" : " disabled")}>
              <div className="info">
                <div className="t">キーの割り当て</div>
                <div className="d">クリックして新しいキーを記録</div>
              </div>
              <div className="ctrl">
                <ShortcutField
                  value={s.globalShortcutKeys}
                  disabled={!s.globalShortcut}
                  onChange={(v) => set({ globalShortcutKeys: v })}
                />
              </div>
            </div>
          </div>
          <div className="tt-set-note">
            <Ico n="info" /> グローバルショートカットはアプリが起動中（トレイ常駐を含む）の間だけ有効です。
          </div>
        </div>

        {/* --- Theme --- */}
        <div className="tt-set-group">
          <div className="gh">
            <Ico n="palette" /> テーマ
          </div>
          <div className="tt-set-card">
            <div className="tt-set-row">
              <div className="info">
                <div className="t">外観</div>
                <div className="d">ダーク／ライト</div>
              </div>
              <div className="ctrl">
                <div className="tt-seg">
                  {(
                    [
                      ["dark", "moon", "ダーク"],
                      ["light", "sun", "ライト"],
                    ] as const
                  ).map(([k, ic, lb]) => (
                    <button
                      key={k}
                      className={s.themeMode === k ? "sel" : ""}
                      onClick={() => set({ themeMode: k })}
                    >
                      <Ico n={ic} /> {lb}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="tt-set-row">
              <div className="info">
                <div className="t">アクセント色</div>
                <div className="d">計測中を示す色</div>
              </div>
              <div className="ctrl">
                <div className="tt-accents">
                  {ACCENTS.map((a) => (
                    <button
                      key={a.key}
                      className={s.accent === a.key ? "sel" : ""}
                      style={{ background: a.color + "22" }}
                      onClick={() => set({ accent: a.key })}
                      title={a.key}
                    >
                      {s.accent === a.key ? (
                        <Ico n="check" className="ck" />
                      ) : (
                        <span className="dot" style={{ background: a.color }}></span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* --- Data --- */}
        <div className="tt-set-group">
          <div className="gh">
            <Ico n="list-checks" /> データ
          </div>
          <div className="tt-set-card">
            <div className="tt-set-row clickable" onClick={onManageRoutines}>
              <div className="info">
                <div className="t">ルーティン管理</div>
                <div className="d">登録済み {routines.length} 件のテンプレート</div>
              </div>
              <div className="ctrl chev">
                <Ico n="chevron-right" />
              </div>
            </div>
            <div className="tt-set-row clickable" onClick={() => setCatOpen((v) => !v)}>
              <div className="info">
                <div className="t">タスクカテゴリ管理</div>
                <div className="d">登録済み {cats.length} 件のカテゴリ</div>
              </div>
              <div className={"ctrl chev" + (catOpen ? " open" : "")}>
                <Ico n="chevron-down" />
              </div>
            </div>
            {catOpen && (
              <div className="tt-set-sub">
                <CategoryManager />
              </div>
            )}
            <div className="tt-set-row clickable" onClick={onReset}>
              <div className="info">
                <div className="t">今日のタスクをクリア</div>
                <div className="d">タスク一覧を空にする（計測履歴は残ります）</div>
              </div>
              <div className="ctrl chev">
                <Ico n="rotate-ccw" />
              </div>
            </div>
          </div>
        </div>

        {/* --- App / updates --- */}
        <div className="tt-set-group">
          <div className="gh">
            <Ico n="info" /> アプリ情報
          </div>
          <div className="tt-set-card">
            <div className="tt-set-row clickable" onClick={onCheckUpdate}>
              <div className="info">
                <div className="t">アップデートを確認</div>
                <div className="d">最新版があればダウンロードして更新</div>
              </div>
              <div className="ctrl preview">
                <Ico n="download-cloud" />
              </div>
            </div>
          </div>
        </div>

        <div className="tt-set-foot-note">TimeTracker · v{appVersion} · ローカルに保存</div>
      </div>

      <div className="tt-ov-foot">
        <button className="tt-btn tt-btn-run block" onClick={onClose}>
          <Ico n="check" /> 保存
        </button>
      </div>
    </div>
  );
}
