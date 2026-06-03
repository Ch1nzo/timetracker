import { Ico } from "../lib/icons";
import { hideToTray, minimizeWindow } from "../lib/tauri";

export function TitleBar({
  subtitle,
  onCloseApp,
}: {
  subtitle?: string;
  onCloseApp?: () => void;
}) {
  return (
    <div className="tt-titlebar" data-tauri-drag-region>
      <span className="app-mark" data-tauri-drag-region>
        <Ico n="timer" />
      </span>
      <span className="tt-title" data-tauri-drag-region>
        TimeTracker<span className="ver">{subtitle || "作業計測"}</span>
      </span>
      <div className="tt-wincontrols">
        <button title="最小化" onClick={() => void minimizeWindow()}>
          <Ico n="minus" />
        </button>
        <button title="トレイへ" onClick={() => void hideToTray()}>
          <Ico n="chevron-down" />
        </button>
        <button
          className="close"
          title="閉じる（裏で計測継続）"
          onClick={onCloseApp}
        >
          <Ico n="x" />
        </button>
      </div>
    </div>
  );
}
