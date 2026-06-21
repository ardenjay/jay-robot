## Why

當 LLM 無法從已上傳文件找到答案時，回答區會顯示「無法在提供的資料中找到答案」，但來源區仍列出 vector search 找到的 chunk titles，讓使用者誤以為這些文件包含答案。這些來源是「被查詢過但沒有答案」，不應顯示。

## What Changes

- `src/services/retrieval.js`：在 streaming 過程中累積完整回應文字，結束後若回應包含「無法在提供的資料中找到答案」，則送出空來源列表而非 chunk titles

## Capabilities

### New Capabilities

無

### Modified Capabilities

- `rag-query`：「Generate answer with source citations」需求新增場景：LLM 無法回答時來源列表為空

## Impact

- `src/services/retrieval.js`：小幅修改，串流時多累積一個字串變數，其餘邏輯不變
- 無 API 介面變更、無前端變更
