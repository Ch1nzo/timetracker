# CLAUDE.md

TimeTracker — フォーカス型デスクトップ作業時間トラッカー（Tauri v2 + React 18 + TypeScript + Vite + SQLite）。
Claude Design ハンドオフ（Task Timer ①メイン・方向B）を忠実に再現したデザインが正。ビジュアルの正は `src/styles/`（ハンドオフ zip ではない）。

## コマンド

| 用途 | コマンド |
|---|---|
| ブラウザで UI 開発（Tauri API は no-op） | `npm run dev`（port 1420 固定・strictPort） |
| 型チェック + フロントビルド（ローカル検証はこれ） | `npm run build`（= `tsc --noEmit && vite build`） |
| タイマー中核のユニットテスト（純粋ロジック） | `npm test`（`src/lib/timer.ts` を CJS にコンパイルし `tests/timer.test.cjs` を実行） |
| ネイティブ起動 | `npm run tauri:dev` |
| ネイティブビルド | `npm run tauri:build` |

**環境制約（WSL2）**: webkit2gtk 等が無いため `tauri dev/build`・`cargo check` はローカルで実行不可。
検証は `npm run build` まで（tsc が未使用変数も検出する）。Rust 側の依存解決確認は `cargo generate-lockfile`。実バイナリは GitHub Actions が生成する。

## アーキテクチャ

- `src/` — React フロントエンド。`App.tsx` が全状態と画面分岐を持つ（ルーターなし。`screen` union の early-return 分岐で描画）
- `src/lib/` — `tauri.ts`（Tauri API ラッパー）/ `db.ts`（SQLite アクセス）/ `categories.ts`（カテゴリストア）/ `format.ts`（日時整形）/ `icons.tsx`（インライン SVG アイコン）/ `types.ts` / `data.ts`
- `src/screens/`・`src/components/` — 画面とパーツ
- `src-tauri/` — Rust バックエンド。ロジックは `src/lib.rs`（crate 名 `timetracker_lib`。`main.rs` は `run()` を呼ぶだけ）
- フロント⇔バック間の文字列契約（**変更禁止**）: ウィンドウラベル `"main"`、イベント名 `"toggle-timer"`、DB 接続名 `"sqlite:timetracker.db"`

## 鉄則

### Tauri API は必ず lib 経由
- コンポーネント・画面から `@tauri-apps/*` を直接 import しない（`import type` のみ例外）。必ず `src/lib/tauri.ts` か `src/lib/db.ts` のラッパーを使う
- ラッパーの定型: `if (!IS_TAURI) return;` で no-op + `try/catch { /* ignore */ }`。新しいラッパーは必ずこの定型に従う（既存の唯一の例外は `installUpdateAndRelaunch` — 引数の `Update` が Tauri 下でしか得られないため）。ブラウザ（`npm run dev`）で UI が動く状態を常に維持する
- Tauri 下ではネイティブのグローバルショートカットが効くため、ウィンドウ内キーボードのトグルフォールバックは `!IS_TAURI` ゲート必須（外すと二重トグル）

### SQLite スキーマは Rust が所有
- テーブル作成は `src-tauri/src/lib.rs` のマイグレーションのみ。フロント（`db.ts`）は CREATE しない
- **適用済みマイグレーション（`SCHEMA_V1`）の編集禁止**。スキーマ変更は `SCHEMA_V2` を新設し `version: 2` の `Migration` を追加する
- テーブル: `app_state`（key/value の JSON blob）、`time_entries`（実計測ログ。Calendar / Stats の元データ）
- DB ハンドルは `getDb()` シングルトン経由のみ。SQL プレースホルダは `$1, $2` 形式

### 計測は wall-clock 基準（tick カウント禁止）
- 計測の純粋ロジックは **`src/lib/timer.ts` の `computeTimer()`**（React/Tauri/DB 非依存）。App.tsx の `syncTimer()` はこれを呼んで副作用（state/SQLite）を適用するだけ。**計測ロジックを App.tsx に書き戻さない** — `timer.ts` に置けば `npm test` で検証できる
- 計測は `startedAtRef`（セッション開始の epoch）からの `Date.now()` 差分で導出する。**`+1` で秒を数える方式に戻さない** — トレイ格納中は WebView2 がタイマーをスロットリングし、tick 方式だと計測が大幅に過少になる
- `syncTimer()` は 1秒 interval（計測中）＋ 30秒 interval（常時、深夜跨ぎ保険）＋ `visibilitychange`/`focus`（トレイ復帰時の即時再同期）で呼ばれる。`computeTimer` が `todayDate` 比較で深夜 0時に `todaySec` をリセットし、跨ぎセッションは `daySegments()` で日別に分割して `time_entries` へ記録する
- 起動時の復元: 実行中セッションは `startedAt` を保ったまま再開し `syncTimer` がオフライン分を清算。オフラインが `>= 86400` 秒なら `savedAt` までを確定して停止（古い計測を継続しない）

