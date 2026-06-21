## ADDED Requirements

### Requirement: Upload Markdown file
系統 SHALL 接受用戶透過 HTTP POST 上傳 `.md` 或 `.markdown` 檔案。

#### Scenario: Upload valid Markdown file
- **WHEN** 用戶上傳一個 `.md` 檔案
- **THEN** 系統回傳 HTTP 200 並附上已處理的 chunk 數量

#### Scenario: Upload non-Markdown file
- **WHEN** 用戶上傳非 `.md` / `.markdown` 副檔名的檔案
- **THEN** 系統回傳 HTTP 400 並說明僅接受 Markdown 格式

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
