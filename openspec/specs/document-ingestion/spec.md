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
系統 SHALL 依 `#`、`##`、`###` 標題將 Markdown 文件切割成語意 chunks;每個 chunk 的 `title` SHALL 為其所屬的完整章節路徑(自最上層標題至最近標題,以「 › 」串接),切塊時依標題深度維護階層堆疊(遇同層或較淺標題即截斷堆疊)。

此外,系統 SHALL 把「整段內容皆為粗體」的段落(單行且整行以 `**...**` 包裹,如 `**Q1: ...**`、`**Power Supply**`)視為一個標題邊界:遇到時先 flush 前一 chunk,再以該粗體文字(去除 `**`)作為新章節標題壓入階層堆疊。此舉修正「文件用粗體充當段落標題、無 `#` 標題」時被整份視為無標題而按長度硬切、多主題混入單一 chunk 導致召回稀釋的問題。粗體標題 SHALL 視為比任何 `#` 標題更深的一層(不覆蓋既有 `#` 章節路徑,而是附加於其下)。僅含行內部分粗體(非整段粗體)的段落 SHALL NOT 觸發此切塊。

#### Scenario: Document with multiple headings
- **WHEN** Markdown 文件包含多個標題
- **THEN** 每個標題與其下方內容形成一個獨立 chunk

#### Scenario: Nested headings produce a section path
- **WHEN** 內容位於「# 介面 > ## 通訊 > ### CAN」之下
- **THEN** 該 chunk 的 `title` 為「介面 › 通訊 › CAN」

#### Scenario: Sibling heading truncates the stack
- **WHEN** 「### CAN」之後出現同層「### UART」,其後再出現上層「## 電源」
- **THEN** UART 段的 title 為「介面 › 通訊 › UART」,電源段的 title 為「介面 › 電源」

#### Scenario: Document without headings
- **WHEN** Markdown 文件沒有任何標題
- **THEN** 整份文件作為一個 chunk,`title` 為檔案名稱

#### Scenario: Bold-only line acts as a heading boundary
- **WHEN** Markdown 文件用整段粗體充當段落標題(如 FAQ 的 `**Q1: ...**`、`**Q2：...**`)而無 `#` 標題
- **THEN** 每個粗體標題與其下方內容形成一個獨立 chunk(而非整份按長度硬切成多主題混雜的 chunk),各 chunk 的 title 為該粗體文字

#### Scenario: Inline bold does not trigger splitting
- **WHEN** 某段落只含行內部分粗體(如「本板用 **MAX96712** 做轉換」),而非整段皆為粗體
- **THEN** 不因該行內粗體而切塊,該段落沿用當前章節路徑

#### Scenario: Chunk exceeds 1500 characters
- **WHEN** 單一 chunk 超過 1500 字
- **THEN** 系統以段落為單位進一步切割,確保每個 chunk 不超過 1500 字,各子塊沿用同一章節路徑 title


### Requirement: Embed and store chunks
系統 SHALL 將 chunks 透過 Embedding API 轉換為向量,並連同原始文字、標題、文件 ID 一起儲存至 vector store;embedding 的輸入文本 SHALL 為「title + 換行 + 內文」(標題脈絡參與語意比對),儲存的 `content` 欄位 SHALL 維持純內文。為降低 API 請求數與速率限制(429)風險,系統 SHALL 以**批次方式**產生 embedding(每批多個 chunk 一次送出),而非每個 chunk 各發一次請求。

#### Scenario: Embedding input includes the section path
- **WHEN** chunk title 為「介面 › 通訊 › CAN」、內文為規格表
- **THEN** 送給 embedding API 的文本以「介面 › 通訊 › CAN」開頭、換行後接內文;DB 的 `content` 僅存內文

#### Scenario: Re-embed migration uses the same input rule
- **WHEN** 執行 `scripts/reembed.js` 對既有 chunks 重算向量(免重灌文件的遷移路徑)
- **THEN** embed 輸入同為「title + 換行 + 內文」,與進料規則一致;執行前自動備份 DB

#### Scenario: Batch embedding and storage
- **WHEN** 一份文件被切成多個 chunks 並進行 embedding
- **THEN** 系統分批呼叫批次 embedding(每批多筆),取得的向量與各 chunk 的 metadata 一同寫入 SQLite

#### Scenario: Embedding API rate limit hit
- **WHEN** Embedding API 回傳速率限制錯誤(429)
- **THEN** 系統重試該批請求;若回應含建議等待時間(`retryDelay`)則依其等待,否則採指數退避,達重試上限後才視為失敗

#### Scenario: Large document does not exhaust per-request rate limit
- **WHEN** 上傳頁數很多、chunks 數量龐大的文件
- **THEN** 因採批次 embedding,API 請求數遠少於 chunk 數,顯著降低觸發 429 的機率

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

