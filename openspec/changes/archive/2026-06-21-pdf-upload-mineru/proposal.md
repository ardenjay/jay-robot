## Why

目前上傳介面只接受 `.md` / `.markdown` 檔案，但 NPDS 文件大多以 PDF 格式存在，使用者必須手動轉檔才能上傳，增加操作摩擦。透過整合 MinerU，系統可在伺服器端自動將 PDF 轉為 Markdown，讓使用者直接上傳原始 PDF。

## What Changes

- 上傳路由接受 `.pdf` 副檔名
- PDF 上傳後，伺服器以 `mineru -p "<檔案>.pdf" -o "<輸出目錄>"` 轉換為 Markdown（於 `mineru` conda 環境中執行）
- 轉換完成後，讀取輸出的 `.md` 檔案並走現有的 ingest 流程（chunking → embedding → 儲存）
- 非 `.md` / `.markdown` / `.pdf` 的檔案仍回傳 400

## Capabilities

### New Capabilities

無

### Modified Capabilities

- `document-ingestion`：上傳檔案格式從僅接受 Markdown 擴展為同時接受 PDF；PDF 須經 MinerU 轉換後再 ingest

## Impact

- `src/routes/upload.js`：擴展副檔名驗證、新增 MinerU shell 呼叫邏輯
- 伺服器環境需安裝 MinerU（conda 環境 `mineru`）
- 無 API 介面變更（request / response 結構不變）
- 無資料庫 schema 異動
