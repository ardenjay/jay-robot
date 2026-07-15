# Design: tune rerank pool size

## Context

檢索管線：`hybridSearch(query, vec, RERANK_POOL_K, projectId)` 取 RRF 融合後前 `RERANK_POOL_K` 筆候選 → `rerankChunks` 用 LLM listwise 排序取 top-5。`hybridSearch` 內部候選窗為 `topK*4`（此處 = `RERANK_POOL_K*4`）。

## Decisions

### 為何是「放大候選池」而非改融合公式

實測某案例正確 chunk 各路排名：純向量 **#13**、純關鍵字 **#60**（跨語言噪音）。RRF `score = 1/(k+rank_vec) + 1/(k+rank_kw)` 下，關鍵字的 #60 把它從向量的 #13 拉到融合後 #19–22。

候選池 15 → 撈不到；20/25/30 → 撈得到，rerank 都把它排回 #0。取 **25**：20 時它在候選 #19（緊貼邊緣），25 留餘裕（`topK*4` 窗口隨池大小變，融合排名會小幅浮動 #19↔#22）。

不動 RRF 公式的理由：關鍵字路對別的案例（docId/料號命中）有貢獻，調權重是非單調的（見 `fts5-hybrid-search-gotchas`），風險比單純放大池高。放大池只是「讓 rerank 有機會看到」，把最終判斷交給語意重排器，較穩健。

### 為何不無限放大

池越大 → rerank prompt 越長、候選越多，qwen3:14b 排序可能失焦、延遲上升。25 是「涵蓋此案例 + 不過度膨脹」的折衷；實測 25 下完整 33 題無新退化。

## Risks / Trade-offs

- **rerank 負擔**：多約 10 個候選片段。以每片段截前 400 字、greedy 控制，可接受。
- **過擬合單一案例的疑慮**：以完整 33 題回歸把關，非只看這一題。
- 若日後仍有正確 chunk 落在池外，代表問題不在池大小而在召回本身（如 embedding 區分度），需另解，不應無限往上加 `RERANK_POOL_K`。

## Migration

無資料/schema 遷移。單一常數調整。
