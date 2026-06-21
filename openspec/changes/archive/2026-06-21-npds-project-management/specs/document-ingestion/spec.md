## MODIFIED Requirements

### Requirement: Upload Markdown file
系統 SHALL 接受用戶透過 HTTP POST 上傳 `.md` 或 `.markdown` 檔案，請求 body 中 SHALL 包含 `project_id`（必填）和 `phase`（必填，值為 C1–C7 之一）。

#### Scenario: Upload valid Markdown file with project and phase
- **WHEN** 用戶上傳一個 `.md` 檔案，並提供有效的 `project_id` 和 `phase`
- **THEN** 系統回傳 HTTP 200 並附上已處理的 chunk 數量

#### Scenario: Upload non-Markdown file
- **WHEN** 用戶上傳非 `.md` / `.markdown` 副檔名的檔案
- **THEN** 系統回傳 HTTP 400 並說明僅接受 Markdown 格式

#### Scenario: Upload without project_id
- **WHEN** 用戶上傳檔案但未提供 `project_id`
- **THEN** 系統回傳 HTTP 400 並說明 `project_id` 為必填

#### Scenario: Upload with invalid phase
- **WHEN** 用戶上傳檔案但 `phase` 不在 C1–C7 範圍內
- **THEN** 系統回傳 HTTP 400 並說明 `phase` 必須為 C1 至 C7

## ADDED Requirements

### Requirement: Store project and phase metadata with chunks
系統 SHALL 將 `project_id` 與 `phase` 儲存至每個 chunk 的記錄中。

#### Scenario: Chunk metadata includes project and phase
- **WHEN** 文件上傳成功並完成 chunking
- **THEN** 每個 chunk 在 vector store 中含有對應的 `project_id` 和 `phase` 欄位
