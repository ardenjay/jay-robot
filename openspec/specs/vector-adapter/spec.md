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
FTS 關鍵字索引的 `content_seg` SHALL 由「doc_id(文件名)+ title + content」經分詞後組成(寫入與整表重建皆同),使標題詞(如章節路徑中的「I/O 規格」)與文件名中的詞(如「100T」)可被關鍵字檢索命中——實例:「100T 有幾個 CAN」的答案 chunk 標題與內文皆無「100T」,僅文件名帶著。索引定義變更 SHALL 以 `PRAGMA user_version` 版本戳觸發一次性整表重建:啟動時 user_version 低於目標版本即重建並寫回;既有的「chunks 與 FTS 筆數不符即重建」檢查保留。

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

### Requirement: renameDocument updates chunks and keyword index atomically
Vector adapter SHALL 提供 `renameDocument(projectId, oldDocId, newDocId)`:單一交易內更新該文件所有 chunks 的 `doc_id`,並重建其 FTS 索引列(索引文本含檔名,不可只改欄位),回傳更新的 chunk 數(0 表示文件不存在)。

#### Scenario: 改名後關鍵字索引跟上
- **WHEN** renameDocument 後以新檔名中的詞做關鍵字查詢
- **THEN** 可命中該文件 chunks;以舊檔名中的詞查詢不再命中(除非內文本身含該詞)

#### Scenario: 文件不存在
- **WHEN** oldDocId 在該專案無任何 chunks
- **THEN** 回傳 0,不做任何變更
