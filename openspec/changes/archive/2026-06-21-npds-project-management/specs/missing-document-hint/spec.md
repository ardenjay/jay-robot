## ADDED Requirements

### Requirement: Detect missing phase documents and hint in answer
當 RAG 查詢時，若專案中某些 NPDS 階段（C1–C7）尚未上傳任何文件，系統 SHALL 在 LLM prompt 中加入說明，讓 LLM 在無法回答時主動提示使用者補傳哪個階段的文件。

#### Scenario: Answer requires a phase with no documents
- **WHEN** 使用者詢問與 C4 DVT 相關的問題，但專案中 C4 尚未上傳任何文件
- **THEN** LLM 的回答中包含提示，說明回答該問題可能需要 C4 階段的文件

#### Scenario: All relevant phases have documents
- **WHEN** 使用者送出問題，且搜尋結果涵蓋相關文件
- **THEN** 系統正常生成答案，不加入缺少文件的提示

### Requirement: Missing phase hint is non-blocking
缺少文件的提示 SHALL 以 LLM 自然語言的方式呈現，不阻擋使用者繼續對話。

#### Scenario: Partial documents available
- **WHEN** 使用者詢問橫跨多個階段的問題，其中部分階段有文件、部分沒有
- **THEN** LLM 根據現有文件盡力回答，並在回答末尾提示哪些階段文件缺失
