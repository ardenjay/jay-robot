# Design

## buildSnippet：接受多變體 + 大小寫不敏感

```js
function buildSnippet(queries, text) {
  const s = String(text || '');
  if (s.length <= HEAD_LEN) return s;
  const head = s.slice(0, HEAD_LEN);
  const lower = s.toLowerCase();
  const qs = Array.isArray(queries) ? queries : [queries];
  const terms = qs
    .flatMap(q => String(q || '').split(/[^\p{L}\p{N}]+/u))
    .filter(t => t.length >= 2);
  let hit = -1;
  for (const t of terms) {
    const i = lower.indexOf(t.toLowerCase());       // 大小寫不敏感
    if (i >= HEAD_LEN && (hit < 0 || i < hit)) hit = i;
  }
  if (hit < 0) return head;
  const win = s.slice(Math.max(0, hit - WIN_BEFORE), hit + WIN_AFTER);
  return `${head} … ${win}`;
}
```

- `queries` 字串或陣列皆可（`Array.isArray` 分流），舊呼叫（傳單一字串）行為不變。
- `lower.indexOf(t.toLowerCase())`：以小寫化字串比對，但用**原始 `s`** 切片保留原大小寫給重排器閱讀。
- 仍只看 `i >= HEAD_LEN` 的命中（head 內已可見的通用詞不算），沿用避免產品名等前段命中誤導的原則。

## 為什麼「最早命中」在多變體下仍安全

多變體會引入更多詞，理論上可能有雜訊詞先命中、把視窗開在非答案處。但：

1. head（400 字）永遠先給——視窗是**附加**，不取代 head，最差不比今日差。
2. 實測此案：chunk 3 的變體詞中最早命中 head 之後者正是 `operating`（@1030），視窗剛好框住 `-20 ~ 60 °C`；無更早的雜訊詞命中。

故維持「最早命中開單一視窗」的簡單策略，不引入多視窗複雜度。

## rerankChunks / buildPrompt 傳遞

```js
async function rerankChunks(adapter, query, chunks, topK, snippetQueries = query) {
  ...
  const raw = await adapter.generate(buildPrompt(query, chunks, topK, snippetQueries));
  ...
}

function buildPrompt(query, chunks, topK, snippetQueries = query) {
  const listing = chunks
    .map((c, i) => `[${i}] ${c.title}\n${buildSnippet(snippetQueries, c.text)}`)
    .join('\n\n');
  // prompt 的「使用者問題：」仍用原始 query，不放變體
  ...
}
```

- `snippetQueries` 預設 `= query`：既有測試與呼叫端（只傳 4 個參數）行為完全不變。
- `retrieval.runSearchDocuments`：`rerankChunks(adapter, query, pool, TOP_K, variants)`——`variants` 是 `expandQuery` 已算出的 `[原查詢, 英文版]`。

## 驗證（已於原型實測）

query「工作溫度範圍」：

| | rerank top5 ids | Thor(682) 名次 | 答案 |
|---|---|---|---|
| 舊 | 682, 584, 582, 754, 3 | #1 | 錯（0~35）|
| 新 | **3**, 580, 584, 754, 682 | #5 | 對（-20~60）|
