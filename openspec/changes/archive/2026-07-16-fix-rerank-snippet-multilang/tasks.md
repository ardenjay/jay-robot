## 1. buildSnippet 多變體 + 大小寫不敏感

- [x] 1.1 `buildSnippet(query, text)` → `buildSnippet(queries, text)`：`Array.isArray` 分流，蒐集所有變體詞
- [x] 1.2 命中比對改大小寫不敏感（`lower.indexOf(t.toLowerCase())`），切片仍用原始文字保留大小寫

## 2. rerankChunks / buildPrompt 傳遞變體

- [x] 2.1 `buildPrompt(query, chunks, topK, snippetQueries = query)`：listing 用 `snippetQueries` 開窗，「使用者問題：」仍用 `query`
- [x] 2.2 `rerankChunks(adapter, query, chunks, topK, snippetQueries = query)` 傳遞給 buildPrompt
- [x] 2.3 `retrieval.runSearchDocuments`：`rerankChunks(adapter, query, pool, TOP_K, variants)`

## 3. 單元測試

- [x] 3.1 `tests/rerank.test.js`：buildSnippet 傳陣列變體時，用其中一個變體的詞（含大小寫不同）能在 head 之後開窗
- [x] 3.2 大小寫不敏感：小寫查詢詞命中內文大寫詞
- [x] 3.3 單一字串仍相容（既有 5 個測試不變）；snippetQueries 省略時等同 query
- [x] 3.4 `npm test` 全綠

## 4. 真實資料驗證

- [x] 4.1 溫度題「EAR-100T 的工作溫度範圍是多少?」轉綠（答 -20~60）
- [x] 4.2 跑完整回歸確認無其他題退化
