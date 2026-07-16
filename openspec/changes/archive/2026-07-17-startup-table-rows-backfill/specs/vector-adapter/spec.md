## ADDED Requirements

### Requirement: Versioned startup DB migration ladder
程式碼 SHALL 宣告其搭配的 DB 版本（`DB_VERSION` 常數）與依版本號排序的遷移步驟表。adapter 啟動時 SHALL 比對 `PRAGMA user_version`：低於 `DB_VERSION` 即依序執行所有缺少的步驟，**每步完成即把 user_version 更新到該步版本號**。階梯 SHALL 只收秒級、無外部依賴、可阻塞啟動的遷移（schema 建立、FTS 整表重建）；需要 embedding 等外部服務的資料補建 SHALL NOT 進入階梯（走背景補料層）。每個步驟 SHALL 冪等（重跑無害）。既有 FTS 定義版本檢查（≤ v5）收編為階梯的歷史步驟，行為不變。

#### Scenario: Existing DB upgrades only the missing steps
- **WHEN** 以 user_version=5 的既有 DB 啟動新版程式碼（DB_VERSION=6）
- **THEN** 只執行 step 6（建立 table_rows / doc_ingest_meta），user_version 變 6；FTS 不重建

#### Scenario: Fresh or very old DB runs the full ladder
- **WHEN** 以 user_version 低於 5 的 DB（或全新 DB）啟動
- **THEN** 依序執行到 6 的所有步驟，每步完成即蓋戳

#### Scenario: Up-to-date DB is a no-op
- **WHEN** user_version 已等於 DB_VERSION
- **THEN** 不執行任何遷移步驟，啟動時間不受影響

#### Scenario: Future schema change deploys by git pull alone
- **WHEN** 日後新增 step 7 並 bump DB_VERSION=7，正式機 git pull 後重啟
- **THEN** DB 自動升級到 7，無需人工操作或重新上傳文件
