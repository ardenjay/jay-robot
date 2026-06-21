## MODIFIED Requirements

### Requirement: Upload Markdown file
系統 SHALL 接受用戶透過 HTTP POST 上傳下列副檔名的檔案：`.md`、`.markdown`、`.pdf`，以及 markitdown 支援的文件格式 `.docx`、`.pptx`、`.xlsx`、`.xls`、`.html`、`.htm`、`.csv`、`.json`、`.xml`、`.epub`。請求 body 中 SHALL 包含 `project_id`（必填）和 `phase`（必填，值為 C1–C7 之一）。上傳前，前端 SHALL 嘗試從檔名解析 NPDS 文件代碼以自動預填 `phase`，但 User 仍可在送出前修改。`.md` / `.markdown` 直接 ingest；`.pdf` 經 MinerU 轉換；其餘支援格式經 markitdown 轉換為 Markdown 後再 ingest。

#### Scenario: Upload valid Markdown file with project and phase
- **WHEN** 用戶上傳一個 `.md` 檔案，並提供有效的 `project_id` 和 `phase`
- **THEN** 系統回傳 HTTP 200 並附上已處理的 chunk 數量

#### Scenario: Upload PDF file
- **WHEN** 用戶上傳一個 `.pdf` 檔案，並提供有效的 `project_id` 和 `phase`
- **THEN** 系統呼叫 MinerU 將 PDF 轉為 Markdown，轉換成功後 ingest 並回傳 HTTP 200 及已處理的 chunk 數量

#### Scenario: Upload markitdown-supported document
- **WHEN** 用戶上傳一個 markitdown 支援的文件（如 `.docx`、`.pptx`、`.xlsx`、`.xls`、`.html`、`.htm`、`.csv`、`.json`、`.xml`、`.epub`），並提供有效的 `project_id` 和 `phase`
- **THEN** 系統呼叫 markitdown 將檔案轉為 Markdown，轉換成功後 ingest 並回傳 HTTP 200 及已處理的 chunk 數量

#### Scenario: Filename contains NPDS document code
- **WHEN** 用戶選取的檔案名稱符合 `C[1-7]\d{2,}` 模式（如 `C303_spec.md`）
- **THEN** 前端自動預選對應的 phase（如 C3），User 可在送出前修改

#### Scenario: Filename does not contain NPDS document code
- **WHEN** 用戶選取的檔案名稱不含可識別的 NPDS 代碼
- **THEN** phase 下拉選單維持未選，User 須手動選取

#### Scenario: Upload unsupported file type
- **WHEN** 用戶上傳的副檔名不在支援清單（`.md` / `.markdown` / `.pdf` / markitdown 支援格式）內
- **THEN** 系統回傳 HTTP 400 並說明僅接受 Markdown、PDF 或 markitdown 支援的文件格式

#### Scenario: Upload without project_id
- **WHEN** 用戶上傳檔案但未提供 `project_id`
- **THEN** 系統回傳 HTTP 400 並說明 `project_id` 為必填

#### Scenario: Upload with invalid phase
- **WHEN** 用戶上傳檔案但 `phase` 不在 C1–C7 範圍內
- **THEN** 系統回傳 HTTP 400 並說明 `phase` 必須為 C1 至 C7

#### Scenario: MinerU conversion fails
- **WHEN** 用戶上傳 PDF 但 MinerU 執行失敗（環境未安裝或轉換錯誤）
- **THEN** 系統回傳 HTTP 500 並說明 PDF 轉換失敗原因

#### Scenario: markitdown conversion fails
- **WHEN** 用戶上傳 markitdown 支援格式但 markitdown 執行失敗（環境未安裝或轉換錯誤）
- **THEN** 系統回傳 HTTP 500 並說明文件轉換失敗原因

### Requirement: Persist original uploaded file
系統 SHALL 在成功處理文件後，將原始上傳檔案複製至 `public/documents/<projectId>/<originalname>`，供後續下載或瀏覽器直接存取。

#### Scenario: Markdown file persisted after upload
- **WHEN** 用戶成功上傳 `.md` 或 `.markdown` 檔案
- **THEN** 原始 Markdown 檔案存在於 `public/documents/<projectId>/<originalname>`，可透過 `/documents/<projectId>/<originalname>` 路徑存取

#### Scenario: PDF file persisted after upload
- **WHEN** 用戶成功上傳 `.pdf` 檔案且 MinerU 轉換成功
- **THEN** 原始 PDF 檔案存在於 `public/documents/<projectId>/<originalname>`，可透過 `/documents/<projectId>/<originalname>` 路徑存取

#### Scenario: markitdown-supported file persisted after upload
- **WHEN** 用戶成功上傳 markitdown 支援格式的檔案且轉換成功
- **THEN** 原始檔案存在於 `public/documents/<projectId>/<originalname>`，可透過 `/documents/<projectId>/<originalname>` 路徑存取

#### Scenario: Re-upload replaces persisted file
- **WHEN** 用戶上傳與既有文件同名的檔案
- **THEN** `public/documents/<projectId>/<originalname>` 的舊檔被覆蓋為新版本
