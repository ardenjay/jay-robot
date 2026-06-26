## ADDED Requirements

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
