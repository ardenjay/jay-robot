## Why

異機搬資料目前靠手動下 rsync／scp 指令，步驟多且到處是坑——今天實際搬一次就踩了兩個：rsync 來源少結尾斜線造成 `public/documents/documents/` 巢狀（文件全部 404）、來源機 `.env` 的 `PORT=6000` 差點蓋掉本機設定；還有「先停來源機 server」「先備份本機 DB」這種容易忘的前置步驟。把整套流程做成一個防呆 CLI，一個指令搬完並自動檢查。

## What Changes

- 新增 `scripts/migrate.js`：`node scripts/migrate.js <user@host>` 從來源機把資料整套拉到本機。
- 搬運範圍：`data/`（SQLite DB）、`public/documents/`、`tools/netlist/`；**永不碰 `.env`**。
- 防呆前置：SSH 連線探測；偵測來源機 server 還在跑（WAL 熱複製會抓到不一致）→ 預設中止，`--stop-remote` 才代為停止；搬運前自動備份本機 `data/`。
- 防呆後置：驗證 `public/documents/` 第一層直接是 projectId 資料夾（偵測巢狀錯誤）；讀 DB chunk 向量維度、與目前 `LLM_ADAPTER` 的 embedding 模型比對，不符時提示跑 `scripts/reembed.js`。
- rsync 參數（含結尾斜線）由程式組出，杜絕手打錯誤；支援 `--dry-run` 預覽、`--path` 指定來源機專案路徑（預設與本機相同）。
- 用 Node 內建 `child_process` 呼叫系統 `ssh`/`rsync`，不新增 npm 套件。

## Capabilities

### New Capabilities

- `data-migration`: 異機資料搬運 CLI——搬運範圍與排除項、前置安全檢查（SSH／來源 server 狀態／本機備份）、後置驗證（目錄結構／embedding 維度）、dry-run。

### Modified Capabilities

（無 — 純新增工具，不改既有能力的需求）

## Impact

- `scripts/migrate.js` — 新檔，CLI 主體。
- `src/services/migrate.js`（或 scripts 內拆純函式）— rsync 參數組裝、目錄結構驗證等純函式，供單元測試。
- `tests/migrate.test.js` — 新增：參數組裝（斜線）、巢狀偵測、維度比對提示邏輯（不跑真實 ssh/rsync）。
- `package.json` — test script 加新測試檔。
- 相依性：執行環境需有 `ssh`、`rsync`（Linux 標配）；不新增 npm 套件。
- 文件：完成後更新 Obsidian 筆記 [[cb-migrate-data]] 改為「用工具搬」。
