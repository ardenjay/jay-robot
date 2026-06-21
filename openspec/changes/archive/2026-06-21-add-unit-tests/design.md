## Context

目前無任何測試覆蓋。核心邏輯（chunker、vector adapter）已在開發過程中手動驗證過，但驗證腳本已刪除。需要可重複執行的正式測試。

## Goals / Non-Goals

**Goals:**
- 使用 Node.js 內建 `node:test` + `node:assert`，零額外依賴
- `npm test` 一指令跑全部測試
- 覆蓋純邏輯層（不依賴外部 API）：chunker、cosine similarity、vector adapter CRUD
- Ingestion pipeline 使用 mock LLM adapter 測試，不呼叫真實 Gemini API

**Non-Goals:**
- E2E 測試（需要真實 API key）
- HTTP route 測試（需要 supertest 等額外套件）
- 100% coverage

## Decisions

### 1. 使用 `node:test` 而非 Jest

**決定**：Node.js v18+ 內建 `node:test` 模組，`node --test` 指令即可執行。

優點：
- 零依賴，不需要 `npm install`
- 語法接近 Jest（`describe`、`it`、`assert`）
- 輸出為 TAP 格式，可接 CI

**為何不用 Jest**：個人工具，Jest 帶來 babel 配置複雜度；內建 test runner 對此規模完全夠用。

---

### 2. 測試檔案命名與結構

```
tests/
├── chunker.test.js        ← parseAndChunk 的純邏輯測試
├── vector-adapter.test.js ← SqliteVectorAdapter（in-memory DB）
└── ingestion.test.js      ← ingestFile，mock GeminiAdapter
```

每個檔案獨立可執行：`node tests/chunker.test.js`
全部一起：`npm test`（`node --test tests/**/*.test.js`）

---

### 3. Vector adapter 測試使用 in-memory DB

`SqliteVectorAdapter` 接受 `dbPath` 參數，測試傳入 `:memory:` 路徑，每次測試都從空白狀態開始，不留下殘留檔案。

但 `sql.js` 不支援 `:memory:` 字串，改用 `tmpdir` 下的隨機路徑，測試結束後刪除。

---

### 4. Ingestion 測試 mock LLM

`ingestion.js` 目前在 module 頂層 `require('../adapters/llm')`，直接 mock 有困難。

解法：`ingestFile` 接受可選的 `llmAdapter` 參數，預設為全域 adapter，測試時傳入 mock（回傳固定長度向量）。需小幅修改 `ingestion.js` 的函式簽名。

## Risks / Trade-offs

- **`node --test` glob 在 Windows 上的行為** → Windows cmd 不展開 glob，改用 `node --test "tests/chunker.test.js" "tests/vector-adapter.test.js" "tests/ingestion.test.js"` 明確列出，或用 Node script 動態掃描
- **ingestion.js 函式簽名修改** → 向下相容，第三個參數預設值不影響現有呼叫

## Open Questions

- 無
