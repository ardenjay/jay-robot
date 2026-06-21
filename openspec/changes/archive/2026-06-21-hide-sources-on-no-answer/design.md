## Context

`retrieval.js` 的 `answer()` generator 目前在串流完 LLM tokens 後，直接從 vector search 結果的 chunk titles 組成來源列表送出。問題在於：不論 LLM 是否真正回答了問題，來源都會被送出。當 LLM 判斷 chunks 無關並回覆「無法在提供的資料中找到答案」時，UI 還是顯示這些 chunk titles 作為「來源」，產生誤導。

## Goals / Non-Goals

**Goals:**
- 當 LLM 回覆說找不到答案時，送出空來源列表
- 維持現有 streaming 行為不變（token 仍逐字送出）

**Non-Goals:**
- 不修改前端（sources 為空時，現有 UI 已不顯示來源區塊）
- 不改變 prompt 或檢索邏輯
- 不處理其他「找不到答案」的表達方式（LLM 被 prompt 要求固定用此片語）

## Decisions

**累積完整回應再判斷**

LLM 以 streaming 方式逐 token 送出，無法在串流中途判斷最終內容。解法是在串流 tokens 的同時，累積至 `fullResponse` 字串，串流結束後再做字串包含判斷。

```
let fullResponse = '';
for await (const token of llm.stream(prompt)) {
  fullResponse += token;
  yield { type: 'token', value: token };
}
const NO_ANSWER_PHRASE = '無法在提供的資料中找到答案';
const sources = fullResponse.includes(NO_ANSWER_PHRASE)
  ? []
  : [...new Set(chunks.map(c => c.title).filter(Boolean))];
yield { type: 'sources', value: sources };
```

此方式對記憶體影響極小（回應通常 < 1 KB），且不改變 token 串流時序。

**使用固定片語而非語意判斷**

prompt 已明確要求 LLM：找不到時「請直接說『無法在提供的資料中找到答案』」。固定字串比呼叫額外 LLM 分類便宜，且可預測。

## Risks / Trade-offs

- [LLM 未嚴格遵守片語] → 若 LLM 輸出不含此片語但仍表示找不到，來源仍會顯示。現有 prompt 已強制要求，此風險低，且未來可擴充片語列表。
- [記憶體] → fullResponse 在 generator 生命週期內存活，回應通常 < 2 KB，無實際影響。
