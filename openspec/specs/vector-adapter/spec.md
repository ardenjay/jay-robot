## Purpose

TBD — Vector Adapter capability for the markdown-rag-chatbot. Defines the interface contract for vector store providers and provides a swappable adapter pattern for chunk storage and similarity search.

## Requirements

### Requirement: VectorAdapter interface contract
所有 VectorAdapter 實作 SHALL 繼承 base class 並實作三個方法：`add(chunks)`、`search(vector, topK)`、`clear()`。

#### Scenario: Add chunks
- **WHEN** 呼叫 `add(chunks)` 傳入 chunk 陣列（含 text、title、docId、embedding）
- **THEN** 所有 chunks 被持久化，可供後續搜尋

#### Scenario: Search by vector
- **WHEN** 呼叫 `search(vector, topK)` 傳入查詢向量與結果數量
- **THEN** 回傳按相似度排序的 chunks 陣列（含 text、title、docId、distance）

#### Scenario: Clear all data
- **WHEN** 呼叫 `clear()`
- **THEN** 所有 chunks 被刪除，後續 search 回傳空陣列

### Requirement: SQLite adapter as default implementation
系統 SHALL 提供 `SqliteVectorAdapter`，以**檔案型 SQLite（better-sqlite3）**持久化 chunks 與專案資料，並以 JS 端 cosine similarity 排序進行向量搜尋。寫入 SHALL 直接寫入資料庫檔（具交易與 SQLite 檔案鎖、啟用 WAL），**不得**將整個資料庫載入記憶體後以整檔覆寫方式持久化，以避免多實例或重啟交疊時造成資料遺失。

#### Scenario: SQLite adapter initializes database
- **WHEN** `SqliteVectorAdapter` 被初始化
- **THEN** 若 SQLite 資料庫檔不存在則自動建立並確保 schema 正確；若已存在則直接沿用其資料

#### Scenario: SQLite adapter searches by cosine similarity
- **WHEN** 呼叫 `search(vector, topK)`
- **THEN** 回傳相似度最高（cosine distance 最小）的 topK 個 chunks

#### Scenario: Writes persist directly without whole-file overwrite
- **WHEN** 呼叫 `add` / `clear` / `movePhase` / `createProject` 等寫入方法
- **THEN** 變更以交易方式直接寫入資料庫檔，不經「記憶體整檔匯出覆寫」，且並行寫入由 SQLite 鎖序列化、不會整檔互相覆蓋

### Requirement: Adapter is swappable via configuration
系統 SHALL 透過環境變數或設定檔決定載入哪個 VectorAdapter，上層 service 程式碼無需修改。

#### Scenario: Switch adapter via environment variable
- **WHEN** 環境變數 `VECTOR_ADAPTER=chroma` 被設定
- **THEN** 系統載入 `ChromaVectorAdapter` 而非預設的 SQLite 實作

### Requirement: Keyword index covers chunk title
FTS 關鍵字索引 SHALL 以兩個獨立欄位組成：`content_seg`（title + content 經分詞後組成）與 `doc_seg`（doc_id 經分詞後組成），使標題詞（如章節路徑中的「I/O 規格」）與文件名中的詞（如「100T」）皆可被關鍵字檢索命中——實例:「100T 有幾個 CAN」的答案 chunk 標題與內文皆無「100T」,僅文件名帶著。排序 SHALL 使用欄位加權的 BM25（`content_seg` 權重高於 `doc_seg`），使文件名匹配可補足內文完全沒有該詞的情況，但不能蓋過內文本身的相關性——同一份文件內，內容真正相關且字數較長的 chunk 排名 SHALL 不因為其他內容空洞的 chunk 也命中文件名而被壓過。索引定義變更 SHALL 以 `PRAGMA user_version` 版本戳觸發一次性整表重建:啟動時 user_version 低於目標版本即重建並寫回;既有的「chunks 與 FTS 筆數不符即重建」檢查保留。

#### Scenario: Title term matches via keyword search
- **WHEN** 某 chunk title 含「I/O 規格」而內文無此詞,使用者查詢含「I/O」
- **THEN** hybridSearch 的關鍵字腿可命中該 chunk

#### Scenario: One-time rebuild on version bump
- **WHEN** 以舊版索引(user_version 低於目標)的 DB 啟動 adapter
- **THEN** FTS 整表重建(既有 chunks 的 title 一併納入索引),user_version 更新;下次啟動不再重建

#### Scenario: Old chunks benefit without re-ingest
- **WHEN** 重建後查詢的關鍵字只出現在某舊 chunk 的 title
- **THEN** 該 chunk 可被關鍵字檢索命中(無需重灌文件)

#### Scenario: Doc name term matches via keyword search
- **WHEN** 答案 chunk 的「100T」只出現在文件名(C455 EAR-100T_UM…),標題與內文皆無
- **THEN** 查詢「100T 有幾個 CAN」時該 chunk 可被關鍵字腿命中,不被內文 CAN 高密度的無關文件壓過

#### Scenario: Doc name match does not override in-document content relevance
- **WHEN** 同一份文件內有兩個 chunk：一個內容空洞（如封面/安裝須知），另一個內容長且真正回答問題（如規格列表），查詢字串含該文件的文件名關鍵字（如專案代號）
- **THEN** 內容真正相關的 chunk 排名 SHALL 不被內容空洞的 chunk 壓過——後者不因文件名占其總字數比例高而在 BM25 上獲得不成比例的優勢

### Requirement: renameDocument updates chunks and keyword index atomically
Vector adapter SHALL 提供 `renameDocument(projectId, oldDocId, newDocId)`:單一交易內更新該文件所有 chunks 的 `doc_id`,並重建其 FTS 索引列(索引文本含檔名,不可只改欄位),回傳更新的 chunk 數(0 表示文件不存在)。

#### Scenario: 改名後關鍵字索引跟上
- **WHEN** renameDocument 後以新檔名中的詞做關鍵字查詢
- **THEN** 可命中該文件 chunks;以舊檔名中的詞查詢不再命中(除非內文本身含該詞)

#### Scenario: 文件不存在
- **WHEN** oldDocId 在該專案無任何 chunks
- **THEN** 回傳 0,不做任何變更

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
