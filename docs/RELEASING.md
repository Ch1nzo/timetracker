# リリース手順（人間用）

TimeTracker を新バージョンとして GitHub Releases に公開する手順です。タグを 1 本 push すれば、各 OS のインストーラ生成・署名・更新マニフェスト（`latest.json`）・公開までを GitHub Actions が自動で行います。

---

## 0. 前提（最初の 1 回だけ）

| 必要なもの | 確認方法 / 用意 |
|---|---|
| `gh` CLI にログイン | `gh auth status`（未ログインなら `gh auth login`） |
| 署名秘密鍵 | `~/.tauri/timetracker.key`（**リポジトリ外**。無い場合は末尾「署名鍵の再生成」） |
| GitHub Secrets | リポジトリに `TAURI_SIGNING_PRIVATE_KEY` と `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`（**空文字**）。下記コマンド参照 |

Secrets の設定（1 回だけ）:

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/timetracker.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --body ""
```

> ⚠️ 秘密鍵（`~/.tauri/timetracker.key`）は絶対に commit・表示・共有しない。

---

## 1. バージョンを上げる（4 ファイル＋ロックファイル）

`X.Y.Z` を新しい番号に。**4 か所すべて**を一致させること（1 つでも忘れると更新が壊れる）。

1. `package.json` の `"version"`
2. `src-tauri/tauri.conf.json` の `"version"`
3. `src-tauri/Cargo.toml` の `version`
4. `src/App.tsx` の `const APP_VERSION`（**見落としやすい**）

そのあとロックファイルを更新:

```bash
cd src-tauri && cargo generate-lockfile && cd ..
```

一致確認（4 つとも同じ番号が出れば OK）:

```bash
grep '"version"' package.json src-tauri/tauri.conf.json
grep '^version' src-tauri/Cargo.toml
grep 'APP_VERSION =' src/App.tsx
```

---

## 2. ローカル検証

```bash
npm run build   # 型チェック + フロントビルド（WSL2 ではここまで）
npm test        # タイマー中核のユニットテスト（9 件）
```

> ネイティブビルド（Rust 実コンパイル）は WSL2 では不可。CI に任せる（PR を出すと `build-check` が Windows/Linux で実コンパイル＋テストを走らせる）。

---

## 3. ブランチ → PR → マージ（main 直 push は禁止）

```bash
git checkout -b release/vX.Y.Z
git add -A
git commit -m "TimeTracker vX.Y.Z — <変更概要>"
git push -u origin release/vX.Y.Z
gh pr create --base main --title "TimeTracker vX.Y.Z" --body "<変更点>"
```

- push すると **`build-check`** が走る（Windows NSIS / Linux AppImage の実ビルド＋`npm test`）。緑を確認。
- 問題なければマージ:

```bash
gh pr merge <PR番号> --squash --delete-branch
```

---

## 4. タグを打って公開（ここで自動リリースが起動）

```bash
git checkout main
git pull origin main
git tag vX.Y.Z          # 先頭の v を忘れない
git push origin vX.Y.Z
```

`v*` タグの push で `.github/workflows/release.yml` が起動し、**3 段**で進む:

1. **create-release** — draft リリースを作成し、**変更点（What's Changed）を自動生成**
2. **build** — macOS(arm64/x64 dmg) / Linux(AppImage) / Windows(NSIS .exe) を並列ビルドして添付（署名付き updater 成果物 + `latest.json` 含む）
3. **publish** — **全ビルド成功後に draft を解除＝自動公開**（どれか失敗すると draft のまま＝公開されない）

進捗の確認:

```bash
gh run list --workflow=release.yml --limit 1
gh run watch <run-id>
```

---

## 5. 公開を確認

```bash
# 公開済み（draft:false）か
gh release view vX.Y.Z --json isDraft,assets --jq '.isDraft, (.assets[].name)'

# 自動更新エンドポイントが解決し、新バージョンを指しているか
curl -sL https://github.com/Ch1nzo/timetracker/releases/latest/download/latest.json | grep '"version"'
```

**期待する assets**（lean 方針：インストーラ＋更新必須ファイル＋ソース）:
- `TimeTracker_X.Y.Z_x64-setup.exe`（Windows インストーラ）+ `.sig`
- `TimeTracker_X.Y.Z_x64.dmg` / `_aarch64.dmg`（macOS）+ `.app.tar.gz`(+`.sig`)
- `TimeTracker_X.Y.Z_amd64.AppImage`（Linux）+ `.sig`
- `latest.json`（自動更新マニフェスト）
- Source code (zip / tar.gz)（GitHub が自動添付）

> deb / rpm は出さない設定。formats を増やすときは `.github/workflows/release.yml` の matrix `args` の `--bundles` を編集。

---

## 6. 動作確認（Windows 実機）

1. 旧バージョンを起動 → 「新しいバージョン X.Y.Z が利用可能」トースト → 更新
2. タスク開始 → トレイへ格納 → 数分後に開き、経過時間が実時間と一致するか
3. 設定「閉じても計測を続ける」OFF → 閉じると完全終了するか

---

## トラブルシュート

- **draft のまま公開されない** → どれかの build が失敗。`gh run view <id> --log-failed` で原因を見て修正し、同じタグを貼り直す（`git tag -f vX.Y.Z && git push -f origin vX.Y.Z`）か番号を上げて再実行。
- **`npm ci` が CI で失敗** → `package.json` を変えたら `package-lock.json` も commit すること。
- **自動更新が出ない** → リリースが draft のまま／`latest.json` 未添付／`tauri.conf.json` の updater endpoint や `pubkey` が不一致。endpoint は `github.com/Ch1nzo/timetracker`。
- **assets を手で減らしたい**（公開済みリリース）:
  ```bash
  gh release delete-asset vX.Y.Z <ファイル名> --yes
  ```

### 署名鍵の再生成（鍵を失った場合のみ）

```bash
npx tauri signer generate -w ~/.tauri/timetracker.key -p "" --ci -f
```

生成後、`~/.tauri/timetracker.key.pub` の中身を `src-tauri/tauri.conf.json` の `plugins.updater.pubkey` に貼り替え、Secrets（手順 0）も再設定する。**鍵を変えると既存インストールは更新を拒否する**ので原則再生成しない。
