## Purpose

TBD — Document ingestion capability for the markdown-rag-chatbot. Handles receiving uploaded Markdown files, parsing them into semantic chunks, embedding them, and storing them in the vector store.

## Requirements

### Requirement: Upload Markdown file
系統 SHALL 接受用戶透過 HTTP POST 上傳 `.md`、`.markdown` 或 `.pdf` 檔案，請求 body 中 SHALL 包含 `project_id`（必填）和 `phase`（必填，值為 C1–C7 之一）。上傳前，前端 SHALL 嘗試從檔名解析 NPDS 文件代碼以自動預填 `phase`，但 User 仍可在送出前修改。

#### Scenario: Upload valid Markdown file with project and phase
- **WHEN** 用戶上傳一個 `.md` 檔案，並提供有效的 `project_id` 和 `phase`
- **THEN** 系統回傳 HTTP 200 並附上已處理的 chunk 數量

#### Scenario: Upload PDF file
- **WHEN** 用戶上傳一個 `.pdf` 檔案，並提供有效的 `project_id` 和 `phase`
- **THEN** 系統呼叫 MinerU 將 PDF 轉為 Markdown，轉換成功後 ingest 並回傳 HTTP 200 及已處理的 chunk 數量

#### Scenario: Filename contains NPDS document code
- **WHEN** 用戶選取的檔案名稱符合 `C[1-7]\d{2,}` 模式（如 `C303_spec.md`）
- **THEN** 前端自動預選對應的 phase（如 C3），User 可在送出前修改

#### Scenario: Filename does not contain NPDS document code
- **WHEN** 用戶選取的檔案名稱不含可識別的 NPDS 代碼
- **THEN** phase 下拉選單維持未選，User 須手動選取

#### Scenario: Upload non-Markdown non-PDF file
- **WHEN** 用戶上傳非 `.md` / `.markdown` / `.pdf` 副檔名的檔案
- **THEN** 系統回傳 HTTP 400 並說明僅接受 Markdown 或 PDF 格式

#### Scenario: Upload without project_id
- **WHEN** 用戶上傳檔案但未提供 `project_id`
- **THEN** 系統回傳 HTTP 400 並說明 `project_id` 為必填

#### Scenario: Upload with invalid phase
- **WHEN** 用戶上傳檔案但 `phase` 不在 C1–C7 範圍內
- **THEN** 系統回傳 HTTP 400 並說明 `phase` 必須為 C1 至 C7

#### Scenario: MinerU conversion fails
- **WHEN** 用戶上傳 PDF 但 MinerU 執行失敗（環境未安裝或轉換錯誤）
- **THEN** 系統回傳 HTTP 500 並說明 PDF 轉換失敗原因

### Requirement: Parse Markdown by headings
系統 SHALL 依 `#`、`##`、`###` 標題將 Markdown 文件切割成語意 chunks，每個 chunk 保留所屬標題作為 `title`。

#### Scenario: Document with multiple headings
- **WHEN** Markdown 文件包含多個標題
- **THEN** 每個標題與其下方內容形成一個獨立 chunk

#### Scenario: Document without headings
- **WHEN** Markdown 文件沒有任何標題
- **THEN** 整份文件作為一個 chunk，`title` 為檔案名稱

#### Scenario: Chunk exceeds 1500 characters
- **WHEN** 單一 chunk 超過 1500 字
- **THEN** 系統以段落為單位進一步切割，確保每個 chunk 不超過 1500 字

### Requirement: Embed and store chunks
系統 SHALL 將每個 chunk 的文字透過 Embedding API 轉換為向量，並連同原始文字、標題、文件 ID 一起儲存至 vector store。

#### Scenario: Successful embedding and storage
- **WHEN** chunk 文字被送至 Embedding API
- **THEN** 回傳的向量與 chunk metadata 一同寫入 SQLite

#### Scenario: Embedding API rate limit hit
- **WHEN** Embedding API 回傳速率限制錯誤
- **THEN** 系統以 exponential backoff 重試，最多 3 次

### Requirement: Re-upload replaces existing document
系統 SHALL 在上傳同名文件時，先刪除該文件的所有舊 chunks，再寫入新 chunks。

#### Scenario: Re-upload same filename
- **WHEN** 用戶上傳已存在於資料庫的同名檔案
- **THEN** 舊 chunks 被刪除，新 chunks 取而代之，總 chunk 數更新

### Requirement: Persist original uploaded file
系統 SHALL 在成功處理文件後，將原始上傳檔案（.md 或 .pdf）複製至 `public/documents/<projectId>/<originalname>`，供後續下載或瀏覽器直接存取。

#### Scenario: Markdown file persisted after upload
- **WHEN** 用戶成功上傳 `.md` 或 `.markdown` 檔案
- **THEN** 原始 Markdown 檔案存在於 `public/documents/<projectId>/<originalname>`，可透過 `/documents/<projectId>/<originalname>` 路徑存取

#### Scenario: PDF file persisted after upload
- **WHEN** 用戶成功上傳 `.pdf` 檔案且 MinerU 轉換成功
- **THEN** 原始 PDF 檔案存在於 `public/documents/<projectId>/<originalname>`，可透過 `/documents/<projectId>/<originalname>` 路徑存取

#### Scenario: Re-upload replaces persisted file
- **WHEN** 用戶上傳與既有文件同名的檔案
- **THEN** `public/documents/<projectId>/<originalname>` 的舊檔被覆蓋為新版本