### Requirement: Folder ingestion requires and persists a PDF original

資料夾進料時，資料夾 SHALL 含**恰好一個 `.pdf`** 作為原始檔。folder 進料專為「在 PC 上以 mineru 處理 PDF」設計，故原始檔即 PDF；其他文件格式（docx/pptx/xlsx/html…）走 web 上傳 + markitdown，不經此路。CLI SHALL 在進料前驗證資料夾頂層的 `.pdf` 數量：0 → 報錯（需放入一個 PDF）；多於一個 → 報錯（需恰好一個）；皆為非零退出，不得猜測。該 `.pdf` SHALL 與 md、images 一併持久化至 `public/documents/<projectId>/<docId>/`，供後續下載。mineru 夾帶的 `_content_list.json`、`_middle.json` 等側生檔因不是 `.pdf`，不影響判定。

#### Scenario: Folder with exactly one PDF is accepted
- **WHEN** 資料夾含一個 `.pdf`（及 `.md`、`images/`，可含 mineru 側生檔）並執行進料
- **THEN** 進料成功，該 `.pdf` 被持久化到 `public/documents/<projectId>/<docId>/`

#### Scenario: Folder missing a PDF is rejected
- **WHEN** 資料夾只有 `.md` 與 `images/`，沒有任何 `.pdf`
- **THEN** CLI 報錯並拒絕進料（非零退出），提示需放入一個 PDF

#### Scenario: Folder with multiple PDFs is rejected
- **WHEN** 資料夾含多於一個 `.pdf`
- **THEN** CLI 報錯並拒絕進料（非零退出），提示 PDF 需恰好一個

### Requirement: Obsidian wiki-link images are rewritten to absolute paths

圖片連結改寫 SHALL 支援 Obsidian wiki-link 語法：`![[檔名]]` 與 `![[檔名|替代文字]]`。改寫時 SHALL 在進料資料夾內（含任意層子資料夾）尋找該檔名對應的檔案，並將 wiki-link 改寫為標準 Markdown 絕對路徑 `![](/documents/<projectId>/<docId>/<實際相對子路徑>)`，路徑各段 SHALL 做 URL 編碼（含空格的檔名與子資料夾名可正確解析）。若資料夾內找不到該檔名的檔案，該 wiki-link SHALL 保留原樣，不得杜撰路徑。既有的標準 Markdown 相對連結（`![](images/...)`）改寫行為 SHALL 維持不變，兩種語法可在同一份 md 中混用。

#### Scenario: Wiki-link image in a note-named subfolder
- **WHEN** md 含 `![[Thor CB Fig1-1 Block Diagram.jpg]]`，且該檔位於子資料夾 `Thor Carrier Board/`
- **THEN** 寫入 chunk 的內容中該連結為 `![](/documents/<proj>/<docId>/Thor%20Carrier%20Board/Thor%20CB%20Fig1-1%20Block%20Diagram.jpg)`（標準語法、URL 編碼）

#### Scenario: Wiki-link with alt text
- **WHEN** md 含 `![[fig.jpg|方塊圖]]`，且 `fig.jpg` 存在於資料夾內
- **THEN** 改寫為標準 Markdown 圖片語法並指向該檔的絕對路徑（alt 部分不影響路徑解析）

#### Scenario: Wiki-link target not found is left as-is
- **WHEN** md 含 `![[missing.jpg]]`，但資料夾內（含子資料夾）沒有該檔
- **THEN** 該 wiki-link 保留原樣，不改寫、不杜撰路徑

#### Scenario: Standard and wiki-link syntax coexist
- **WHEN** 同一份 md 同時含 `![](images/a.jpg)` 與 `![[b.jpg]]`（兩檔皆存在）
- **THEN** 兩者皆被改寫為各自的標準絕對路徑，互不影響

### Requirement: Source viewer resolves wiki-link images from the persisted folder

來源檢視器讀取持久化 md 時，SHALL 對 Obsidian wiki-link 套用同樣的改寫（以持久化資料夾內的實際檔案位置解析），使含 wiki-link 的文件在檢視器中能顯示圖片。

#### Scenario: Viewer shows wiki-link images
- **WHEN** 使用者點開一個含 `![[...]]` 圖語法的 folder 文件來源
- **THEN** 檢視器渲染出對應圖片（wiki-link 已被解析為持久化位置的絕對路徑）

### Requirement: Non-ASCII upload filenames are decoded correctly
Web 上傳時系統 SHALL 修復 multer 對 filename 的 latin1 誤解碼:於 storage filename callback 以 latin1→UTF-8 還原 `originalname` 並就地改寫,使 docId、暫存檔名、持久化檔名、下載與顯示皆為正確 UTF-8。還原 SHALL 具防呆:純 ASCII 檔名不受影響;已為正確 UTF-8 的字串(含任何 > U+00FF 字元)SHALL NOT 被二次轉換;還原結果含 U+FFFD 時 SHALL 保留原字串。

