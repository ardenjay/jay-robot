## ADDED Requirements

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
系統 SHALL 提供 `SqliteVectorAdapter`，使用 `sqlite-vec` 擴充進行向量搜尋，以 cosine distance 排序。

#### Scenario: SQLite adapter initializes database
- **WHEN** `SqliteVectorAdapter` 被初始化
- **THEN** 若 SQLite 資料庫不存在則自動建立，並確保 schema 正確

#### Scenario: SQLite adapter searches by cosine distance
- **WHEN** 呼叫 `search(vector, topK)`
- **THEN** 回傳 cosine distance 最小的 topK 個 chunks

### Requirement: Adapter is swappable via configuration
系統 SHALL 透過環境變數或設定檔決定載入哪個 VectorAdapter，上層 service 程式碼無需修改。

#### Scenario: Switch adapter via environment variable
- **WHEN** 環境變數 `VECTOR_ADAPTER=chroma` 被設定
- **THEN** 系統載入 `ChromaVectorAdapter` 而非預設的 SQLite 實作
