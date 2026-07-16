## 1. 實作

- [x] 1.1 helper `tableRowChunks(token, title)`：HTML `<table>`(html token)與 markdown table(type='table')皆支援;抽出表頭列 + 各 body 列,回傳每列 `{title, text}`(text = 表頭欄名 + 該列儲存格)
- [x] 1.2 `parseAndChunk`：遇 table token 且 body 列數 > `MIN_TABLE_ROWS` → flush 前段文字 → emit 每列 chunk;否則沿用原本(整表併入 currentText)
- [x] 1.3 `MIN_TABLE_ROWS` 常數(如 2)

## 2. 單元測試

- [x] 2.1 `tests/chunker.test.js`：多列 HTML `<table>` → 每列一 chunk,含表頭欄名 + 該列值,title 為章節路徑
- [x] 2.2 多列 markdown pipe 表 → 每列一 chunk
- [x] 2.3 小表(≤ 門檻)不拆
- [x] 2.4 無表格內容行為不變(回歸既有 chunker 測試)
- [x] 2.5 `npm test` 全綠

## 3. 真實資料驗證 + reindex

- [ ] 3.1 重灌有原始 md 的文件(MTi、Thor、GMSL、TSMC、PO 等);確認 MTi §6.2/pin 表、Thor QSFP 表拆成列
- [ ] 3.2 完整回歸 before/after 對比:dilution knownFail(MTi 重量/IP/高度/寬度/pin2、Thor QSFP pin1、RTK 收斂)轉綠;無淨退化
- [ ] 3.3 轉綠者移除 knownFail;若有新退化,評估門檻/表頭策略或回退(rag.db 備份)
