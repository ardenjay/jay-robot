# Widen rerank candidate pool from 15 to 25

## Why

`add-llm-rerank` 把候選池定為 15。實測有案例仍撈不到正確 chunk：中文查詢「EAR-100T 主板的電源輸入接頭是哪個 CN 編號?」的正確 chunk（C455「Jumpers and Connectors › Mother board」，內含 `CN1 | 19~36V DC Power Input`）**純向量排 #13**（本來在 15 內），卻被 RRF 融合裡爛的關鍵字排名（跨語言、中文「電源輸入」對不上英文「Power Input」，純關鍵字 #60）拖到融合後 #19–22，剛好擠出 15 的候選池，rerank 再強也看不到它。

實測把候選池放到 20 以上就涵蓋得到，且 rerank 每次都能把它拉回 top-5 第一名（語意重排器看得懂「電源輸入接頭」=「Power Input」）。

## What Changes

- `retrieval.js` 的 `RERANK_POOL_K` 由 15 調到 25（20 剛好在邊緣 #19，取 25 留餘裕對抗 RRF 窗口大小造成的融合排名微幅變動）。
- rerank 邏輯本身不動：仍是「取候選池 → LLM listwise rerank → top-K(5)」。

## Impact

- Affected specs: `rag-query`（候選池預設大小 15 → 25）
- Affected code: `src/services/retrieval.js`（單一常數）
- 延遲：rerank prompt 多約 10 個候選片段（各截前 400 字），影響有限；換取跨語言召回涵蓋率。實測完整 33 題無新退化。
