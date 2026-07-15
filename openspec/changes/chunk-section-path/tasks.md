## 1. 切塊:章節路徑

- [x] 1.1 `src/services/ingestion.js` `parseAndChunk`:heading 堆疊(依 token.depth,截斷至 depth-1 再壓入),title = 路徑 join(' › ');無標題維持檔名;子塊沿用同 title
- [x] 1.2 測試 `tests/chunker.test.js`:巢狀路徑、同層切換截斷、跳層、無標題、超長切割沿用 title;既有測試通過或按新行為更新

## 2. 檢索文本含 title

- [x] 2.1 `src/services/ingestion.js` `embedAndStore`:embedding 輸入改 `title\n text`(title 空則純 text);`content` 欄位維持純內文
- [x] 2.2 `src/adapters/vector/sqlite.js`:`add` 的 FTS 寫入與 `_rebuildFts` 改索引 `segmentForFts(title\n content)`;`PRAGMA user_version` 版本戳觸發一次性重建
- [x] 2.4 `scripts/reembed.js`:embed 輸入對齊新規則(title+內文)——舊資料免重灌,跑一次腳本即補上向量面;沙箱(268 chunks)實測兩題照樣答對
- [x] 2.3 測試:embedding 輸入含 title(mock adapter 擷取 embedBatch 輸入);FTS 標題詞命中(temp DB,內文無該詞);舊版 user_version 啟動觸發重建、再啟動不重建

## 3. 驗證

- [x] 3.1 `npm test` 全綠;不碰真實 `data/rag.db`
- [ ] 3.2 使用者驗收:重啟後(FTS 自動重建)手測標題詞問題;重灌 C455/C208 後再驗完整效果(向量面)
