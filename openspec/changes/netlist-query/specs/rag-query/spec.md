## MODIFIED Requirements

### Requirement: Embed user question and retrieve relevant chunks
文件檢索 SHALL 以一個工具 `search_documents` 的形式提供給 LLM：當 LLM 判斷需要已上傳文件來回答時，呼叫該工具，系統才將問題向量化並從 vector store 搜尋餘弦相似度最高的 top-K chunks（預設 K=5）。文件檢索不再對每個問題無條件執行，而是由工具迴圈視需要觸發。

#### Scenario: LLM uses document search tool
- **WHEN** 使用者問題需要已上傳文件內容，LLM 呼叫 `search_documents`
- **THEN** 系統回傳相似度最高的 top-K chunks 及其 title 供 LLM 作答

#### Scenario: No documents uploaded
- **WHEN** LLM 呼叫 `search_documents` 但資料庫為空
- **THEN** 工具回傳「尚未上傳任何文件」的結果，LLM 據以回應

### Requirement: Stream LLM response to client
系統 SHALL 透過 SSE 串流問答過程：工具迴圈每次呼叫工具前 SHALL 發送工具進度事件，最終答案 SHALL 以 token 逐字串流，結束時 SHALL 發送來源列表事件。

#### Scenario: Streaming with tool progress
- **WHEN** LLM 在生成過程中呼叫工具
- **THEN** 前端先收到工具進度事件（顯示呼叫了哪個工具），工具完成後再逐字收到最終答案 token

#### Scenario: Stream ends
- **WHEN** LLM 完成生成
- **THEN** SSE 發送包含來源列表的最終事件後關閉連線

## ADDED Requirements

### Requirement: Answer via LLM tool-calling loop
系統 SHALL 以 LLM 工具呼叫迴圈回答問題：提供工具集（`search_documents` 與該專案可用的 netlist 工具），由 LLM 預設決定呼叫哪些工具；系統執行工具、將結果回填，反覆直到 LLM 產生最終答案。system prompt SHALL 含強指令：凡涉及具體零件(refdes)、net、腳位、連線/追線，LLM 必須呼叫 netlist 工具而非憑記憶猜測。

#### Scenario: Circuit question routes to netlist tools
- **WHEN** 使用者問連線/零件/追線問題，且該專案有 netlist
- **THEN** LLM 呼叫 netlist 工具（而非文件查詢或憑記憶），依工具結果回答

#### Scenario: Document question routes to document search
- **WHEN** 使用者問已上傳文件相關問題
- **THEN** LLM 呼叫 `search_documents`，依檢索結果回答

#### Scenario: Mixed question uses multiple tools
- **WHEN** 問題同時需要連線資訊與文件說明
- **THEN** LLM 可在同一輪對話中呼叫多個工具，綜合結果作答

#### Scenario: Explicit user direction is honored
- **WHEN** 使用者明確要求使用某工具（如「用 trace 查 U42.4」）
- **THEN** LLM 依指令呼叫對應工具
