## Context

`GeminiAdapter`（`src/adapters/llm/gemini.js`）的 `generate()` 與 `stream()` 直接以 `getGenerativeModel({ model: GEN_MODEL })` 取得模型，沒有傳 `generationConfig`，因此 temperature 用 Gemini 預設（約 1.0）。檢索（embedding + 餘弦相似度 + 固定 top-K）是決定性的，相同問題取得相同 chunks；唯一的隨機來源是生成。高 temperature 使模型在相同 context 下時而作答、時而放棄，產生「同問題不同結果」。

## Goals / Non-Goals

**Goals:**
- 將 Gemini 文字生成的 temperature 設為低值（預設 0.2），讓 RAG 回答更一致、更忠於文件
- `generate()` 與 `stream()` 一致套用同一設定

**Non-Goals:**
- 不改 adapter 介面（`embed`/`generate`/`stream` 簽章不變）
- 不改 prompt 內容或檢索邏輯
- 不追求完全決定性（temperature 0 仍可能有些微變異，且過低可能讓語句生硬）；目標是「夠穩定」
- 不調整 embedding（本就決定性）

## Decisions

### 1. 以具名常數設定 temperature，預設 0.2

**決定**：新增 `const GEN_TEMPERATURE = 0.2;`，在 `generate()` 與 `stream()` 取得 model 時帶入 `generationConfig: { temperature: GEN_TEMPERATURE }`。

**理由**：0.2 對 RAG 是常見且合適的低值——明顯壓低隨機性、貼著文件作答，又不像 0 那樣可能讓輸出生硬或在邊界情況卡住。用具名常數集中管理、易於日後調整。

---

### 2. `generate()` 與 `stream()` 都套用

**決定**：兩個生成方法都帶入相同 `generationConfig`。

**理由**：實際 RAG 走 `stream()`，但 `generate()` 也是對外契約的一部分，行為應一致，避免日後有人改用 `generate()` 時意外回到高 temperature。

---

### 3. 暫不做成環境變數

**決定**：先以常數寫死 0.2，不引入 `GEN_TEMPERATURE` 環境變數。

**理由**：保持最小改動、先解決一致性問題。若日後需要按場景調整，再比照既有 `LLM_ADAPTER`/`VECTOR_ADAPTER` 模式加環境變數即可。

## Risks / Trade-offs

- **仍非完全決定性** → temperature 0.2 大幅降低但未完全消除變異；極端邊界仍可能偶發不一致。對本問題（無故放棄作答）已足夠改善。
- **答案多樣性下降** → 對 RAG 而言是優點（要忠於文件，不要發揮），可接受。
- **未來多 adapter** → 目前只動 Gemini；若新增其他 adapter，應比照設定低 temperature，但不在本變更範圍。
