## ADDED Requirements

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
