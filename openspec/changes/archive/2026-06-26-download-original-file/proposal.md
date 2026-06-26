## Why

左側文件樹目前只能檢視/刪除/搬移文件，無法下載。使用者（含唯讀站台的訪客）常需要把「原始文件」整份拿走。關鍵洞見：對 folder 進料的文件，`md`/`images` 只是 RAG 的副產品，**原始檔（PDF 等）才是文件本身**——因此下載統一成「給原始檔」，不必打包 md+images。

## What Changes

- **進料約定（folder）**：資料夾 SHALL 含**恰好一個 `.pdf`**（folder 進料專為 mineru 處理 PDF 而生；其他格式走 web 上傳 + markitdown，不走此路）。CLI 找不到 `.pdf` 或找到多於一個 → 報錯拒收。持久化時 `.pdf` 一併複製（最簡單＝整個資料夾原樣複製到 `public/documents/<proj>/<docId>/`）；mineru 夾帶的 `_content_list.json` 等側生檔因不是 `.pdf`，自然不被當原始檔。
- **下載端點**：新增 `GET /api/projects/:id/documents/:docId/download`。
  - 檔案型 docId（web 上傳，docId 即檔名）→ 回該檔。
  - 目錄型 docId（folder 進料）→ 回資料夾內的 `.pdf`。
  - 以 `Content-Disposition: attachment` 觸發瀏覽器下載，檔名為原始檔名。GET 讀取路由，**不受唯讀模式阻擋**。
- **doc tree UI**：**點擊文件名稱**即下載原始檔（名稱有可點擊提示）。唯讀模式下**仍可用**（下載是讀取，與刪除/搬移寫入操作不同）。

不改 RAG 與來源檢視器邏輯。

## Capabilities

### New Capabilities
<!-- 無 -->

### Modified Capabilities
- `document-ingestion`: folder 進料新增「必含恰好一個 `.pdf` 原始檔並一併持久化」的需求。
- `document-management`: 新增「下載原始檔端點」與「文件樹下載按鈕（唯讀仍顯示）」需求。

## Impact

- **修改** `scripts/ingest-folder.js` / `src/services/ingestion.js`：進料前驗證資料夾含恰好一個 `.pdf`；持久化整夾複製（含該 `.pdf`）。
- **新增後端** `GET /api/projects/:id/documents/:docId/download`（找出原始檔、`Content-Disposition` 串流）。
- **修改前端** `public/index.html`：doc tree 每個 file 加 ⬇ 下載鈕，唯讀模式顯示。
- **資料影響**：現有未含原始檔的舊資料（如 `C204 MTi 600`）在新規則下需重灌補上 PDF，否則下載回 404。
- **無 breaking change（web 路徑）**：web 上傳的單檔文件下載 = 直接給該檔，行為直觀。
