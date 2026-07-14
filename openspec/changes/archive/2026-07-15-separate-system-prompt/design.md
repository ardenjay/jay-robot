## Context

`retrieval.js` 的 `answer()` 組 `contents = [{role:'user', parts:[{text: sys + '\n\n## 使用者問題\n' + question}]}]`。Gemini 不在乎（一直正常），qwen3（Ollama）嚴重在乎：A/B 實測（2026-07-15，「電源輸入範圍是多少」×3）指令在 user 內 0/3 呼叫工具、在 system role 3/3。mock adapter 靠 `使用者問題` 標記從 user 文字抽問題。

## Goals / Non-Goals

**Goals:**
- system 指令走各 provider 的原生通道，qwen3 工具呼叫率恢復正常。
- Gemini／mock 路徑行為不退步（現有測試全綠）。

**Non-Goals:**
- 不改 system 指令的內容與組成邏輯（`buildSystemInstruction` 原樣）。
- 不做 narrate 偵測重試等補救機制——先修根因，不夠再說。
- 不改多輪工具迴圈的訊息累積方式（model/function 回合照舊）。

## Decisions

### 1. contents 首元素用 `{role:'system', parts:[{text}]}` 作為跨 adapter 的中立表示
- `answer()` 組 `[{role:'system', parts:[{text: sys}]}, {role:'user', parts:[{text: question}]}]`；後續工具回合照舊 append。
- 各 adapter 對映：
  - **Ollama**：`toOllamaMessages` 加一條規則 `role:'system'` → `{role:'system', content}`（qwen template 原生吃）。
  - **Gemini**：`chatWithTools` 把 contents 開頭的 system 元素抽出，以 `getGenerativeModel({ systemInstruction })` 傳遞（SDK 原生參數），其餘 contents 照傳。Gemini API 的 contents 不接受 system role，抽出是必要動作。
  - **mock**：`extractQuestion` 改為「取第一個 user 元素全文」；不再依賴 `使用者問題` 標記（保留舊標記解析作 fallback，兼容測試直接餵舊格式的情況）。
- 替代案「只在 Ollama adapter 內用啟發式切割 user 文字」：靠 magic string 切割脆弱，且讓 adapter 知道 retrieval 的 prompt 版式，耦合方向錯誤。

### 2. 相容性：adapter 對「沒有 system 元素」的 contents 照舊處理
- 三個 adapter 都以「首元素是否 role:'system'」判斷，沒有就走原路徑——舊呼叫端（測試、scripts）不強制改。

## Risks / Trade-offs

- [Gemini systemInstruction 語意與「塞 user 開頭」略有差異，回答風格可能微變] → 現有 retrieval 測試驗證指令內容仍完整送達；屬可接受的正向變化（更正統）。
- [mock 的問題抽取改動影響既有測試] → 保留標記 fallback；跑全套測試把關。

## Migration Plan

程式碼變更即生效，無資料遷移。回滾 revert commit 即可。

## Open Questions

- 無。
