import { WD } from "../lib/format";

export function StatusBar({ live }: { live: boolean }) {
  const d = new Date();
  return (
    <div className="tt-statusbar">
      <div className="tt-date">
        <span className="dow">{WD[d.getDay()]}曜日</span>
        <span>
          {d.getMonth() + 1}月{d.getDate()}日
        </span>
      </div>
      <span className={"tt-tray" + (live ? " live" : "")}>
        <span className="dot"></span>
        {live ? "計測中" : "待機中"}
      </span>
    </div>
  );
}
