## Purpose

TBD — Document ingestion capability for the markdown-rag-chatbot. Handles receiving uploaded Markdown files, parsing them into semantic chunks, embedding them, and storing them in the vector store.

## Requirements

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
系統 SHALL 將 chunks 的文字透過 Embedding API 轉換為向量，並連同原始文字、標題、文件 ID 一起儲存至 vector store。為降低 API 請求數與速率限制（429）風險，系統 SHALL 以**批次方式**產生 embedding（每批多個 chunk 一次送出），而非每個 chunk 各發一次請求。

#### Scenario: Batch embedding and storage
- **WHEN** 一份文件被切成多個 chunks 並進行 embedding
- **THEN** 系統分批呼叫批次 embedding（每批多筆），取得的向量與各 chunk 的 metadata 一同寫入 SQLite

#### Scenario: Embedding API rate limit hit
- **WHEN** Embedding API 回傳速率限制錯誤（429）
- **THEN** 系統重試該批請求；若回應含建議等待時間（`retryDelay`）則依其等待，否則採指數退避，達重試上限後才視為失敗

#### Scenario: Large document does not exhaust per-request rate limit
- **WHEN** 上傳頁數很多、chunks 數量龐大的文件
- **THEN** 因採批次 embedding，API 請求數遠少於 chunk 數，顯著降低觸發 429 的機率

### Requirement: Re-upload replaces existing document
系統 SHALL 在上傳同名文件時，先刪除該文件的所有舊 chunks，再寫入新 chunks。

#### Scenario: Re-upload same filename
- **WHEN** 用戶上傳已存在於資料庫的同名檔案
- **THEN** 舊 chunks 被刪除，新 chunks 取而代之，總 chunk 數更新

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

### Requirement: Phase auto-detection does not retain a stale selection

上傳前的 phase 自動偵測 SHALL 在每次選取新檔時，依該檔名重新決定 phase：檔名含 NPDS 代碼則自動帶入對應 phase；檔名**不含**可辨識代碼時，SHALL 清空 phase 下拉，使其回到「未選」狀態，不得沿用先前所選檔案殘留的 phase 值。如此檔名無代碼時，使用者必須明確選擇 phase，上傳鈕在 phase 未選時 SHALL 維持停用。

#### Scenario: Newly selected file without code clears previous phase
- **WHEN** 使用者先選了檔名含代碼的檔案（phase 自動帶入，如 C4），接著選取一個檔名不含 NPDS 代碼的檔案
- **THEN** phase 下拉被清空為未選狀態，且上傳鈕停用，直到使用者手動選擇 phase

#### Scenario: Newly selected file with code updates phase
- **WHEN** 使用者選取檔名含 NPDS 代碼的檔案（不論先前下拉為何值）
- **THEN** phase 下拉更新為該檔名對應的 phase

### Requirement: Ingest a pre-built folder via CLI

系統 SHALL 提供命令列進料工具，將一個「已在外部（如使用者 PC 上跑 MinerU）處理好的資料夾」灌進知識庫，作為 Web 上傳之外的額外進料管道。該工具 SHALL 接受目標資料夾路徑、必填的 `--project` 與選用的 `--phase` 參數；資料夾路徑省略時 SHALL 預設讀取專案根目錄下 `incoming/` 內的資料夾，給定路徑（含絕對路徑）時 SHALL 使用該路徑。此工具不經 HTTP，SHALL NOT 受唯讀模式（`READ_ONLY`）影響。

phase 解析規則：`--phase` 有給時 SHALL 以參數為準（須為 C1–C7，否則報錯）；`--phase` 省略時 SHALL 從資料夾名（docId）偵測 NPDS 代碼推得 phase（如 `C560` → C5）；若無法從資料夾名偵測出代碼，SHALL 報錯並要求提供 `--phase`，不得猜測或套用預設值。

#### Scenario: Ingest a folder with explicit phase
- **WHEN** 對含 `.md` 與 `images/` 的資料夾執行進料工具並提供有效的 `--project` 與 `--phase`
- **THEN** 資料夾內容被切塊、embedding 並寫入 vector store，圖片被持久化，工具回報已處理的 chunk 數

