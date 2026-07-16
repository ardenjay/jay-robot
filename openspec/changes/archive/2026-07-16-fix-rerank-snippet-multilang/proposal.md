# Make rerank snippet windowing cross-language and case-insensitive

## Why

實測 bug：問「EAR-100T 的工作溫度範圍是多少?」，模型答成 Thor Carrier Board 的 0~35 °C，而正確答案是 EAR-100T DS 規格表的 **-20 ~ 60 °C**。

三數診斷根因（非召回、是 rerank snippet 開窗失效）：

- 正確 chunk（id 3 / 754，EAR-100T DS 規格表）裡 `Operating Temperature -20 ~ 60 °C` 落在第 **1030 / 701** 字，都在 snippet head（400 字）之後。
- `buildSnippet` 只用**原始查詢**（中文「工作溫度範圍」）找命中處開窗，但表格內文是**英文** `Operating Temperature`——中文詞在英文文字裡找不到落點 → 視窗不開 → snippet 只剩 head → 重排器看不到 `-20 ~ 60`。
- 錯誤 chunk（Thor 板 id 682）的 `Operating Temperature Range 0 to 35` 剛好在第 299 字（head 內）→ 重排器看得到 → 排 #1 → 模型照 #1 答錯。

跨語言 query expansion 已把英文變體拉進候選池（chunk 3 進池 #4），但 rerank 仍只拿**原始中文查詢**開窗（`retrieval.js` 明確註解「rerank 仍以原查詢判定相關性」），英文變體沒被用來開窗，等於補了召回卻沒補可見性。

這與已修的 TPM bug 同一家族（答案埋在 head 之後），差別是這次跨語言，且命中比對是大小寫敏感的 `indexOf`。

## What Changes

- `buildSnippet(query, text)` → `buildSnippet(queries, text)`：`queries` 可為字串或字串陣列，蒐集**所有變體**的詞去找 head 之後的命中處開窗。
- 命中比對改**大小寫不敏感**（中文查詢的英文翻譯常為小寫，如 `operating`，需匹配內文 `Operating`）。
- `rerankChunks` 新增選填參數 `snippetQueries`（預設等於 `query`，維持既有呼叫與測試行為），`retrieval.runSearchDocuments` 把 `variants` 一併傳入。
- rerank prompt 呈現給 LLM 的「使用者問題」仍是**原始查詢**；變體只用於 snippet 開窗，不污染問題語意。

**非退化保證**：head（前 400 字）永遠保留，變體/大小寫只可能「多開一個視窗」補上下文，不會移除既有內容——最差等同今日行為。

## Impact

- Affected specs: `rag-query`
- Affected code: `src/services/rerank.js`（`buildSnippet`、`buildPrompt`、`rerankChunks`）、`src/services/retrieval.js`（傳入 variants）
- 需以完整回歸確認溫度題轉綠且無其他題退化。
