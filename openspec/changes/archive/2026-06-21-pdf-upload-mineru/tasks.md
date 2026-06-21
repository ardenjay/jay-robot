## 1. Upload 路由更新

- [x] 1.1 在 `src/routes/upload.js` 的副檔名驗證中加入 `.pdf`，允許 PDF 上傳
- [x] 1.2 實作 `convertPdfToMarkdown(pdfPath)` 函式：以 `child_process.exec()` 執行 `conda run -n mineru mineru -p "<pdfPath>" -o "<tmpDir>"`，回傳輸出的 `.md` 檔案路徑
- [x] 1.3 遞迴搜尋 MinerU 輸出目錄，找到第一個 `.md` 檔案並回傳其路徑
- [x] 1.4 在上傳路由中，若副檔名為 `.pdf`，呼叫 `convertPdfToMarkdown`，取得 `.md` 路徑後送進現有 `ingestFile` 流程
- [x] 1.5 確保轉換完成後（無論成功或失敗）清除原始 PDF 與 MinerU 臨時輸出目錄

## 2. 驗收

- [ ] 2.1 啟動 `npm start`，上傳一個 PDF 檔案，確認回傳 HTTP 200 及 chunk 數量
- [ ] 2.2 確認 MinerU 失敗時（如刻意指定錯誤環境名稱）回傳 HTTP 500 及錯誤訊息
- [ ] 2.3 確認上傳非 `.md` / `.markdown` / `.pdf` 檔案仍回傳 HTTP 400
- [x] 2.4 執行 `npm test`，確認現有 8 個測試仍全部通過
