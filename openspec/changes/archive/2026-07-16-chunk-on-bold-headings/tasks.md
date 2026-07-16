## 1. 實作

- [x] 1.1 `parseAndChunk`：偵測「整段皆為粗體」的 paragraph token(單行、`^\*\*...\*\*$`),比照 heading 處理——flush 前一 chunk、去除 `**` 後作為標題壓入 headingStack(深度設為比一般 `#` 更深,如 depth 99,附加於現有路徑之下)
- [x] 1.2 僅整段粗體才觸發;行內部分粗體不觸發

## 2. 單元測試

- [x] 2.1 `tests/ingestion.test.js`(或對應)：`**Q1: ...**`／`**Q2：...**` 各自成獨立 chunk,title 為該粗體文字
- [x] 2.2 行內粗體(段落非整段粗體)不切塊
- [x] 2.3 既有 `#` 標題行為不變(回歸)
- [x] 2.4 `npm test` 全綠

## 3. 真實資料驗證

- [x] 3.1 重灌 FAQ.md 走正常 ingestFile 路徑(不預處理),確認切成每 Q&A 一 chunk
- [x] 3.2 6 題 FAQ 依賴 knownFail 轉綠(FSYNC engine/GPIO/I2C speed/MAX20086/I2C 共用/V4L2)
- [x] 3.3 移除該 6 題的 knownFail 標記
