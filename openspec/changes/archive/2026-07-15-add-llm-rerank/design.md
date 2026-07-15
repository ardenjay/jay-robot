# Design: LLM listwise rerank

## Context

檢索管線目前是 `runSearchDocuments` → `hybridSearch(query, vec, TOP_K, projectId)` 直接取 5 筆。BM25/向量分數在跨語言、跨文件情境下排序不可靠（見 proposal）。本機無 cross-encoder rerank 模型，Ollama 也無 `/api/rerank` 端點——唯一可用的「語意判斷器」是既有的生成模型 qwen3:14b。

## Decisions

### 1. Listwise，用生成模型輸出排序索引

一次把候選片段全丟給模型，請它回傳「依相關性排序的編號 JSON 陣列」（例如 `[3,0,7]`），而非逐一 pointwise 打分。理由：一次呼叫、模型能相對比較，qwen3:14b greedy 輸出短陣列穩定。片段只取前 400 字（`SNIPPET_LEN`），控制 prompt 長度。

### 2. 候選池 15、最終 5

`RERANK_POOL_K=15` > `TOP_K=5`。放大候選池是前提：正確 chunk 若連候選都進不去，rerank 再強也救不了（實測「出貨包裝清單」原本排 #23）。15 是「夠寬到撈進跨語言正確片段」與「prompt 不過長、rerank 判斷不失焦」的折衷。

### 3. 失敗一律退回原排序，永不中斷檢索

rerank 是「錦上添花」的重排序層，不是關鍵路徑。LLM 回傳無法解析出合法索引、或呼叫本身拋錯（逾時/斷線）時，`rerankChunks` 退回候選池原本的前 topK 筆，只印一行 warning。候選數 <= topK 時直接原樣回傳、不呼叫 LLM（省一次請求）。模型只列出不足 topK 個索引時，依原順序遞補未選中的候選、去重。

## Risks / Trade-offs

- **延遲**：每次 `search_documents` 多一次生成呼叫。以只吃片段前 400 字 + `think:false` + greedy 壓低，實測單題增加數秒，可接受。
- **rerank 模型本身也可能判斷錯**：但退回原排序的保底讓「最差不劣於原本」；實測兩個目標案例轉綠、且完整 33 題無新退化。
- **非確定性風險低**：greedy（temperature 0）讓同輸入同輸出，行為可回歸測試。

## Migration

無資料/schema 遷移。純檢索管線內部改動，對呼叫端（chat）透明。
