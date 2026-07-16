## ADDED Requirements

### Requirement: Per-document sidecar version stamping
系統 SHALL 以 `doc_ingest_meta(project_id, doc_id, sidecar_version)` 記錄每份文件的 sidecar 處理版本。正常進料（`ingestFile`/`ingestFolder`）完成 SHALL 蓋上目前的 `SIDECAR_VERSION`（包含該文件沒有大表、產出 0 列的情況）。文件改名 SHALL 同步改 meta；文件刪除 SHALL 同步刪 meta。

#### Scenario: Fresh ingestion stamps the current version
- **WHEN** 一份文件正常進料完成
- **THEN** 該文件的 `sidecar_version` 為目前程式碼的 `SIDECAR_VERSION`，啟動回填不再處理它

#### Scenario: Doc without large tables is also stamped
- **WHEN** 進料的文件沒有任何超過門檻的表格（0 sidecar 列）
- **THEN** 仍蓋版本戳（語意為「已按此版本處理」），不會每次啟動被重掃

### Requirement: Startup background backfill of table_rows
服務啟動後，系統 SHALL 以不阻塞啟動的背景任務掃描 `sidecar_version` 低於 `SIDECAR_VERSION` 的文件，對每份：從 `public/documents/<project>/<docId>` 取得原始 `.md` → `extractTableRows` → embedding → 先清除該文件既有 `table_rows` 再寫入 → 蓋版本戳。處理 SHALL 逐文件完成並逐文件蓋戳（冪等，中斷後下次啟動續跑）。回填 SHALL NOT 修改 chunks 或 FTS（純加法）。

#### Scenario: Prod server self-upgrades after git pull
- **WHEN** 正式機更新程式碼後重啟，DB 內既有文件從未回填且原始 .md 在 public/documents
- **THEN** 服務立即可用（行為與回填前相同），背景任務逐文件填 `table_rows` 並蓋戳，填完的文件其表格列注入開始生效

#### Scenario: Interrupted backfill resumes
- **WHEN** 回填進行到一半程序重啟
- **THEN** 已蓋戳文件不重做，下次啟動從未蓋戳的文件繼續

#### Scenario: Ollama unavailable degrades gracefully
- **WHEN** 背景回填時 embedding 服務不可用或失敗
- **THEN** 記 log 後放棄本輪，服務不受影響、不重試迴圈；下次啟動自動再試

#### Scenario: Non-markdown source is skipped with a log
- **WHEN** 某文件在 public/documents 的已存原始檔不是 `.md`（如單檔上傳的 .docx/.pdf）
- **THEN** 跳過該文件（不蓋戳）並記一行 log 列明，不觸發轉檔

#### Scenario: Main index untouched
- **WHEN** 任一文件完成回填
- **THEN** 該文件的 chunks 與 FTS 內容與回填前完全相同（不重切、不重嵌）
