# Spec: Missing Document Hint

## Purpose

當 RAG 查詢無法從已上傳文件中獲得完整答案時，系統應能識別缺少哪些具體文件，並以自然語言提示使用者上傳對應的 NPDS 文件（含文件代碼、名稱與所屬階段），而非僅提示階段名稱。

---

## Requirements

### Requirement: Detect missing phase documents and hint in answer
當 RAG 查詢時，系統 SHALL 在 LLM prompt 中注入完整的 NPDS 文件目錄（C101–C799），讓 LLM 在無法從已上傳文件回答問題時，能根據問題語義從目錄中識別最相關的具體文件，提示使用者上傳（含文件代碼、名稱與所屬階段），而非僅提示階段名稱。

#### Scenario: Answer requires a document not yet uploaded
- **WHEN** 使用者詢問與可靠度測試相關的問題，但專案中尚未上傳對應文件
- **THEN** LLM 的回答中提示具體文件，例如「建議上傳 C489 可靠度測試報告（C4 DVT 試作）」

#### Scenario: Answer requires a document from an uploaded phase
- **WHEN** 使用者詢問與 EMI 認證相關的問題，C4 階段有文件但不包含 EMI 報告
- **THEN** LLM 根據目錄識別出 C471 EMI & EMC 認證報告，提示使用者上傳該具體文件

#### Scenario: All relevant documents are uploaded
- **WHEN** 使用者送出問題，且搜尋結果涵蓋相關文件
- **THEN** 系統正常生成答案，不加入文件缺失提示

### Requirement: Missing phase hint is non-blocking
缺少文件的提示 SHALL 以 LLM 自然語言的方式呈現，不阻擋使用者繼續對話。

#### Scenario: Partial documents available
- **WHEN** 使用者詢問橫跨多個階段的問題，其中部分文件已上傳、部分未上傳
- **THEN** LLM 根據已上傳文件盡力回答，並在回答末尾具體指出缺少哪份文件（代碼 + 名稱）
