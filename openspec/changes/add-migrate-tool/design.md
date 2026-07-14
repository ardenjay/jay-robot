## Context

異機搬資料的手動流程記錄在 Obsidian 筆記 [[cb-migrate-data]]（repo 外），實際執行踩過：rsync 結尾斜線巢狀、`.env` 蓋寫風險、忘記停來源機 server（WAL 熱複製不一致）。機器本地資料（`.gitignore` 內）：`data/`、`public/documents/`、`tools/netlist/<專案>/`。repo 已有 CLI script 慣例（`scripts/ingest-folder.js`、`scripts/reembed.js`：`parseArgs` + `die()` + dotenv）。

## Goals / Non-Goals

**Goals:**
- 一個指令完成「另一台 → 本機」整套資料搬運，人為出錯面收斂到零。
- 每個已知的坑變成自動檢查：斜線由程式組、`.env` 排除、來源 server 偵測、本機自動備份、搬完結構驗證與維度提示。
- 純函式可測（不依賴真實 ssh/rsync 的單元測試）。

**Non-Goals:**
- 不做反向推送（本機 → 遠端）——目前工作流只有拉取；要推就到對面機器上拉。
- 不做雙向同步／衝突合併——整目錄以來源機為準（但不用 `--delete`，本機多出的檔案不刪）。
- 不管理 SSH 認證（假設 key 已設好；密碼模式交給 ssh 自己提示）。
- 不搬 `uploads/`、`incoming/`（暫存性質）、不搬程式碼（git 的事）。

## Decisions

### 1. Node CLI 包 `ssh`/`rsync`（child_process spawn），不用 npm SSH 套件
- repo 慣例是 Node scripts；`spawn` 繼承 stdio 讓 rsync 進度直接可見；ssh/rsync 是 Linux 標配。
- 替代案純 bash script：字串處理（UUID 驗證、維度比對要讀 DB）在 bash 裡又臭又長；Node 可直接 require better-sqlite3 讀 DB 做後置檢查。
- 替代案 node-ssh 等套件：違反專案零依賴慣例，且 rsync 增量傳輸沒有等價替代。

### 2. 介面：`node scripts/migrate.js <user@host> [--path P] [--dry-run] [--stop-remote] [--skip-netlist]`
- `--path` 預設與本機專案路徑相同（`process.cwd()`）——兩台機器同佈局是實際情境。
- `--dry-run`：rsync 帶 `-n` 跑一遍 + 印出將執行的完整計畫（含前置檢查結果），不動任何資料。
- 搬運清單寫成資料驅動的表（來源相對路徑 → 本機相對路徑），rsync 參數由 `buildRsyncArgs(src, dest)` 純函式組出，**結尾斜線在函式內強制補上**——這就是今天巢狀坑的根治點。

### 3. 前置檢查依序執行，任一失敗即中止（除非對應 flag）
1. `ssh <host> 'echo ok'` 探測連線與遠端路徑存在。
2. 偵測來源 server：`ssh <host> 'pgrep -f "node src/app.js"'` 有命中 → 預設中止並說明 WAL 熱複製風險；帶 `--stop-remote` 才代為 `pkill` 並提示搬完自行重啟。不做「遠端快照」替代方案（sqlite3 CLI 未必存在，複雜度不值）。
3. 本機備份：`data/` 整目錄 cp 成 `data.bak-<timestamp>/`（含 WAL/SHM）。文件與 netlist 是增量覆蓋、風險低，不備份。

### 4. 後置驗證把「今天踩過的坑」固化成斷言
- 結構驗證：`public/documents/` 第一層必須全是目錄且不含名為 `documents` 的子目錄（巢狀特徵）；發現即報錯並給修復指令（`mv` 一層）。
- 維度提示：讀 DB 第一筆 chunk 的向量長度，對照目前 `LLM_ADAPTER` 推得的預期維度（gemini→3072、ollama→依 `OLLAMA_EMBED_MODEL`，bge-m3→1024），不符則印「請跑 `LLM_ADAPTER=<x> node scripts/reembed.js`」。只提示不代跑——重嵌要花時間且該由使用者決定方向。
- 摘要輸出：各目錄傳輸檔數（解析 rsync `--stats`）、備份位置、後置檢查結果。

### 5. 純函式拆到 `scripts/lib/migrate-core.js` 供測試
- `buildRsyncArgs`、`parseTarget`（user@host 驗證）、`checkDocsLayout`（給檔案列表回驗證結果）、`expectedDim`（env → 維度）。
- `scripts/lib/` 而非 `src/services/`：這是運維工具的內部件，不是 app runtime 的一部分，放 src 會誤導。
- 測試全部打純函式 + 假檔案樹（tmpdir），不 mock ssh/rsync 執行本身。

## Risks / Trade-offs

- [`--stop-remote` pkill 後不代為重啟，來源機服務停著] → 明確印出提醒；代重啟需要知道對方的啟動方式（systemd？npm？），寧可不猜。
- [rsync 中斷留下半套資料] → rsync 本身可重跑續傳；DB 已先備份，最壞 `mv data.bak-<ts> data` 還原。
- [兩台機器專案路徑不同且使用者忘了 `--path`] → 前置探測會發現遠端路徑不存在而中止，錯誤訊息提示 `--path`。
- [netlist 目錄含 repo 版控檔（netparse.py）被來源機舊版蓋掉] → 搬運清單只搬 `tools/netlist/` 下的**專案子目錄**（排除 `*.py`），清單測試鎖住這行為。

## Migration Plan

純新增 script，無部署動作、無回滾需求。首次使用建議先 `--dry-run` 看計畫。

## Open Questions

- 無。
