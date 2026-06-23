## Context

`ingestion.js` 目前逐一 embed：

```js
for (const chunk of rawChunks) {
  const embedding = await adapter.embed(chunk.text);   // 每 chunk 一個 API 請求
}
```

大文件 → 數十～數百 chunks → 短時間爆量請求 → Gemini 429。`withBackoff`（gemini.js）只重試 3 次、約等 3 秒，且不讀 429 的 `RetryInfo.retryDelay`。

SDK（`@google/generative-ai` 0.24.1）支援 `model.batchEmbedContents({ requests: EmbedContentRequest[] })`，回傳 `{ embeddings: [{ values }] }`，可一次 embed 多筆。

## Goals / Non-Goals

**Goals:**
- 用批次 embedding 大幅減少請求數，降低 429 機率
- 強化 backoff：更多重試、尊重伺服器建議的 `retryDelay`
- 保持 `embed(text)` 單筆介面不變（查詢端用）

**Non-Goals:**
- 不改 embedding 模型 / 維度
- 不解決「每日總量」配額耗盡（屬 Google 帳務層，非程式可解）
- 不引入外部 rate-limiter 套件

## Decisions

### 1. 新增 `embedBatch(texts)`，不改動單筆 `embed`

**決定**：base 介面新增 `embedBatch(texts: string[]): Promise<number[][]>`；Gemini 實作用 `batchEmbedContents`，把每個 text 包成 `{ content: { parts: [{ text }] } }`，回傳依序對應的向量陣列。`embed(text)` 維持給查詢端單筆使用。

**理由**：ingest 是大量、查詢是單筆，需求不同。新增方法而非改既有簽章，向後相容、職責清楚。

---

### 2. ingestion 以固定批量分批呼叫

**決定**：`ingestion.js` 將 chunks 依 `BATCH_SIZE`（預設 100）切片，逐批 `await embedBatch(slice)`，組回 `embeddedChunks`。

**理由**：單一 `batchEmbedContents` 請求有筆數上限，分批避免過大請求；100 是保守安全值。批次間天然序列化（await），也順帶平滑了速率。

---

### 3. 強化 `withBackoff`：更多重試 + 尊重 retryDelay

**決定**：
- 提高重試次數（如 5 次）
- 429 時優先解析 `err.errorDetails` 中 `RetryInfo` 的 `retryDelay`（如 `"17s"`）作為等待時間；無則退回指數退避（`2^attempt` 秒）
- 等待時間設上限（如 60 秒），避免異常長等

**理由**：RPM 限制需等到分鐘窗口重置，固定 1–2 秒不夠；伺服器若給了 `retryDelay`，照它最準。重試次數與上限取平衡，避免無止境等待。

---

### 4. 批次中的 429 由同一個 withBackoff 包覆

**決定**：`embedBatch` 的整個 `batchEmbedContents` 呼叫包在 `withBackoff` 內，整批一起重試。

**理由**：批次請求本身就是一次 API 呼叫，整批重試最單純；不需在批內做 chunk 級重試。

## Risks / Trade-offs

- **批次部分失敗語意**：`batchEmbedContents` 為單一請求，成功則整批回；失敗則整批重試。不會有「半批成功」的複雜狀態。
- **每日配額耗盡**：本變更只解決 RPM 爆量；若是 RPD（每日）用罄，仍會 429，需升級方案。已於 proposal 標註。
- **批量大小**：100 為保守值；若仍偶發 429，可調小或在批次間加小延遲（保留為後續微調）。
- **回傳順序**：依賴 `batchEmbedContents` 回傳 `embeddings` 與 `requests` 同序；SDK 保證對應，實作時直接 index 對齊。
