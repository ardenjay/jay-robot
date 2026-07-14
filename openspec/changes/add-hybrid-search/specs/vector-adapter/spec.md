## ADDED Requirements

### Requirement: Hybrid search combining keyword and vector ranking
VectorAdapter SHALL 提供 `hybridSearch(queryText, vector, topK, projectId)`：同時以查詢文字做 keyword 搜尋、以查詢向量做相似度搜尋，並以 Reciprocal Rank Fusion（RRF，k=60）融合兩側排名後回傳 top-K chunks（shape 與 `search` 相同：`{id, docId, title, text, distance}`）。base class SHALL 提供預設實作 = 直接委派給 `search(vector, topK, projectId)`，使未實作 keyword 搜尋的 adapter（含測試 mock）行為不變。

#### Scenario: Exact keyword hits are included in top-K
- **WHEN** 查詢文字含精確關鍵字（如料號 `U42`、文件代碼 `C560`），且某 chunk 內文含該字串但向量相似度排名靠後
- **THEN** 該 chunk 經 RRF 融合後仍出現在回傳的 top-K 中

#### Scenario: Semantic query still works when keyword search misses
- **WHEN** 查詢文字在 FTS 索引中零命中（純語意問法）
- **THEN** 回傳結果等同純向量搜尋的 top-K，不拋錯

#### Scenario: Default implementation falls back to vector search
- **WHEN** 某 adapter 未覆寫 `hybridSearch`，被以 `hybridSearch(queryText, vector, topK, projectId)` 呼叫
- **THEN** 回傳結果與 `search(vector, topK, projectId)` 相同

### Requirement: SQLite adapter maintains a synchronized full-text index
`SqliteVectorAdapter` SHALL 以 SQLite FTS5 建立全文索引（BM25 排名），索引內容為 CJK 逐字切分、英數 token 保留完整、lowercase 的前處理文字；查詢側 SHALL 套用相同前處理，且每個 token 以雙引號包裹、以 OR 串接（防 FTS 語法注入、避免 AND 過嚴零命中）。FTS 索引 SHALL 與 `chunks` 資料表同步：`add` 於同一交易寫入兩表、`clear` 同步刪除；初始化時若 FTS 表不存在或筆數與 `chunks` 不一致 SHALL 自動重建（backfill）。FTS5 不可用時 SHALL 降級為純向量模式而非啟動失敗。

#### Scenario: Chunks are indexed on add and removed on clear
- **WHEN** 呼叫 `add(chunks)` 後再呼叫 `clear(docId, projectId)`
- **THEN** 新增的 chunks 於 add 後可被 keyword 搜尋命中，clear 後同一查詢不再命中

#### Scenario: Existing database is backfilled on startup
- **WHEN** 以既有（無 FTS 表）的資料庫檔初始化 adapter
- **THEN** FTS 索引自動建立且涵蓋所有既有 chunks，keyword 搜尋可命中舊資料

#### Scenario: Mixed CJK and alphanumeric query matches
- **WHEN** 查詢文字為中英混合（如「U42 的電源腳位」），某 chunk 含 `U42`
- **THEN** 該 chunk 被 keyword 搜尋命中且經 BM25 排名回傳

#### Scenario: FTS5 unavailable degrades gracefully
- **WHEN** 執行環境的 SQLite 無 FTS5 模組
- **THEN** adapter 正常初始化，`hybridSearch` 回傳純向量搜尋結果
