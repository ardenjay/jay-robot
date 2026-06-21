## 1. Upload — 保存原始檔案

- [x] 1.1 在 `src/routes/upload.js` 的成功路徑中，將原始上傳檔（`req.file.path`）複製至 `public/documents/<projectId>/<originalname>`（需先 `fs.mkdirSync` 確保目錄存在）
- [x] 1.2 移除 `finally` 中對 `req.file.path` 的 `fs.unlinkSync`（原始檔已移至 public/documents，multer 暫存位置可保留讓 Node.js 自動 GC 或手動清除）

## 2. Retrieval — sources 改為文件物件

- [x] 2.1 在 `src/services/retrieval.js` 中，將 sources 從 `[...new Set(chunks.map(c => c.title))]` 改為以 `docId` 去重的物件陣列：`[...new Map(chunks.map(c => [c.docId, {docId: c.docId, url: `/documents/${projectId}/${encodeURIComponent(c.docId)}`}])).values()]`（`projectId` 直接取 `answer()` 的參數）
- [x] 2.2 確認 LLM 無法回答時仍送出空陣列（現有邏輯不變，確認與新格式相容）

## 3. Frontend — 來源改為超連結

- [x] 3.1 在 `public/index.html` 的 sources 渲染邏輯中，將 `<li>` 純文字改為 `<li><a href="${s.url}" target="_blank" rel="noopener">${s.docId}</a></li>`
