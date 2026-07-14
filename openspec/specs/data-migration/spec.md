## Purpose

TBD — Data Migration capability for the markdown-rag-chatbot. One-command CLI to pull machine-local data (SQLite DB, documents, netlists) from a remote machine with pre-flight safety checks and post-migration validation.

## Requirements

### Requirement: One-command data migration from a remote machine
系統 SHALL 提供 CLI `scripts/migrate.js`：以 `node scripts/migrate.js <user@host>` 從來源機拉取整套機器本地資料到本機。搬運範圍 SHALL 為 `data/`、`public/documents/`、`tools/netlist/` 下的專案子目錄；SHALL NOT 搬運 `.env`、`uploads/`、`incoming/` 與程式碼。rsync 參數（含來源結尾斜線）SHALL 由程式組裝。CLI SHALL 支援 `--path`（來源機專案路徑，預設與本機相同）、`--dry-run`（只預覽計畫與 rsync 試跑，不動資料）、`--stop-remote`、`--skip-netlist`。

#### Scenario: Full migration with defaults
- **WHEN** 執行 `node scripts/migrate.js user@host` 且前置檢查全過
- **THEN** 三個資料目錄以 rsync 拉取到本機對應位置，結束時印出各目錄傳輸摘要與備份位置

#### Scenario: Dry run previews without touching data
- **WHEN** 帶 `--dry-run` 執行
- **THEN** 顯示前置檢查結果與將執行的搬運計畫（rsync -n），本機資料與來源機皆不變

#### Scenario: .env is never transferred
- **WHEN** 執行任何模式的搬運
- **THEN** 本機 `.env` 內容不變，來源機 `.env` 不在傳輸清單

### Requirement: Pre-flight checks abort on unsafe conditions
搬運前 SHALL 依序檢查：(1) SSH 可連線且遠端專案路徑存在，否則中止並提示 `--path`；(2) 來源機 server 進程存在時 SHALL 中止並說明 WAL 熱複製風險，除非帶 `--stop-remote`（此時 SHALL 代為停止並於結束時提醒使用者自行重啟）；(3) 本機 `data/` SHALL 先整目錄備份為 `data.bak-<timestamp>/` 再開始搬運。

#### Scenario: Remote server running without --stop-remote
- **WHEN** 來源機的 app 進程仍在跑且未帶 `--stop-remote`
- **THEN** 工具中止、不搬任何資料，錯誤訊息說明原因與兩個選項（手動停／`--stop-remote`）

#### Scenario: Local database backed up before transfer
- **WHEN** 前置檢查通過、開始搬運
- **THEN** 本機 `data/` 已完整複製到 `data.bak-<timestamp>/`，搬壞可還原

#### Scenario: Remote path missing
- **WHEN** 遠端不存在指定的專案路徑
- **THEN** 中止並提示以 `--path` 指定來源機的實際路徑

### Requirement: Post-migration validation catches known failure modes
搬運完成後 SHALL 自動驗證：(1) `public/documents/` 第一層不得含名為 `documents` 的子目錄（rsync 巢狀特徵），違反時 SHALL 報錯並印出修復指令；(2) 讀取 DB chunk 向量維度、與目前 `LLM_ADAPTER` 對應的預期維度比對，不符時 SHALL 提示執行 `scripts/reembed.js`（只提示，不代跑）。

#### Scenario: Nested documents folder detected
- **WHEN** 搬運後 `public/documents/documents/` 存在
- **THEN** 驗證失敗，輸出含 `mv` 修復指令的錯誤訊息

#### Scenario: Embedding dimension mismatch hint
- **WHEN** 搬來的 DB 向量維度與目前 adapter 的 embedding 模型維度不符（如 DB 是 Gemini 3072 維、本機跑 Ollama bge-m3）
- **THEN** 摘要中提示執行對應的 `LLM_ADAPTER=<x> node scripts/reembed.js`，工具本身不修改 DB

#### Scenario: Clean migration passes validation
- **WHEN** 搬運後結構正確且維度相符
- **THEN** 摘要顯示驗證通過，無多餘警告
