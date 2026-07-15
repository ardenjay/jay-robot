## Why

chunk 只記「最近一個標題」,深層小節失去所屬章節脈絡(`3.2.1 CAN` 不知道屬於哪一章);更關鍵的是 title 完全不參與檢索——embedding 只算內文、FTS 只索引 `content_seg`,當答案所在 chunk 的線索主要在標題(例如標題「I/O 規格」的表格,內文被大量規格稀釋)時,向量與關鍵字都命中不了。實例:「100T 有幾個 CAN」持續檢索失敗。

## What Changes

- `parseAndChunk` 維護 heading 階層堆疊,chunk 的 `title` 改為完整章節路徑(`H1 › H2 › H3`);無標題時維持檔名。folder 進料維持「來源 md 檔名 › 路徑」前綴慣例。
- 檢索文本改為「title + 換行 + 內文」:embedding 輸入與 FTS `content_seg` 都包含 title。
- FTS 一次性強制重建(以 `PRAGMA user_version` 版本戳觸發):**舊資料不重灌也立即受益**——既有 chunks 的舊 title 也會被索引進 FTS。
- 回給 LLM 的 chunk 結構不變(`{title, text, docId}`),title 資訊量變大。
- 舊 chunk 的 title 要變成完整路徑需重灌文件;embedding 含 title 亦同(FTS 部分不用)。

## Capabilities

### New Capabilities

(無)

### Modified Capabilities

- `document-ingestion`: 「Parse Markdown by headings」title 改為完整章節路徑;「Embed and store chunks」embedding 輸入包含 title。
- `vector-adapter`: 新增「FTS 關鍵字索引涵蓋 title(章節路徑)」需求,含一次性版本化重建。

## Impact

- `src/services/ingestion.js`:`parseAndChunk` heading 堆疊、`embedAndStore` embedding 輸入。
- `src/adapters/vector/sqlite.js`:`add` 與 `_rebuildFts` 的 `content_seg` 組法、user_version 重建觸發。
- 測試:`tests/chunker.test.js`(路徑堆疊)、`tests/ingestion.test.js`(embedding 輸入)、`tests/vector-adapter.test.js`(FTS 標題詞命中、版本重建);全程 temp DB。
- 驗收:FTS 重建後手測/`npm run eval`「100T 有幾個 CAN」類問題;完整效果需重灌 C455/C208。
