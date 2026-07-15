## Why

資料夾型文件(md + 附圖 + PDF 原始檔,如 Obsidian 筆記、MinerU 轉出的成品)目前只能進料一種方式:把資料夾搬進 server 的 `incoming/`、ssh 上去跑 `node scripts/ingest-folder.js`。對日常使用太麻煩;單檔上傳早已有網頁介面,資料夾卻沒有。

## What Changes

- 網頁上傳區新增「上傳資料夾」:瀏覽器原生資料夾選取(`<input webkitdirectory>`),一次送出整個資料夾(含子資料夾的圖檔)。
- 新增 API `POST /api/upload/folder`(唯讀模式 403):接收多檔 + 各檔相對路徑,在暫存區重建資料夾結構後走**既有** `ingestFolder`(docId=資料夾名、須恰好一個 PDF、多 md、wiki-link 圖解析、整夾持久化、重灌替換 — 規則全沿用)。
- phase:沿用現有下拉選擇;未選時嘗試從資料夾名的 NPDS 代碼推(`phaseFromFolderName`),推不出回 400 要求選擇。
- 相對路徑防護:拒絕 `..`/絕對路徑;中文資料夾/檔名沿用 `fixLatin1Mojibake` 修復。
- 上傳檢查(使用者指定):(a) 前端選完資料夾立即驗(恰好一個頂層 PDF、至少一個頂層 md),不合格不上傳;(b) 檔案類型白名單(md/pdf/圖),含不合法檔案「直接報錯」列出檔名,前後端皆驗;(c) 同名 docId 已存在 → 前端跳覆蓋確認,後端未帶 overwrite 旗標回 409。
- CLI 腳本保留(批次/自動化仍可用)。

## Capabilities

### New Capabilities

(無)

### Modified Capabilities

- `document-ingestion`: 新增「網頁上傳資料夾進料」需求(ADDED;複用 folder 進料既有規則)。
- `chat-ui`: 新增「上傳區支援資料夾選取」需求(ADDED;READ_ONLY 隱藏沿用上傳區既有行為)。

## Impact

- `src/routes/upload.js`(或新 route 檔):`POST /api/upload/folder`,multer 多檔 + paths 欄位、暫存重建、呼叫 `ingestFolder`、完成後清理暫存。
- `public/index.html`:上傳區加資料夾選取入口與結果顯示。
- 測試:route 層(temp docsRoot + temp DB + mock LLM)— 路徑防護、PDF 必要、成功進料、READ_ONLY 403。
- 驗收:瀏覽器選一個 md+images+pdf 資料夾上傳,文件樹出現、來源可看圖、可下載 PDF。
