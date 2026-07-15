## Why

docId = 檔名,且 FTS v3 起檔名參與關鍵字檢索 — 含糊的檔名(「C208 DataSheet」)會直接拖累檢索命中率。目前想改名只能刪除重傳(重跑轉換/embedding),太重;需要就地改名。

## What Changes

- 後端新增 `PATCH /api/projects/:id/documents/:docId/rename`(body `{newDocId}`,唯讀 403):一次交易更新 DB chunks 的 `doc_id` 與該文件的 FTS 索引列(content_seg 含檔名,必須重算),並 `fs.rename` 持久化檔案/資料夾(檔案型與目錄型皆支援;磁碟來源不存在時僅更新 DB,不報錯)。
- 驗證:newDocId 非空、不含 `/ \` 與 `..`(路徑穿越)、與既有 docId 重複回 409。
- Vector adapter 新增 `renameDocument(projectId, oldDocId, newDocId)`。
- 前端文件樹:檔名旁加改名入口(✏️,與既有刪除/搬階段同排,READ_ONLY 隱藏),prompt 預填舊名(含副檔名,由使用者全權輸入新名),成功後刷新樹。
- embedding 不含檔名 → 改名**不需** reembed、不需重灌。

## Capabilities

### New Capabilities

(無)

### Modified Capabilities

- `document-management`: 新增「文件改名」需求(ADDED)。
- `vector-adapter`: 新增「renameDocument 交易性更新 chunks 與 FTS」需求(ADDED)。

## Impact

- `src/adapters/vector/sqlite.js`:`renameDocument`(transaction:chunks UPDATE + 該批 FTS delete/insert)。
- `src/routes/projects.js`:rename 路由 + 持久化 fs.rename(檔案型/目錄型)。
- `public/index.html`:文件樹改名入口。
- 測試:adapter(改名後新名可搜、舊名搜不到)、route(成功/409/400/403/持久化跟著改)。
