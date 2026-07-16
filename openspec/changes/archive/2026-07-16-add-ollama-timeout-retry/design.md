# Design: Ollama timeout + retry

## Context

`OllamaAdapter._post(path, body)` 直接 `fetch` 後回 `res`，呼叫端再 `res.json()`。無 timeout、無重試。非串流路徑（`generate`/`chatWithTools`/`embedBatch`）都走「`_post` → `res.json()`」。串流 `stream()` 走「`_post` → 讀 `res.body`」。

## Decisions

### 新增 `_postJson`，把「fetch + json」整包納入 timeout/retry

timeout 要涵蓋到「生成完成、拿到完整 JSON」為止——但 `fetch` 只在收到 header 時 resolve，實際生成是在讀 body（`res.json()`）時發生。若只對 `fetch()` 設 timeout，涵蓋不到生成。故用 AbortController 的 signal 傳給 fetch，abort 會同時中止 fetch 與後續 body 讀取；並把 `res.json()` 一起放進同一個 timeout 週期內。

```
_postJson(path, body):
  for attempt in 0..maxRetries:
    controller = new AbortController()
    timer = setTimeout(() => controller.abort(), timeoutMs)
    try:
      res = await fetch(url, { ..., signal })
      if !res.ok:
        detail = 解析錯誤內容
        if 400 <= status < 500: throw（確定性錯誤，不重試）
        else: lastErr = 5xx 錯誤（可重試）
      else:
        return await res.json()   // 在 timeout 內完成
    catch err:
      lastErr = 包裝後的連線/逾時錯誤（AbortError→逾時訊息）
    finally:
      clearTimeout(timer)
    if 還有重試次數: await sleep(retryDelayMs)
  throw lastErr（含 URL + ollama serve 指引）
```

- `generate`/`chatWithTools`/`embedBatch` 改呼叫 `_postJson` 取代「`_post`+`res.json()`」。
- `stream()` 維持用 `_post`（串流互動情境，重試語意不同、且中途 abort 會斷流，本次不動）。

### 只重試「連線瞬斷 / timeout / 5xx」，不重試 4xx

4xx（model not found 等）是確定性錯誤，重試無意義且拖慢失敗回報。連線層瞬斷（fetch throw）、AbortError（timeout）、5xx 才是暫時性、值得重試。

### 可調參數（環境變數，測試用小值）

- `timeoutMs`：`OLLAMA_TIMEOUT_MS` 或預設 120000
- `maxRetries`：`OLLAMA_MAX_RETRIES` 或預設 2
- `retryDelayMs`：`OLLAMA_RETRY_DELAY_MS` 或預設 2000（測試注入 0 免等待）

單題最慢實測約 25s（含多次呼叫），單次生成遠低於 120s；timeout 只抓「真的卡死」的請求。

## Risks / Trade-offs

- **誤中合法慢請求**：120s 對單次生成有大安全邊際；必要時以 env 調高。
- **重試放大負載**：僅瞬斷/逾時才重試、且有退避；不會對正常請求加壓。
- **abort 的相容性**：`globalThis.fetch`（Node 18+ undici）支援 `signal`；測試用可注入 fetch 驗證 abort 行為。

## Migration

無資料/schema 遷移。