### 永続化の流れ（App.tsx）
- 作業セット（tasks / settings / runningKey / sessionSec / startedAt / todayDate など）は **400ms デバウンスの単一 effect** が `saveMain()` する。個別の saveMain 呼び出しを追加しない（例外: 終了時の `doQuit` が即時 flush）
- 計測セッションを `time_entries` に書くのは `writeSegments()`（`logRunning()`/`logRange()` 経由）で、1タスク×1日＝1行に **`teAccumulate` で加算 upsert**（停止時・タスク切替時・深夜跨ぎ flush・終了時の flush）。毎秒の tick 相当はメモリ上のカウンタ更新だけで DB には書かない。**当日のメイン一覧とカレンダーは同一データ**: タスク追加 (`addTask`/`addManyTasks`) は当日に 0 秒行を `teAccumulate`、削除 (`del`) は当日行を `teDeleteTaskDay`、繰り越し (`carryMove` → `planCarryover`) は翌日に 0 秒行を作り当日の 0 秒行を削除。メイン画面復帰時は `reconcileTodayTasks` が当日 `time_entries` と一覧を突合（純粋ロジック・`npm test`）。このほか time_entries に触るのは Calendar 画面の編集（`teMove` / `teUpdate` / `teDelete`、楽観更新 = state 更新後に `void` で fire-and-forget）のみ。**初回起動はダミー履歴なし**（タスク一覧も空。ルーティン/カテゴリのプリセットのみ残す）
- settings は `{...DEFAULT_SETTINGS, ...saved}` でマージ（新デフォルトが生きる）

### カテゴリストア（categories.ts）
- モジュールレベル配列 `CATEGORIES` を splice で in-place 変更し参照を生かす設計。直接代入・直接 mutate 禁止。必ず `addCategory` / `removeCategory` / `moveCategory` / `hydrateCategories` 経由
- `categories.ts` から `db.ts` を import しない（循環参照になる）。永続化は `registerCatPersist()` で注入済み — この仕組みを維持する
- コンポーネントからの購読は `useCategories()` フック。色解決は `catColor(name)`

### Rust バックエンド
- **plugin 登録順**: `tauri_plugin_single_instance` を最初に登録（`#[cfg(desktop)]` 内）。順序を変えると多重起動ガードが壊れる
- 新しい `#[tauri::command]` は `generate_handler![]` への追加も必須（片方だけだと invoke が実行時に失敗）
- フロントから新しい plugin / window API を呼ぶ場合は `src-tauri/capabilities/default.json` に permission 追加が必須
- 登録済み plugin: sql / notification / dialog / opener（全プラットフォーム）+ desktop 専用群。CSV 保存は `dialog`（保存先選択）→ 独自コマンド `write_file`（std::fs で任意パスへ書き込み。fs plugin の scope 制約回避）→ `opener` の `revealItemInDir` で OS ファイラを開く、の流れ（`src/lib/tauri.ts` の `saveTextFile`）
- **`tauri.conf.json` の window `dragDropEnabled: false` を維持**（true だと webview の HTML5 ドラッグ&ドロップを Tauri が横取りし、カレンダーの記録移動・カテゴリ並べ替えが動かなくなる）
- desktop 専用 plugin（global-shortcut / updater / process / autostart / single-instance）は `#[cfg(desktop)]` と Cargo.toml の target 指定 deps のゲートを維持する
- **CloseRequested**: 既定（`trayKeepRunning` = true）は `prevent_close()` + `hide()`（トレイ格納）。`set_close_to_tray(false)` が来ている場合は `prevent_close()` + `emit("app-quit-requested")` し、フロント（`doQuit`）が実行中セッションを flush → `quit_app` で終了する。`CloseToTray(Mutex<bool>)` を `manage()` し、フロントが設定変更時に `set_close_to_tray` で同期する（generate_handler 登録済み）
- 本当の終了はトレイメニューの quit（`app.exit(0)`）または上記 `quit_app` のみ
- ウィンドウを前面に出すときは `focus_main()` ヘルパー経由（show + unminimize + set_focus）
- release profile は `panic = "abort"` — unwinding（catch_unwind 等）に依存しない

