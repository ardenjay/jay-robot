# Bilingual query expansion to close the cross-language recall gap

## Why

專案文件多為英文（MTi datasheet、Thor carrier board、EAR-100T DS），但使用者常用中文提問。中文查詢對英文 chunk 的召回時好時壞——先前幾題（電源範圍、包裝清單、機構尺寸）勉強靠放大候選池 + rerank 搆到，但有些 chunk 排太深，候選池根本涵蓋不到。

實測失敗案例：「MTi 600 模組的供電輸入電壓範圍」正確 chunk（C204 §6.3 Electrical，VIN 4.5–24 V）在中文查詢下純向量排 #33、關鍵字 #106，遠在候選池 25 之外——完全沒進候選，模型拿不到資料還幻覺出「2.5–5.5V」。但把查詢換成英文，同一 chunk 向量排 #4。這是跨語言召回的結構性缺口，放大池/rerank 都救不了「根本沒進候選」的東西。

## What Changes

- 檢索前對含 CJK 的查詢做 query expansion：用生成模型把查詢翻成一個英文版本，原查詢與英文查詢**各自**跑 hybrid search 取候選，round-robin 合併去重成候選池，再交給 rerank。翻譯失敗或查詢本就是英文時，退回單一查詢，行為同現況。

## Impact

- Affected specs: `rag-query`（檢索前的查詢擴展）
- Affected code: `src/services/retrieval.js`（`runSearchDocuments` 多查詢合併）、新增 `src/services/query-expand.js`
- 延遲：含 CJK 的 search_documents 多一次生成（翻譯）＋一組 embed/hybridSearch；英文查詢不受影響。換取英文文件的跨語言召回涵蓋率。
