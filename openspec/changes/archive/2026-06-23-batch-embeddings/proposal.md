## Why

上傳大型文件（如 156 頁 PDF）時，ingestion 會把文件切成大量 chunks，並在迴圈中**逐一、不間斷地**呼叫 Gemini embedding API。短時間內爆量請求踩到 **429（每分鐘速率/配額上限）**，導致整份文件 ingestion 失敗。

現有的 `withBackoff` 重試太淺（只 3 次、總共約等 3 秒就放棄），且忽略 Gemini 回傳的建議等待時間，遇到 RPM 限制時救不回來。

## What Changes

- **批次 embedding**：新增 `embedBatch(texts)`，用 Gemini `batchEmbedContents` 一次送多個 chunk，把「每 chunk 一個請求」降為「每批一個請求」，大幅減少請求數
- **ingestion 改用批次**：embed 迴圈改為分批呼叫 `embedBatch`，而非逐一 `embed`
- **強化 backoff**：增加重試次數、加長等待上限，並在 429 帶有 `RetryInfo.retryDelay` 時依其建議等待；無則退回指數退避
- `embed(text)`（單筆，供查詢用）維持不變

## Capabilities

### New Capabilities

無

### Modified Capabilities

- `llm-adapter`：新增批次 embedding 能力（`embedBatch`）與更穩健的 429 重試（更多次、尊重 `retryDelay`）
- `document-ingestion`：文件 ingest 時以批次方式產生 embedding，降低 API 請求數與 429 風險

## Impact

- `src/adapters/llm/base.js`：介面新增 `embedBatch(texts)`
- `src/adapters/llm/gemini.js`：實作 `embedBatch`（`batchEmbedContents`）；強化 `withBackoff`（重試次數、`retryDelay`）
- `src/services/ingestion.js`：embed 迴圈改為分批呼叫 `embedBatch`
- 無 API 介面 / 資料庫 / 前端變更
- ⚠️ 若 429 來自**每日總量**配額而非每分鐘，仍需於 Google 端調整方案（程式無法解決）