#### Scenario: Phase inferred from folder name
- **WHEN** 執行進料工具未給 `--phase`，但資料夾名含可辨識的 NPDS 代碼（如 `C560`）
- **THEN** 工具自動推得 phase（C5）並完成進料

#### Scenario: Phase cannot be inferred and is not provided
- **WHEN** 執行進料工具未給 `--phase`，且資料夾名不含可辨識的 NPDS 代碼
- **THEN** 工具拒絕進料並要求提供 `--phase`（不猜測、不套用預設值）

#### Scenario: Explicit phase out of range
- **WHEN** 執行進料工具提供的 `--phase` 不在 C1–C7
- **THEN** 工具拒絕進料並提示 `phase` 必須為 C1 至 C7

#### Scenario: Default staging directory
- **WHEN** 執行進料工具但未指定資料夾路徑
- **THEN** 工具讀取專案根目錄下 `incoming/` 的資料夾作為來源

#### Scenario: Read-only mode does not block CLI ingestion
- **WHEN** 站台以 `READ_ONLY=true` 運行，於主機執行進料工具
- **THEN** 進料正常完成（CLI 不經寫入路由，故不受唯讀阻擋）

### Requirement: Folder maps to one docId with multiple markdown files

進料工具 SHALL 以資料夾為單位，資料夾名作為 `docId`。docId SHALL NOT 受格式驗證——任何資料夾名皆可進料；以 NPDS 代碼命名僅為建議（方便自動推得 phase 與參與去重），非強制。資料夾內可含**多個 `.md`** 檔；所有 md 切出的 chunks SHALL 全部歸於同一個 docId。每個 chunk 的 `title` SHALL 記錄其來源 md 檔名，使多 md 情況下可追溯來源。重複進料同一個 docId 時 SHALL 沿用既有「先刪除該 docId 舊 chunks 再寫入新 chunks」的覆蓋行為。

#### Scenario: Multiple markdown files under one folder
- **WHEN** 資料夾 `C560/` 內含 `overview.md`、`detail.md` 兩個檔
- **THEN** 兩個 md 切出的 chunks 全部以 `docId = "C560"` 寫入，且各 chunk 的 `title` 標示其來源 md 檔名

#### Scenario: Re-ingest same folder replaces existing
- **WHEN** 對已存在的 `docId` 再次進料
- **THEN** 該 docId 的舊 chunks 先被刪除，再寫入新 chunks，且其圖片資料夾整個被替換

#### Scenario: Non-NPDS folder name still ingests
- **WHEN** 資料夾名不是 NPDS 代碼格式（如 `random_folder`）但有提供 `--phase`
- **THEN** 仍正常進料，docId = `random_folder`（不因格式被拒），只是該 docId 不參與 NPDS 代碼去重

### Requirement: Persist images and rewrite image links to absolute paths

進料工具 SHALL 將資料夾的 `images/` 複製到 `public/documents/<projectId>/<docId>/images/`，並一併保留 md 原檔於 `public/documents/<projectId>/<docId>/`。寫入 chunk 前，工具 SHALL 將 md 內的相對圖片連結（如 `![](images/x.jpg)`）改寫為以該 docId 為基底的絕對路徑 `![](/documents/<projectId>/<docId>/images/x.jpg)`，使儲存的內容一進來即為可顯示／可定位狀態。

#### Scenario: Images copied to served location
- **WHEN** 進料含 `images/fig1.jpg` 的資料夾
- **THEN** 圖片存在於 `public/documents/<projectId>/<docId>/images/fig1.jpg`，可透過 `/documents/<projectId>/<docId>/images/fig1.jpg` 存取

#### Scenario: Relative image links rewritten to absolute
- **WHEN** 某 md 含 `![](images/fig1.jpg)`
- **THEN** 寫入 vector store 的對應 chunk 內容中，該連結為 `![](/documents/<projectId>/<docId>/images/fig1.jpg)`

#### Scenario: Folder without images
- **WHEN** 資料夾不含 `images/`
- **THEN** 進料仍正常完成，僅無圖片複製與連結改寫
