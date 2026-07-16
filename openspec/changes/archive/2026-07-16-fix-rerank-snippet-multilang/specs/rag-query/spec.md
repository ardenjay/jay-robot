## MODIFIED Requirements

### Requirement: Embed user question and retrieve relevant chunks
文件檢索 SHALL 以一個工具 `search_documents` 的形式提供給 LLM：當 LLM 判斷需要已上傳文件來回答時，呼叫該工具，系統才將問題向量化並從 vector store（hybrid search）取得候選池（預設池大小 25），再交由 LLM rerank 篩至 top-K（預設 K=5）供作答。文件檢索不再對每個問題無條件執行，而是由工具迴圈視需要觸發。

檢索前 SHALL 對含 CJK 字元的查詢做 query expansion：用生成模型產生一個英文版本，原查詢與英文查詢**各自**跑 hybrid search 取候選，再 round-robin 合併去重成候選池（有上限）交給 rerank；翻譯失敗或查詢本就無 CJK 時 SHALL 退回單一查詢。此舉補償「專案文件多為英文、中文查詢對英文 chunk 召回不足」的跨語言缺口。

餵給 rerank 的候選片段 SHALL 為 query-aware：一律先給 chunk 前段（head），若查詢關鍵字只出現在 head 之後，SHALL 另附該命中處的一段視窗，使答案關鍵字對重排器可見，避免長表格 chunk 的答案因固定截斷而被重排器誤判為不相關。片段開窗 SHALL 使用**全部查詢變體**（含 query expansion 產生的英文版本）的關鍵字，且命中比對 SHALL **大小寫不敏感**——如此中文查詢也能在英文表格內文（如 `Operating Temperature`）找到命中處開窗，補上跨語言的「答案可見性」缺口（query expansion 補召回、此處補可見性）。rerank prompt 呈現給重排器的「使用者問題」SHALL 仍為原始查詢，變體僅用於開窗、不改變問題語意。開窗 SHALL 為純加法：head 永遠保留，變體與大小寫不敏感只會附加視窗、不移除既有內容，故不劣於固定截斷。

#### Scenario: LLM uses document search tool
- **WHEN** 使用者問題需要已上傳文件內容，LLM 呼叫 `search_documents`
- **THEN** 系統回傳 rerank 後最相關的 top-K chunks 及其 title 供 LLM 作答

#### Scenario: No documents uploaded
- **WHEN** LLM 呼叫 `search_documents` 但資料庫為空
- **THEN** 工具回傳「尚未上傳任何文件」的結果，LLM 據以回應

#### Scenario: Chinese query retrieves an English-only chunk via bilingual expansion
- **WHEN** 使用者用中文問一個答案只在英文文件裡的問題（如「MTi 600 的供電輸入電壓範圍」，正確 chunk 是英文 §6.3 Electrical、中文查詢下排在候選池外）
- **THEN** 系統另用英文版查詢檢索，把該英文 chunk 併入候選池，交由 rerank 排進 top-K，模型據以答出正確值（VIN 4.5–24 V）

#### Scenario: English query skips expansion
- **WHEN** 查詢不含 CJK 字元（本就是英文）
- **THEN** 系統不做翻譯擴展，僅用原查詢檢索

#### Scenario: Expansion failure falls back to single query
- **WHEN** query expansion 的翻譯呼叫失敗或回空
- **THEN** 系統退回只用原查詢檢索，不中斷流程

#### Scenario: Candidate pool reranked by relevance before truncation to top-K
- **WHEN** hybrid search 回傳的候選池數量大於 top-K（例如跨語言關鍵字不匹配，導致 BM25/向量分數排序與實際相關性不一致）
- **THEN** 系統呼叫 LLM 對候選池做一次語意排序，取排序後前 top-K 筆作為最終檢索結果，而非直接依 BM25/向量分數截斷

#### Scenario: Pool is wide enough to include vector-strong hits demoted by fusion
- **WHEN** 某正確 chunk 在純向量排名靠前（如 #13）、但在 RRF 融合後因跨語言關鍵字排名很差被拉低（如融合後 #19–22）
- **THEN** 候選池（預設 25）仍涵蓋該 chunk，交由 rerank 依語意把它排回 top-K

#### Scenario: Answer deep in a long table chunk stays visible to the reranker
- **WHEN** 正確 chunk 是很長的規格表，答案關鍵字（如 `TPM 2.0`）只出現在片段 head 之後（如第 576 字，超過 head 長度）
- **THEN** rerank 片段附上該關鍵字命中處的視窗，重排器看得到答案關鍵字、把該 chunk 排進 top-K，而非因看不到而誤踢

#### Scenario: Chinese query surfaces an answer buried in an English table via variant windowing
- **WHEN** 使用者用中文問一個答案埋在英文規格表 head 之後的問題（如「工作溫度範圍」，正確值 `Operating Temperature -20 ~ 60 °C` 在第 1030 字、內文為英文），而另一份文件的英文 `Operating Temperature 0 to 35`（不相關）剛好落在其 head 內
- **THEN** 系統以英文變體關鍵字（大小寫不敏感）在正確 chunk 的英文內文開窗，讓重排器看得到 `-20 ~ 60 °C`，把正確 chunk 排到相關 chunk 之上，而非因看不到而採用 head 內剛好可見的錯誤來源

#### Scenario: Rerank call fails or returns unparseable output
- **WHEN** rerank 呼叫的 LLM 回應無法解析出有效索引，或呼叫本身出錯（如逾時、連線失敗）
- **THEN** 系統不中斷檢索流程，退回候選池原排序的前 top-K 筆
