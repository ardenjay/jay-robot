# Treat standalone-bold lines as heading boundaries when chunking

## Why

實測 bug（上傳 FAQ.md 後）：問「MAX96712 到 Thor 有幾根 GPIO」「I2C speed 預設多少」「哪顆晶片有 FSYNC engine」，模型答「未提及」或答錯——但答案明明在 FAQ.md 裡。

根因：FAQ.md **用 `**粗體**` 當段落標題、完全沒有 `#` Markdown 標題**（`**Q1: ...**`、`**Q2：...**`）。現行 chunker 只依 `#`/`##`/`###` 切塊，此文件因此整份被視為「無標題」，只能按 1500 字硬切——把多個不相關的 Q&A 混進同一個 chunk（實測 5 個中文 Q&A 全擠在一個 chunk）。單一主題查詢（只問 GPIO）對這種多主題 chunk 相似度被稀釋，撈不到 → 答不出。此為「規格表/FAQ 召回稀釋」家族的可修根因。

原型驗證：把 `**Q...**` 轉成 `## ` 標題後重灌（5→14 chunks，每個 Q&A 一塊），6 題原本答不出的**全部轉綠**。

## What Changes

- `parseAndChunk`：除了 `#`/`##`/`###` 標題，SHALL 也把「**整行/整段皆為粗體**」的段落（如 `**Q1: ...**`、`**Power Supply**`）視為一個標題邊界——flush 前一個 chunk、將該粗體文字作為新的章節標題。
- 僅影響**新的 ingestion**；既有已入庫 chunk 不變（不需 reindex）。純加法：原本有 `#` 標題的文件行為不變，只有「用粗體充當標題」的文件會被正確切塊。

## Impact

- Affected specs: `document-ingestion`
- Affected code: `src/services/ingestion.js`（`parseAndChunk`）
- 重灌 FAQ.md 走正常路徑驗證；既有語料不動，無回歸風險（只改 chunking，且僅對新 ingest 生效）。
