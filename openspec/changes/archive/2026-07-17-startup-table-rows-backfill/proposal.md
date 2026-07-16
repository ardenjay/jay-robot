# Startup table_rows backfill（正式機 git pull 後 DB 自我升級）

## Why

sidecar table-row index（commit 5ef1510）需要 `table_rows` 有料才生效。測試機已用「整份重灌」填好，但正式機（build server）不能走這條路：

- **兩台的 rag.db 永不同步**（使用者明訂）：測試機是 debug 用、可亂灌資料；正式機持有別處沒有的正式文件。整顆搬 DB 是禁手。
- 要求管理者在正式機逐份重新上傳文件，繁瑣且會漏。

而回填需要的原料正式機本來就有：進料時原始檔已存進 `public/documents/<project>/<docId>/`。缺的只是一條「啟動時發現缺料 → 自己從已存原始檔補齊」的路。

**關鍵性質：回填是純加法。** `extractTableRows()` 直接讀 md、與主 chunk 切塊完全獨立——不重切、不重嵌 chunks，主索引零改動、既有題目零風險（避開測試機重灌時 title 矯正洗牌排名的副作用，見 stale-db-chunker-drift）。

## What Changes

- **通用 DB 版本階梯（程式碼宣告搭配的 DB 版本）**：`DB_VERSION` 常數 + 依版本號排序的遷移步驟表；啟動時比對 `PRAGMA user_version`，落後就依序執行缺的步驟、逐步蓋戳。既有 FTS 重建（user_version ≤5）收編為階梯的歷史步驟、行為不變；本次新增 step 6（確保 table_rows / doc_ingest_meta schema）。此為**同步階梯**：只放秒級、零外部依賴的遷移（schema、FTS 重建）；需要 embedding 的資料補建走下面的背景層。日後任何 DB 結構改版＝加一個 step ＋ bump `DB_VERSION`，正式機 git pull 重啟即自動升級。
- **Per-doc 版本戳（背景層）**：新增 `doc_ingest_meta(project_id, doc_id, sidecar_version)`；程式碼常數 `SIDECAR_VERSION`（本次 = 1，日後 sidecar 行為改版就 bump）。ingestion 正常進料（本來就會填 table_rows）完成時 SHALL 一併蓋戳。
- **啟動背景回填**：服務啟動後 SHALL 以背景任務（不阻塞啟動、不影響服務可用性）掃描版本戳落後的文件：從 `public/documents/` 找該文件的 `.md` → `extractTableRows` → embed → 先清該文件舊列再寫入 `table_rows` → 蓋戳。逐文件交易式、逐文件蓋戳（冪等：中斷後下次啟動接著補）。
- **三個既定決策**：(1) Ollama 不在線或中途失敗 → log 後放棄本輪，下次啟動重試，不擋服務；(2) 已存原始檔非 `.md`（單檔上傳的 .docx/.pdf）→ 跳過不回填、每次啟動 log 一行列出，不重跑轉檔；(3) 不動 chunks——title 陳舊態不在本 change 範圍，正式機與測試機的 chunk title 允許 drift。

## Impact

- Affected specs: `document-ingestion`（版本戳）、新 capability `startup-migration`（或併入 document-ingestion）
- Affected code: `src/adapters/vector/sqlite.js`（doc_ingest_meta + 讀寫）、`src/services/ingestion.js`（進料蓋戳 + 回填服務函式）、app 啟動點（fire-and-forget 呼叫）
- 風險低：純加法（只寫 table_rows 與 meta），回填前該文件注入不生效=現狀行為；回填完成即生效。正式機為對外唯讀，但啟動期系統級寫入已有前例（FTS 版本落後自動重建）。
