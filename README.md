# TimeTracker

フォーカス型のデスクトップ作業時間トラッカー。大きなタイマーで「いま何に取り組んでいるか」に集中し、トレイ常駐で裏でも計測、グローバルショートカットで素早く開始/停止。カレンダーと集計でふりかえりまで。

Claude Design の HTML/CSS/JS モック（`Task Timer — ①メイン（方向B）`）を、**Tauri v2 + React + TypeScript + Vite** のネイティブアプリとして実装したものです。

## 主な機能

- **メイン（方向B）** — 大型タイマー Hero、今日のタスク一覧、ライブ計測表示
- **キーボード操作** — `Space` 開始/停止 · `↑↓` 選択 · `1–9` 即切替 · `Ctrl+N` 新規 · `/` 絞り込み
- **朝の準備 / ルーティン管理** — よく使うタスクをテンプレ化してワンタップ投入
- **タスク編集** — 名前・カテゴリ・今日/累計時間の手動調整（+15/+30/+1h 追記）
- **カレンダー** — 月/週ビュー、ドラッグで別日へ移動、タップで編集
- **集計** — カテゴリ別ドーナツ、タスク別ランキング、日別推移、CSV エクスポート
- **繰り越しダイアログ** — 未完了タスクを翌日へ
- **設定** — リマインド間隔/時刻、起動・常駐、テーマ（ダーク/ライト・アクセント色）、カテゴリ管理
- **トレイ常駐** — ウィンドウを閉じても裏で計測継続。トレイから表示/開始停止/終了
- **グローバルショートカット** — 既定 `Ctrl+Alt+S` で他アプリ作業中でも開始/停止
- **自動アップデート** — GitHub Releases の `latest.json` を参照して署名付き更新
- **ローカル保存** — SQLite（`tauri-plugin-sql`）。計測した実セッションは `time_entries` に記録され、カレンダー/集計はそこから集計

## 技術スタック

| 層 | 採用 |
| --- | --- |
| シェル | Tauri v2（frameless 460×680・透過・カスタムタイトルバー） |
| UI | React 18 + TypeScript + Vite 6 |
| スタイル | shadcn/ui トークン（oklch）・Geist / Noto Sans JP |
| データ | SQLite（`tauri-plugin-sql`、マイグレーションは Rust 側で定義） |
| 常駐/操作 | tray-icon・`tauri-plugin-global-shortcut`・`tauri-plugin-autostart`・`tauri-plugin-notification` |
| 更新 | `tauri-plugin-updater`（+ `tauri-plugin-process` で再起動） |

## ディレクトリ

```
src/
  App.tsx               メイン画面 + 画面遷移 + 計測ロジック + OS 連携
  lib/                  db(SQLite) / categories / data / format / icons / tauri / types
  components/           TitleBar / StatusBar / Footer / MiniLive / Category(Picker|Manager)
  screens/              MorningFlow / RoutineManager / TaskEditor / Settings / Calendar / Stats / CarryoverDialog
  styles/               app.css / colors_and_type.css（デザインのソース・オブ・トゥルース） + fonts
src-tauri/              Rust バックエンド（tray・shortcut・SQLite マイグレーション・close→tray）
.github/workflows/      release.yml（tauri-action による各 OS ビルド & Release 公開）
scripts/generate-icon.mjs  アプリアイコン生成（依存なし）
```

## 開発

```bash
npm install
npm run tauri:dev     # ネイティブ起動（Rust ビルドにシステム依存が必要 / 下記参照）
# もしくはブラウザで UI だけ確認（OS 連携は no-op になる）
npm run dev
```

`npm run dev` はブラウザでも動作し、Tauri API は安全に no-op 化されるため UI レビューに使えます（保存・トレイ・通知・更新はネイティブ起動時のみ）。

### ネイティブビルドのシステム依存

Tauri のネイティブビルドには各 OS の WebView 開発ライブラリが必要です。

- **Windows**: WebView2（多くの環境で同梱済み）+ Visual Studio C++ Build Tools
- **macOS**: Xcode Command Line Tools
- **Linux / WSL2 (Ubuntu)**:
  ```bash
  sudo apt-get update
  sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
    libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libgtk-3-dev
  ```
  ※ WSL2 で GUI を表示するには WSLg（Windows 11）または X サーバが必要です。

```bash
npm run tauri:build   # インストーラ生成（Windows は NSIS .exe / mac は .dmg / Linux は AppImage・deb）
```

## GitHub でのリリースと自動アップデート

ビルドは GitHub Actions（`.github/workflows/release.yml`）で各 OS ランナー上で行います。**バージョンタグを push すると** 全 OS のインストーラと updater マニフェスト（`latest.json`）が GitHub Release（下書き）として公開されます。

### 1. 署名鍵（生成済み）

更新の署名には minisign 鍵ペアを使います。本リポジトリには**公開鍵のみ** `src-tauri/tauri.conf.json` の `plugins.updater.pubkey` に埋め込み済みです。秘密鍵はローカルの `~/.tauri/timetracker.key`（リポジトリ外）にあります。

> 鍵を再生成する場合: `npx tauri signer generate -w ~/.tauri/timetracker.key -p "" --ci -f`
> 出力された公開鍵（`~/.tauri/timetracker.key.pub` の内容）を `pubkey` に設定してください。

### 2. リポジトリ Secrets を設定

| Secret | 値 |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | `~/.tauri/timetracker.key` の中身 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 鍵のパスワード（本構成では空文字） |

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/timetracker.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --body ""
```

### 3. updater のエンドポイント

`src-tauri/tauri.conf.json` の更新先は以下です。**GitHub の owner/repo に合わせて必要なら修正**してください。

```
https://github.com/Ch1nzo/timetracker/releases/latest/download/latest.json
```

### 4. リリースを実行

```bash
git tag v0.4.0
git push origin v0.4.0      # → Actions が起動し、Release（下書き）に各 OS のインストーラを添付
```

ワークフロー完了後、GitHub の Releases で内容を確認して **Publish**。以後、起動済みの TimeTracker は次回チェック時に新バージョンを検出し、ダウンロード→署名検証→再起動で更新します（設定 → アプリ情報 → 「アップデートを確認」で手動チェックも可能）。

## デザイン出典

`timetracker-handoff.zip`（Claude Design からのエクスポート）。視覚仕様（寸法・色・レイアウト）は `src/styles/app.css` / `colors_and_type.css` をソース・オブ・トゥルースとして再現しています。