### フロントエンド規約
- TS: strict + noUnusedLocals / noUnusedParameters — 未使用はビルド失敗。意図的な未使用は `_` プレフィックス
- アイコン: lucide-react 等は導入しない。`src/lib/icons.tsx` の `ICONS` レコードに SVG パス文字列を追加し `<Ico n="..." />` で使う
- 日時整形は `src/lib/format.ts` のヘルパー（hms / hm / ymd / addDays / startOfWeek…）を再利用。日付は `YYYY-MM-DD` 文字列で保存・比較する
- App.tsx の各画面分岐（early-return）のルート要素は `<div className={rootCls} data-accent={accent}>` で包む（付与するのは App.tsx 側。screens のコンポーネント自体には不要）— 省くとダークモード / アクセントカラーと透過ウィンドウの角が壊れる
- サブ画面は `.tt-overlay` レイアウト規約（`.tt-ov-head` + 戻るボタン / `.tt-ov-body` / `.tt-ov-foot`、`onClose` prop）
- タイトルバーのドラッグは `data-tauri-drag-region` 属性 +（capabilities の `core:window:allow-start-dragging`）で成立している
- Vite 設定の変更禁止項目: port 1420 / strictPort / `assetsInlineLimit: 4096`（約 5MB の Noto Sans JP を inline させないため）
- **Tailwind v4 導入済み**（`@tailwindcss/vite` プラグイン + `src/styles/tailwind.css`）。ただし **preflight（全体リセット）は意図的に除外**（theme + utilities のみ）— 手書きデザインを壊さないため。`tailwind.css` に preflight を戻さない。Tailwind utility は新規マークアップ向けで、既存 `.tt-*` スタイル（unlayered）が優先される。ビジュアルの正は引き続き `src/styles/`

## バージョンアップ手順

バージョンは **4 箇所** + git タグを一致させる（現在 0.5.5）:

1. `package.json` の `version`
2. `src-tauri/tauri.conf.json` の `version`
3. `src-tauri/Cargo.toml` の `version`
4. `src/App.tsx` の `const APP_VERSION`（**見落としやすい**）

## リリース（GitHub Actions）

> 人間がたどれる手順書は **`docs/RELEASING.md`**。以下は要点。

- `git tag vX.Y.Z && git push origin vX.Y.Z` → `.github/workflows/release.yml` が起動。3段構成: **create-release（draft + 変更点自動生成）→ build マトリクス（macOS arm64/x64 dmg、Linux **AppImage のみ**、Windows NSIS）→ publish（全ビルド成功後に draft 解除＝自動公開）**
- assets は「インストーラ + updater 必須ファイル（`latest.json` / `.sig` / mac `.app.tar.gz`）+ source」に絞る方針。Linux は **AppImage のみ**（deb/rpm は出さない）。bundle 形式を増やす場合は `release.yml` の matrix `args` の `--bundles` を編集
- ネイティブ実コンパイル検証用に **`build-check.yml`**（PR / `release/**` push でビルドのみ、リリースは作らない）。`npm test`（timer 中核）も CI で実行
- CI は `npm ci` — `package.json` を変えたら `package-lock.json` も必ず更新する
- アップデータ endpoint: `https://github.com/Ch1nzo/timetracker/releases/latest/download/latest.json`（リポジトリの owner / 名称を変えたら `tauri.conf.json` も要更新）

### 署名鍵（厳守）
- minisign 秘密鍵は `~/.tauri/timetracker.key`（**リポジトリ外**）。**絶対に commit / cat / echo / チャット出力しない**
- CI へは repo secret `TAURI_SIGNING_PRIVATE_KEY`（鍵ファイルの中身）と `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`（**意図的に空文字** — パスワードを勝手に設定しない）で注入
- 鍵を再生成した場合は `~/.tauri/timetracker.key.pub` の内容で `tauri.conf.json` の `pubkey` を更新（怠ると既存インストールが更新を拒否する）

## コミット対象外（.gitignore 済み）

- `_handoff/`・`timetracker-handoff.zip` — デザインハンドオフ入力。ディスクにはあるが追跡しない
- `scripts/.icon-source.png` — `node scripts/generate-icon.mjs` で再生成可能（その後 `npx tauri icon scripts/.icon-source.png -o src-tauri/icons`）