#### Scenario: 中文檔名還原
- **WHEN** 上傳「Jetson T5000 vs T4000 規格比較.md」(multer 解出 mojibake)
- **THEN** docId、文件樹、來源顯示與下載檔名皆為「Jetson T5000 vs T4000 規格比較.md」

#### Scenario: 全形符號還原
- **WHEN** 上傳檔名含全形底線 ＿(先前實例 C315 Sensing＿PO)
- **THEN** 儲存後檔名保留 ＿,不再出現 ï¼¿

#### Scenario: 純 ASCII 檔名零影響
- **WHEN** 上傳「report_v2.pdf」
- **THEN** 檔名逐 byte 不變

#### Scenario: 已正確的 UTF-8 不被二次轉換
- **WHEN** `fixLatin1Mojibake` 收到已是正確中文的字串(含 > U+00FF 字元)
- **THEN** 原樣回傳,不做 latin1 轉換(避免產生 U+FFFD/亂碼)

### Requirement: Ingest a folder via web upload
系統 SHALL 提供 `POST /api/upload/folder` 接收整個資料夾(多檔 multipart `files` + 同序相對路徑欄位 `paths`),檔案副檔名 SHALL 限白名單(md/pdf/常見圖檔),違規即整批 400 並列出檔名;同名 docId 已存在且未帶 `overwrite=true` SHALL 回 409;於暫存區重建目錄結構後以既有 `ingestFolder` 進料 — docId = 資料夾名、頂層須恰好一個 PDF、至少一個 md、子資料夾(附件圖)結構保留、重灌同 docId 整夾替換,規則與 CLI 進料完全一致。phase 取自請求欄位,未提供時 SHALL 嘗試由資料夾名的 NPDS 代碼推得,皆無則回 400。唯讀模式 SHALL 回 403。完成後暫存 SHALL 清理。

#### Scenario: 成功進料
- **WHEN** 上傳含 `note.md`、`doc.pdf`、`附件/圖.jpg` 的資料夾「C208 SoC Data Sheet」
- **THEN** 回 200 與 `{docId, mdCount, chunkCount, imageCount}`;文件樹出現該 docId(phase 由名稱推得 C2),來源檢視可顯圖、可下載 PDF

#### Scenario: 缺 PDF 拒收
- **WHEN** 上傳的資料夾頂層沒有 PDF
- **THEN** 回 400 並附「資料夾需含一個 PDF 原始檔」訊息,不留任何持久化殘留

#### Scenario: 路徑穿越擋下
- **WHEN** `paths` 含 `../evil.md` 或絕對路徑
- **THEN** 整批回 400,不寫入任何檔案

#### Scenario: phase 無法解析
- **WHEN** 未選 phase 且資料夾名無 NPDS 代碼
- **THEN** 回 400 要求選擇階段

#### Scenario: 唯讀模式
- **WHEN** `READ_ONLY=1` 時呼叫 `POST /api/upload/folder`
- **THEN** 回 403

#### Scenario: 中文資料夾名
- **WHEN** 上傳資料夾名為中文(multipart 欄位可能被 latin1 誤解)
- **THEN** docId 與持久化路徑為正確 UTF-8(沿用 fixLatin1Mojibake)

#### Scenario: 不合法檔案直接報錯
- **WHEN** 資料夾內含 `.DS_Store` 或 `notes.txt` 等白名單外的檔案
- **THEN** 回 400 並列出不合法檔名,整批不進料

#### Scenario: 同名 docId 覆蓋確認
- **WHEN** 上傳的資料夾名與既有 docId 相同且未帶 `overwrite=true`
- **THEN** 回 409 與該 docId;帶 `overwrite=true` 重送則整夾替換(沿用重灌語意)

### Requirement: Strip known auto-generated boilerplate before chunking
系統 SHALL 在 `parseAndChunk` 切塊前，從 Markdown 內容中移除已知的自動生成樣板文字（如 Word 對未手動撰寫替代文字的圖片自動產生、markitdown 轉檔時原樣保留的免責聲明「AI 產生的內容可能不正確」），避免此類重複出現的樣板文字污染 chunk 內容、進而灌高 BM25 詞頻或影響 embedding。清理 SHALL 僅移除已確認的樣板字串本身，不影響圖片語法或其他正文內容。

#### Scenario: docx 轉檔的圖片 alt-text 含免責聲明
- **WHEN** Markdown 內容中的圖片 alt-text 含「AI 產生的內容可能不正確」
- **THEN** 該字串（含前後可能的空白與句點）被移除，chunk 內容不再包含此字串，圖片語法（`![](...)`）本身保留

