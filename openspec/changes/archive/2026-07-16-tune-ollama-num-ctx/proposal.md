# Lower Ollama num_ctx from 16384 to 12288, with a near-limit warning

## Why

`num_ctx` 決定 KV cache 預留大小（照 num_ctx 預留，非實際長度）。現在 16384，但實測 2581 個真實請求：中位 3969、90 百分位 6198、**最大 9310** tokens。16384 有 1.76x 過剩餘裕，白白多佔 GPU 記憶體、加重高負載下的瞬斷風險。RAG 這類問答的 context 本來就不大，可調小釋出 headroom。

調小的唯一風險是**靜默截斷**：prompt 超過 num_ctx 時 Ollama 從前面砍內容、悄悄掉答案。故需（a）保留足夠餘裕、（b）加一道近上限警告讓截斷「看得到」。

## What Changes

- `DEFAULT_NUM_CTX` 16384 → **12288**：對最大 prompt 9310 仍留約 3000 tokens 給生成輸出，KV 預留少 25%。仍可由 `OLLAMA_NUM_CTX` 覆寫。
- `_postJson` 取得回應後，若 `prompt_eval_count` 超過 `num_ctx` 的 90% SHALL 印警告（把接近截斷的情況顯性化）。

## Impact

- Affected specs: `llm-adapter`
- Affected code: `src/adapters/llm/ollama.js`
- 需以完整回歸確認：調小後沒有因截斷造成答錯（尤其最大 prompt 的多輪工具對話）。
