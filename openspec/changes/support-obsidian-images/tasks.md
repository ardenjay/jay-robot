## 1. imageLinks 擴充

- [x] 1.1 `src/services/imageLinks.js` 新增 `buildFileIndex(folderPath)`：遞迴掃描資料夾（略過 `.md`），回傳 `Map<檔名, 相對子路徑>`；同名檔取排序後第一個
- [x] 1.2 `rewriteImageLinks(markdown, projectId, docId, fileIndex?)` 新增 wiki-link 規則：`![[name]]` / `![[name|alt]]` → 查 `fileIndex` 命中則改寫為 `![](<base>/<逐段 URL 編碼的相對子路徑>)`；未命中或未傳 `fileIndex` → 保留原樣
- [x] 1.3 標準 `![](images/...)` 規則行為不變，與 wiki-link 可混用

## 2. 呼叫端接上索引

- [x] 2.1 `src/services/ingestion.js`：`chunkFolderMarkdown` 對來源資料夾建一次 `fileIndex`，傳給 `rewriteImageLinks`
- [x] 2.2 `src/services/docView.js`：`resolveDocView` 目錄型分支對持久化資料夾建 `fileIndex` 並套用改寫（舊資料檢視器即刻受益）

## 3. 測試

- [x] 3.1 `rewriteImageLinks` 單元測：wiki-link 基本型、`|alt` 變體、含空格檔名/子資料夾（驗證逐段 URL 編碼）、未命中保留原樣、未傳 fileIndex 保留原樣、與標準語法混用
- [x] 3.2 `buildFileIndex` 測：遞迴子資料夾、略過 md、同名取第一
- [x] 3.3 `ingestFolder` 整合測：Obsidian 風格 temp 資料夾（md 用 wiki-link + 圖在筆記同名子資料夾）→ chunk 內為標準絕對連結（temp DB + mock LLM，不碰真實資料）
- [x] 3.4 `resolveDocView` 測：持久化資料夾含 wiki-link md → 回傳的 markdown 已解析為絕對連結
- [x] 3.5 `npm test` 全綠

## 4. 驗收

- [x] 4.1 重灌 `C208 SoC Data Sheet` 資料夾後，瀏覽器確認：來源檢視器顯示 7 張圖；答案引用該圖時亦可顯示（留給使用者）
