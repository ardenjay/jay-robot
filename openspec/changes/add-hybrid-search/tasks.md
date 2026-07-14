## 1. FTS 索引與斷詞（SQLite adapter）

- [ ] 1.1 在 `src/adapters/vector/sqlite.js` 新增 `segmentForFts(text)`：CJK 逐字切分、英數（含 `-`/`_`）token 保留完整、lowercase
- [ ] 1.2 初始化建立 `chunks_fts` FTS5 虛擬表（`content_seg` + UNINDEXED 的 `chunk_id`/`doc_id`/`project_id`）；FTS5 不可用時降級為無 FTS 模式（記 flag，不拋錯）
- [ ] 1.3 初始化 backfill：FTS 表不存在或筆數與 `chunks` 不一致時，於單一交易內整表重建
- [ ] 1.4 `add()` 於同一交易同步寫入 `chunks_fts`；`clear()` 同步刪除對應 FTS rows

## 2. Keyword search 與 RRF 融合

- [ ] 2.1 實作 keyword search：查詢文字經 `segmentForFts` 前處理，每個 token 雙引號包裹、OR 串接，`MATCH` + `ORDER BY rank`（BM25）取前 `topK * 4` 名（依 projectId 過濾）
- [ ] 2.2 實作 `hybridSearch(queryText, vector, topK, projectId)`：向量側取前 `topK * 4` 名候選，與 keyword 側以 RRF（k=60）融合，回傳 top-K（shape 同 `search`，`distance` 取向量側、僅 keyword 命中者以最大 distance 補位）；無 FTS 模式直接回傳 `search` 結果
- [ ] 2.3 `src/adapters/vector/base.js` 新增 `hybridSearch` 預設實作：委派給 `this.search(vector, topK, projectId)`

## 3. Retrieval 服務接線

- [ ] 3.1 `src/services/retrieval.js` 的 `runSearchDocuments`：改呼叫 `store.hybridSearch(query, queryVector, TOP_K, projectId)`，store 無此方法時 fallback `store.search`

## 4. 測試與驗證

- [ ] 4.1 `tests/vector-adapter.test.js`：關鍵字精確命中進 top-K（向量排名靠後仍被撈回）、中英混合查詢命中、FTS 零命中時等同純向量、add/clear 後 FTS 同步
- [ ] 4.2 `tests/vector-adapter.test.js`：舊 DB（無 FTS 表）初始化自動 backfill，keyword 搜尋可命中舊資料
- [ ] 4.3 `tests/retrieval-prompt.test.js`：mock store 無 `hybridSearch` 時 fallback `search`；有 `hybridSearch` 時以原始查詢文字呼叫
- [ ] 4.4 跑全部測試套件並手動以真實 DB 驗證一筆料號查詢（如 `U42`）確實命中含該字串的 chunk
