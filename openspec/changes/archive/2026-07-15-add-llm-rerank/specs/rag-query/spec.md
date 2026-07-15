## MODIFIED Requirements

### Requirement: Embed user question and retrieve relevant chunks
文件檢索 SHALL 以一個工具 `search_documents` 的形式提供給 LLM：當 LLM 判斷需要已上傳文件來回答時，呼叫該工具，系統才將問題向量化並從 vector store（hybrid search）取得候選池（預設池大小 15），再交由 LLM rerank 篩至 top-K（預設 K=5）供作答。文件檢索不再對每個問題無條件執行，而是由工具迴圈視需要觸發。

#### Scenario: LLM uses document search tool
- **WHEN** 使用者問題需要已上傳文件內容，LLM 呼叫 `search_documents`
- **THEN** 系統回傳 rerank 後最相關的 top-K chunks 及其 title 供 LLM 作答

#### Scenario: No documents uploaded
- **WHEN** LLM 呼叫 `search_documents` 但資料庫為空
- **THEN** 工具回傳「尚未上傳任何文件」的結果，LLM 據以回應

#### Scenario: Candidate pool reranked by relevance before truncation to top-K
- **WHEN** hybrid search 回傳的候選池數量大於 top-K（例如跨語言關鍵字不匹配，導致 BM25/向量分數排序與實際相關性不一致）
- **THEN** 系統呼叫 LLM 對候選池做一次語意排序，取排序後前 top-K 筆作為最終檢索結果，而非直接依 BM25/向量分數截斷

#### Scenario: Rerank call fails or returns unparseable output
- **WHEN** rerank 呼叫的 LLM 回應無法解析出有效索引，或呼叫本身出錯（如逾時、連線失敗）
- **THEN** 系統不中斷檢索流程，退回候選池原排序的前 top-K 筆
