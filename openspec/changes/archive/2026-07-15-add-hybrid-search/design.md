## Context

檢索路徑現況：`search_documents` 工具 → `adapter.embed(query)` → `store.search(vector, topK, projectId)`，SQLite adapter 把該專案所有 chunks 讀出、JS 端算 cosine similarity 排序（`src/adapters/vector/sqlite.js`）。純向量檢索對精確關鍵字（料號 `U42`、文件代碼 `C560`、規格詞 `DDR5`）召回差。文件內容為中英混合（繁中為主），SQLite 內建 FTS5 的 unicode61 tokenizer 不會斷中文詞，需自行前處理。

限制：不新增外部套件（better-sqlite3 已內建 FTS5）；既有 `data/rag.db` 必須自動升級；`retrieval.js` 對 store 是注入式的（測試用 mock store），介面變更需向後相容。

## Goals / Non-Goals

**Goals:**
- 關鍵字精確命中：查詢含料號/代碼/專有名詞時，含該字串的 chunk 必須進得了 top-K。
- 語意查詢不退步：hybrid 結果在純語意問題上至少不劣於現行純向量。
- 零遷移成本：舊 DB 首次啟動自動建索引 + backfill；mock/自訂 store 不實作 hybrid 也能照常運作（fallback 純向量）。

**Non-Goals:**
- 不做 reranker（cross-encoder）或查詢改寫。
- 不做中文詞典斷詞（jieba 等）——以 CJK 單字切分 + BM25 已足夠本場景。
- 不改前端、SSE 協定、sources 格式。
- 不對非 SQLite adapter（目前不存在）提供 keyword search 實作。

## Decisions

### 1. Keyword search 用 SQLite FTS5 + BM25（而非 LIKE 掃描或外部引擎）
- FTS5 為 better-sqlite3 內建，零新依賴；BM25 是 FTS5 內建排名函數（`ORDER BY rank`）。
- 替代案 `LIKE '%kw%'` 無排名、無多詞加權；外部引擎（Meilisearch 等）違反零依賴限制。
- 建索引失敗（極舊 SQLite 編譯無 FTS5）時：初始化降級為「無 FTS」模式，`hybridSearch` 退回純向量，不讓服務掛掉。

### 2. CJK 斷詞：索引與查詢兩側做相同前處理（字切分），tokenizer 用 unicode61
- `segmentForFts(text)`：CJK 字元每字前後補空白、其餘（英數、`-`、`_` 連續段）保持原樣、lowercase。索引存前處理後文字；查詢同樣前處理。
- 這讓「中文以字為單位 + BM25 多字共現排名」近似詞級效果，同時英數 token（`U42`、`DDR5-4800`）完整保留、可精確命中。
- 替代案 trigram tokenizer：短 token（`U42` 為 2–3 字元）與 CJK 短詞命中不穩定，且需要 SQLite ≥ 3.34 特定編譯，故不採用。
- 查詢字串以 `OR` 串接、token 雙引號包裹（杜絕 FTS 語法注入）。**查詢側的連續 CJK 段組成相鄰字 bigram 片語**（`的腳位` → `"的 腳" OR "腳 位"`）而非單字 OR——實作時發現單字 OR 下，超常見字（的、是）讓大量無關 chunk 拿到 keyword 排名、RRF 融合後反而把真正的關鍵字命中擠出 top-K；bigram 片語讓常見單字不單獨計分，同時保留中文詞相鄰性。英數 token 維持完整精確命中。

### 3. FTS 表為獨立虛擬表，以 `chunk_id` 對回 `chunks`，寫入路徑同步維護
```sql
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  content_seg,
  chunk_id UNINDEXED, doc_id UNINDEXED, project_id UNINDEXED
);
```
- `add()` 交易內同時寫 `chunks` 與 `chunks_fts`；`clear()` 同步刪兩表。`movePhase` 不動內容，FTS 不需變。
- 替代案 external-content FTS + trigger：可行但 content 需存前處理後版本，external content 反而對不上原文，獨立表較直觀。
- 初始化時 backfill：`chunks_fts` 不存在，或筆數 ≠ `chunks` 筆數（舊 DB、或先前寫入失敗）→ 重建整個 FTS 表。chunk 數量級為千級，重建成本毫秒~秒級，可接受。

### 4. 融合用 Reciprocal Rank Fusion（RRF, k=60），不做分數正規化加權
- `score(c) = Σ 1/(60 + rank_i(c))`，對向量排名與 BM25 排名各取前 `topK * 4` 名候選後融合，取 top-K。
- RRF 只看排名不看原始分數，避免 cosine（0–1）與 BM25（無界、負向）尺度校準問題；k=60 為文獻慣用值。
- 替代案加權分數混合（`α·cos + β·bm25norm`）需調參且對 BM25 分佈敏感，不採用。
- 回傳 shape 維持 `{id, docId, title, text, distance}`（`distance` 取向量側；僅 keyword 命中者以最大 distance 補位），呼叫端（`retrieval.js`）只用 title/text/docId，不受影響。

### 5. 介面：`hybridSearch(queryText, vector, topK, projectId)`，retrieval 端 feature-detect
- `base.js` 增加 `hybridSearch` 預設實作 = 直接呼叫 `this.search(vector, topK, projectId)`（即 fallback 語意），自訂/mock adapter 零改動。
- `runSearchDocuments`：照舊 `embed(query)` 後改呼叫 `store.hybridSearch(query, queryVector, TOP_K, projectId)`；store 沒有此方法（舊注入物件）時退回 `store.search`。

## Risks / Trade-offs

- [字切分使 BM25 的 IDF 以「字」為單位，常見單字（的、是）權重低但仍佔 index] → OR 查詢下 BM25 自然壓低常見字貢獻；index 體積增加可忽略（千級 chunks）。
- [FTS 表與 chunks 表不同步（例如舊版程式寫入）] → 初始化以筆數比對觸發整表重建，兜底修復。
- [RRF 候選窗 `topK*4` 太小導致關鍵字命中被截斷] → keyword 側單獨保證：BM25 前幾名必然進候選集；如驗證不足再放大窗口，常數集中一處。
- [查詢全為停用字或 FTS 零命中] → RRF 退化為純向量排名，行為等同現狀，無新失敗模式。

## Migration Plan

1. 部署後首次啟動：constructor 偵測並建立 `chunks_fts`、backfill 既有 chunks（單次交易）。
2. 回滾：直接回舊版程式即可——舊版不讀 `chunks_fts`，殘留虛擬表無害；無 schema 破壞性變更。

## Open Questions

- 無。斷詞粒度與 RRF 常數若實測不理想，屬調參範疇，不影響架構。
