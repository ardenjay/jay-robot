# Design: bilingual (multi-query) retrieval

## Context

`runSearchDocuments` 目前單一查詢 → hybridSearch 取候選池 25 → rerank 取 5。跨語言時（中文查詢 vs 英文 chunk），正確 chunk 可能排在候選池外（實測 §6.3 Electrical 中文向量 #33，英文向量 #4）。放大池或 rerank 都無法救「沒進候選」的 chunk——要從召回端補。

## Decisions

### multi-query：原查詢 + 英文翻譯，各自檢索後合併

```
expandQuery(adapter, query):
  查詢無 CJK → [query]（已是英文，翻譯是多餘）
  有 CJK → 用生成模型翻成英文；成功且與原查詢不同 → [query, english]
  翻譯失敗/空 → [query]
```

`runSearchDocuments`：對每個 variant 各跑一次 hybridSearch（各取 RERANK_POOL_K），再 **round-robin 合併去重**（各 list 輪流取 rank i），讓兩語言的高分候選都靠近聯集前段，避免英文命中全擠在尾端被截掉。聯集上限 30，交給 rerank 取 top-K。

### 為何 round-robin 合併、且設上限

- round-robin：原查詢與英文查詢的 top 候選交錯排前面。實測英文查詢把 §6.3 排進 hybridSearch 前段，round-robin 後它在聯集很前面，rerank 穩定選為 #0。
- 上限 30：兩 variant 最多 50 個候選，全丟 rerank prompt 太長、也稀釋判斷；round-robin 後前 30 已涵蓋兩語言最相關者。

### 為何只加英文一個 variant、且只對 CJK 查詢

專案文件語言以英文為主，中文→英文是最高價值的擴展。只加一個 variant 控制延遲（多一次生成＋一組檢索）。英文查詢翻譯是多餘，直接跳過。

## Risks / Trade-offs

- **延遲**：含 CJK 的每次 search_documents 多一次生成（翻譯）＋一組 embed/hybridSearch。可接受（地端、且只在文件檢索路徑）。
- **翻譯品質**：greedy 翻譯若失準，英文 variant 幫助有限，但原查詢仍在，不會更差；失敗一律退回單查詢。
- **對純英文文件外的影響**：中文文件（如專案背景）本就中文查詢命中好，多一個英文 variant 只是聯集多幾個候選，rerank 會濾掉不相關者，風險低；以完整 75 題回歸把關。

## Migration

無資料/schema 遷移。
