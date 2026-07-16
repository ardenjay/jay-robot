## 1. 實作

- [x] 1.1 upload.js：轉檔上傳（mdPath ≠ 原檔）時 copy mdPath → `<docsDir>/<originalname>.md`
- [x] 1.2 ingestion.js backfillTableRows：單檔佈局加 sibling `<base>.md` 分支

## 2. 測試與收斂

- [x] 2.1 backfill 單測：sibling 佈局回填成功；無 sibling 的非 md 仍跳過（既有測試不變）
- [x] 2.2 npm test 全綠；commit+push；archive+spec sync
