## Why

目前上傳介面只接受 `.md` / `.markdown`（直接 ingest）與 `.pdf`（經 MinerU 轉換）。但 NPDS 相關文件常以 Word、Excel、PowerPoint、HTML 等格式存在，使用者必須先手動轉成 Markdown 或 PDF 才能上傳，增加操作摩擦。Microsoft 的 [markitdown](https://github.com/microsoft/markitdown) 可將多種常見文件格式轉為 Markdown，整合後即可讓使用者直接上傳這些原始檔案。

## What Changes

- 上傳路由新增接受 markitdown 支援的文件格式：`.docx`、`.pptx`、`.xlsx`、`.xls`、`.html`、`.htm`、`.csv`、`.json`、`.xml`、`.epub`
- 這些格式上傳後，伺服器於 `markitdown` conda 環境中以 `markitdown "<檔案>" -o "<輸出.md>"` 轉換為 Markdown，再走現有 ingest 流程（chunking → embedding → 儲存）
- `.pdf` 維持由 MinerU 轉換（版面與 OCR 品質較佳），不改用 markitdown
- `.md` / `.markdown` 維持直接 ingest
- 轉換進度透過既有的 SSE 串流回前端；轉換失敗回傳明確錯誤
- 非以上副檔名的檔案仍回傳 400

## Capabilities

### New Capabilities

無

### Modified Capabilities

- `document-ingestion`：上傳檔案格式從「Markdown + PDF」擴展為「Markdown + PDF + markitdown 支援的文件格式」；新增格式須經 markitdown 轉換後再 ingest

## Impact

- `src/routes/upload.js`：擴展副檔名驗證、新增 markitdown shell 呼叫邏輯
- `public/`（前端上傳頁）：`<input>` 的 accept 與提示文字更新以涵蓋新格式
- 伺服器環境需安裝 markitdown（conda 環境 `markitdown`，`pip install 'markitdown[all]'`）
- 無 API 介面變更（request / response 結構不變）
- 無資料庫 schema 異動
