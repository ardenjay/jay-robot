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
