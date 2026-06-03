import { Ico } from "../lib/icons";

export function Footer({
  onReport,
  onCalendar,
  onSettings,
}: {
  onReport: () => void;
  onCalendar: () => void;
  onSettings: () => void;
}) {
  return (
    <div className="tt-footer">
      <div className="tt-hints">
        <span className="tt-hint">
          <kbd>Space</kbd> 開始/停止
        </span>
        <span className="tt-hint">
          <kbd>↑↓</kbd> 選択
        </span>
        <span className="tt-hint">
          <kbd>1–9</kbd> 即切替
        </span>
        <span className="tt-hint">
          <kbd>Ctrl</kbd>
          <kbd>N</kbd> 新規
        </span>
      </div>
      <span className="tt-fspace"></span>
      <div className="tt-ficons">
        <button title="集計・グラフ" onClick={onReport}>
          <Ico n="bar-chart-3" />
        </button>
        <button title="カレンダー・履歴" onClick={onCalendar}>
          <Ico n="calendar-days" />
        </button>
        <button title="設定" onClick={onSettings}>
          <Ico n="settings" />
        </button>
      </div>
    </div>
  );
}
