## MODIFIED Requirements

### Requirement: Embed user question and retrieve relevant chunks
文件檢索 SHALL 以一個工具 `search_documents` 的形式提供給 LLM：當 LLM 判斷需要已上傳文件來回答時，呼叫該工具，系統才將問題向量化並執行 hybrid search——同時以查詢文字做 keyword 搜尋、以查詢向量做語意搜尋，融合排名後回傳 top-K chunks（預設 K=5）。若注入的 store 未提供 `hybridSearch` 方法，系統 SHALL fallback 至純向量搜尋 `search(vector, topK, projectId)`。文件檢索不再對每個問題無條件執行，而是由工具迴圈視需要觸發。

#### Scenario: LLM uses document search tool
- **WHEN** 使用者問題需要已上傳文件內容，LLM 呼叫 `search_documents`
- **THEN** 系統以 hybrid search（向量 + 關鍵字融合）回傳最相關的 top-K chunks 及其 title 供 LLM 作答

#### Scenario: Keyword-heavy query retrieves exact-match chunks
- **WHEN** LLM 以含精確代碼/料號的查詢（如「C560 checklist」）呼叫 `search_documents`，且某 chunk 內文含該字串
- **THEN** 回傳的 chunks 包含該精確命中的 chunk

#### Scenario: Store without hybridSearch falls back to vector search
- **WHEN** 注入的 store（如測試 mock）沒有 `hybridSearch` 方法
- **THEN** `search_documents` 以 `store.search(vector, topK, projectId)` 完成檢索，行為與現行版本相同

#### Scenario: No documents uploaded
- **WHEN** LLM 呼叫 `search_documents` 但資料庫為空
- **THEN** 工具回傳「尚未上傳任何文件」的結果，LLM 據以回應
