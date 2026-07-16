## 1. 調整與警告

- [x] 1.1 `ollama.js` `DEFAULT_NUM_CTX` 16384 → 12288
- [x] 1.2 `_postJson` 取得 data 後，若 `data.prompt_eval_count > this.numCtx * 0.9` 印警告（token 數 / num_ctx）

## 2. 單元測試

- [x] 2.1 `tests/ollama-adapter.test.js`：num_ctx 預設為 12288（chatWithTools body.options.num_ctx）
- [x] 2.2 prompt_eval_count 超過 90% → 有警告（捕捉 console.warn 或以 spy）；未超過 → 無警告
- [x] 2.3 `npm test` 全綠

## 3. 真實資料驗證

- [x] 3.1 跑完整 95 題確認無因截斷造成的答錯（尤其最大 prompt 的多輪工具對話）；留意 log 有無近上限警告
  - 結果：0 次近上限警告（最大 prompt 未達 90% 門檻 11059 tokens）；唯一 FAIL 為溫度題召回/排序問題（答案完整非截斷），與 num_ctx 無關；一次 120s 逾時經重試自動恢復。12288 驗證通過。
