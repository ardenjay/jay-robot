## MODIFIED Requirements

### Requirement: Embed user question and retrieve relevant chunks
系統 SHALL 將用戶問題向量化，並從 vector store 中 **僅搜尋指定 `project_id` 的 chunks**，回傳餘弦距離最近的 top-K chunks（預設 K=5）。

#### Scenario: Question matches stored content within project
- **WHEN** 用戶在選定專案中送出問題，且該專案有相關 chunks
- **THEN** 系統回傳該專案相似度最高的 5 個 chunks 及其 title

#### Scenario: No documents in selected project
- **WHEN** 用戶在選定專案中送出問題但該專案尚無任何 chunks
- **THEN** 系統回傳提示訊息說明該專案尚未上傳任何文件
