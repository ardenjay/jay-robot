## Why

`chunks_fts` 目前把 `doc_id + title + content` 全部接成一個字串塞進單一 `content_seg` 欄位跑 BM25。BM25 按每列（chunk）總長度正規化分數，doc_id 長度固定但 chunk 內容長度不一——內容很短的 chunk（doc_id 占其總字數比例高）在查詢含專案代號時分數被灌爆，內容真正相關但字數多的 chunk 反而被稀釋。用 EAR-100T 專案的真實資料實測到兩個因此答錯的案例：「EAR-100T 的 AI 運算效能大概多少?」（正確答案的 Features chunk 排名第 5，前面 4 個是同文件裡幾乎不相關的段落）、「EAR-100T 電源輸入範圍是多少?」（撈到另一份文件裡同樣提到「電源」「輸入」的無關章節）。

## What Changes

- `chunks_fts` schema 拆成兩個獨立欄位：`content_seg`（title + content）與 `doc_seg`（doc_id），取代目前混在一起的單一 `content_seg`
- `_keywordSearch` 排序改用 FTS5 原生的欄位加權 `bm25(chunks_fts, 1.0, 0.3)`——正文權重 1.0、文件名權重 0.3（起手值，需以既有 33 題 eval 案例 + 這兩題失敗案例調參）
- `add()`、`_rebuildFts()`、`renameDocument()` 三處寫入 FTS 的地方同步改成兩欄插入
- `FTS_VERSION` bump 一版，既有 DB 啟動時自動整表重建索引，不需手動處理

## Capabilities

### Modified Capabilities
- `vector-adapter`：「Keyword index covers chunk title」這條需求的索引結構與排序方式改變——索引文本從「doc_id+title+content 混合單欄位」改成「content_seg 與 doc_seg 分欄位、依權重加權排序」，行為上的差異是「文件名匹配不再能蓋過真正的內容相關性」。

## Impact

- `src/adapters/vector/sqlite.js`：`ftsText()`、`_rebuildFts()`、`add()`、`renameDocument()`、`_keywordSearch()`、`FTS_VERSION`
- 既有 DB 啟動時觸發一次性 FTS 整表重建（機制沿用既有 `PRAGMA user_version` 版本戳，非新機制）
- `tests/vector-adapter.test.js`：需要新增/調整測試涵蓋「同文件內短 chunk 不應蓋過長且真正相關的 chunk」
- `evals/answer-cases.local.json`：本次修的兩題失敗案例可作為驗證基準（跑 `node scripts/eval-answers.js`）
