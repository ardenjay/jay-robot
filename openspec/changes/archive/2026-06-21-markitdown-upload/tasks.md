## 1. 環境準備

- [x] 1.1 建立 conda 環境 `markitdown`：`conda create -n markitdown python=3.10 -y`
- [x] 1.2 在環境中安裝 markitdown：`conda run -n markitdown pip install 'markitdown[all]'`
- [x] 1.3 驗證可執行：`conda run -n markitdown markitdown --help`

## 2. Upload 路由更新

- [x] 2.1 在 `src/routes/upload.js` 定義 markitdown 支援副檔名常數清單（`.docx`、`.pptx`、`.xlsx`、`.xls`、`.html`、`.htm`、`.csv`、`.json`、`.xml`、`.epub`）
- [x] 2.2 擴展副檔名驗證：接受 `.md` / `.markdown` / `.pdf` 與 markitdown 清單，其餘回傳 400 並更新錯誤訊息
- [x] 2.3 實作 `convertWithMarkitdown(filePath, onLog)`：以 `spawn('conda', ['run', '--no-capture-output', '-n', 'markitdown', 'markitdown', filePath, '-o', outMdPath])` 轉換，輸出寫入臨時目錄的單一 `.md`，回傳該路徑（介面對齊既有 `convertPdfToMarkdown`）
- [x] 2.4 在上傳主流程依副檔名分流：`.pdf` → `convertPdfToMarkdown`、markitdown 清單 → `convertWithMarkitdown`、`.md`/`.markdown` → 直接使用原檔；取得 `.md` 路徑後送進現有 `ingestFile`
- [x] 2.5 沿用 SSE：轉換期間以 `send({ type: 'log', ... })` 串流，失敗以 `send({ type: 'error', ... })` 回報
- [x] 2.6 確保轉換完成後（成功或失敗）清除原始上傳檔與臨時輸出目錄

## 3. 前端更新

- [x] 3.1 更新上傳表單 `<input>` 的 `accept` 屬性，加入新支援副檔名
- [x] 3.2 更新上傳區的說明/提示文字，列出支援的格式

## 4. 驗收

- [x] 4.1 啟動 `npm start`，上傳一個 `.docx`，確認回傳 HTTP 200 及 chunk 數量，且 Markdown 內容合理
- [x] 4.2 再上傳一個 `.xlsx` 或 `.html`，確認轉換與 ingest 成功
- [x] 4.3 確認 `.pdf` 仍走 MinerU、`.md` 仍直接 ingest，皆正常
- [x] 4.4 確認 markitdown 失敗時（如刻意指定錯誤環境名稱）回傳 HTTP 500 及錯誤訊息
- [x] 4.5 確認上傳不支援副檔名仍回傳 HTTP 400
- [x] 4.6 確認原始檔案已複製到 `public/documents/<projectId>/<originalname>`
- [x] 4.7 執行 `npm test`，確認現有測試全部通過
