## Why

來源引用目前只顯示 chunk 標題文字，使用者無法直接查看原始文件。將上傳的原始檔案保存下來並提供可點擊連結，讓使用者能一鍵在瀏覽器開啟來源文件，確認 LLM 的引用是否正確。

## What Changes

- `src/routes/upload.js`：上傳成功後，將原始檔案（.md 或 .pdf）複製至 `public/documents/<filename>`，不再於 finally 刪除原始檔
- `src/services/retrieval.js`：`sources` 改為物件陣列 `[{docId, url}]`，以文件為單位去重（非 chunk title），url 為 `/documents/<docId>`
- `public/index.html`：來源列表改為可點擊的 `<a target="_blank">` 連結

## Capabilities

### New Capabilities

無

### Modified Capabilities

- `document-ingestion`：上傳流程新增「保存原始檔案至 public/documents/」步驟
- `rag-query`：sources 事件的值從 `string[]`（chunk title）改為 `{docId: string, url: string}[]`（文件層級）
- `chat-ui`：來源區塊改為超連結列表

## Impact

- `src/routes/upload.js`：新增 `fs.copyFileSync` 至 `public/documents/`；`finally` 不再刪除原始上傳檔
- `src/services/retrieval.js`：sources 物件結構變更（breaking change for any future API consumers）
- `public/index.html`：sources 渲染邏輯需改為 `<a>` tag
- `express.static` 已服務 `public/`，無需新增路由
- 刪除文件時 `public/documents/` 的對應檔案目前不會自動刪除（屬後續增強）