#### Scenario: 同一 chunk 含多張圖片、多次出現樣板文字
- **WHEN** 單一 chunk 因含多張圖片而重複出現該樣板文字多次
- **THEN** 每一次出現都被移除，不殘留任何一次

#### Scenario: 正文與其他描述文字不受影響
- **WHEN** 圖片 alt-text 除樣板文字外還有其他描述（如「一張含有 文字, 數字, 字型的圖片」），或該 chunk 含有與樣板文字無關的其他正文
- **THEN** 這些內容維持原樣，不被移除或改寫

### Requirement: Sidecar per-row index for large tables
切塊時,系統 SHALL 對「body 列數超過 `MIN_TABLE_ROWS`」的表格(HTML `<table>` 或 markdown pipe 表)**額外**抽出每一 body 列,寫入獨立的 `table_rows` 儲存(每列內容 = 表頭欄名 + 該列儲存格,title = 章節路徑,自帶 embedding)。主 chunk 的切塊行為 SHALL 完全不變(整張表仍留在所屬段落 chunk 內);`table_rows` SHALL NOT 進入主 chunks 表或 FTS 索引。重灌文件(`clear`)時 SHALL 同步清除該文件的 `table_rows`。

#### Scenario: Dense spec table emits sidecar rows
- **WHEN** 文件含 body 列數 > 門檻的規格表(如 MTi §6.2 尺寸/重量/IP)
- **THEN** 每列(如「Weight … 8.9 gram」)各成一筆 `table_rows`,主 chunk 內容與數量與未啟用此功能時相同

#### Scenario: Small table emits nothing
- **WHEN** 表格 body 列數 ≤ 門檻
- **THEN** 不產生任何 `table_rows`,行為與現狀完全一致

#### Scenario: Re-ingest replaces sidecar rows
- **WHEN** 同一 docId 重新進料
- **THEN** 舊的 `table_rows` 被清除,不殘留

### Requirement: Per-document sidecar version stamping
系統 SHALL 以 `doc_ingest_meta(project_id, doc_id, sidecar_version)` 記錄每份文件的 sidecar 處理版本。正常進料（`ingestFile`/`ingestFolder`）完成 SHALL 蓋上目前的 `SIDECAR_VERSION`（包含該文件沒有大表、產出 0 列的情況）。文件改名 SHALL 同步改 meta；文件刪除 SHALL 同步刪 meta。

#### Scenario: Fresh ingestion stamps the current version
- **WHEN** 一份文件正常進料完成
- **THEN** 該文件的 `sidecar_version` 為目前程式碼的 `SIDECAR_VERSION`，啟動回填不再處理它

#### Scenario: Doc without large tables is also stamped
- **WHEN** 進料的文件沒有任何超過門檻的表格（0 sidecar 列）
- **THEN** 仍蓋版本戳（語意為「已按此版本處理」），不會每次啟動被重掃

### Requirement: Startup background backfill of table_rows
服務啟動後，系統 SHALL 以不阻塞啟動的背景任務掃描 `sidecar_version` 低於 `SIDECAR_VERSION` 的文件，對每份：從 `public/documents/<project>/<docId>` 取得原始 `.md` → `extractTableRows` → embedding → 先清除該文件既有 `table_rows` 再寫入 → 蓋版本戳。處理 SHALL 逐文件完成並逐文件蓋戳（冪等，中斷後下次啟動續跑）。回填 SHALL NOT 修改 chunks 或 FTS（純加法）。

#### Scenario: Prod server self-upgrades after git pull
- **WHEN** 正式機更新程式碼後重啟，DB 內既有文件從未回填且原始 .md 在 public/documents
- **THEN** 服務立即可用（行為與回填前相同），背景任務逐文件填 `table_rows` 並蓋戳，填完的文件其表格列注入開始生效

#### Scenario: Interrupted backfill resumes
- **WHEN** 回填進行到一半程序重啟
- **THEN** 已蓋戳文件不重做，下次啟動從未蓋戳的文件繼續

#### Scenario: Ollama unavailable degrades gracefully
- **WHEN** 背景回填時 embedding 服務不可用或失敗
- **THEN** 記 log 後放棄本輪，服務不受影響、不重試迴圈；下次啟動自動再試

#### Scenario: Non-markdown source is skipped with a log
- **WHEN** 某文件在 public/documents 的已存原始檔不是 `.md`（如單檔上傳的 .docx/.pdf）
- **THEN** 跳過該文件（不蓋戳）並記一行 log 列明，不觸發轉檔

#### Scenario: Main index untouched
- **WHEN** 任一文件完成回填
- **THEN** 該文件的 chunks 與 FTS 內容與回填前完全相同（不重切、不重嵌）
