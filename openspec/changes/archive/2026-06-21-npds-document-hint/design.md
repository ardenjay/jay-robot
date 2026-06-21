## Context

目前 `retrieval.js` 的 `buildPrompt()` 在有缺少 phases 時只加入：
> 「以下 NPDS 階段尚無文件：C2、C4、C5，若答案需要這些階段的資料，請提示使用者補傳。」

使用者拿到的回覆是「請補傳 C4 階段文件」，但不知道 C4 有 34 份文件，哪一份才是他需要的。

現在使用者提供了完整目錄（`NPDS.md`），已預先建立 `src/config/npds-catalog.js` 儲存所有文件的代碼、名稱、說明。

## Goals / Non-Goals

**Goals:**
- LLM 回答「無法找到答案」時，能根據問題語義從 NPDS 目錄中識別 1–3 份最相關的文件，提示使用者上傳（含文件代碼 + 名稱 + 所屬階段）
- 目錄內容由 `npds-catalog.js` 集中管理，未來修改只需改一個地方

**Non-Goals:**
- 不自動判斷哪個 phase 與問題最相關（交給 LLM 推理）
- 不在前端顯示目錄瀏覽器（純 LLM 提示，非 UI 功能）
- 不支援動態更新目錄（目錄為靜態常數）

## Decisions

### 1. 將完整目錄注入 prompt，而非只注入缺少的 phases

**決定**：在 `buildPrompt()` 中永遠附上完整的 NPDS 文件目錄作為參考區塊，讓 LLM 可以跨 phase 推理。

**理由**：問題可能橫跨多個 phase（例如「可靠度測試在哪個階段做？」可能涉及 C3/C4），只注入缺少 phases 會讓 LLM 沒有足夠上下文。Gemini 2.5 Flash 的 context window 夠大，多 3,000–4,000 tokens 無實質影響。

**替代方案**：只注入缺少 phases 的目錄 → LLM 缺乏跨 phase 比較能力，且每次查詢要先計算哪些 phases 缺少，複雜度更高。

---

### 2. 目錄格式：`代碼 名稱：說明` 的純文字列表

**決定**：用簡潔的文字格式（每行一份文件），不用 JSON 或 Markdown 表格。

**理由**：LLM 對自然語言清單的理解效果最好，且易於閱讀與維護。JSON 會讓 prompt 顯得結構化但增加 token 數；Markdown 表格需要對齊，維護麻煩。

---

### 3. 指令放在 prompt 的 system 層，與文件內容分開

**決定**：在 prompt 中明確分成「文件內容（已上傳）」和「NPDS 文件目錄（參考）」兩個區塊，並加入明確指令說明目錄的用途。

**理由**：避免 LLM 混淆「已上傳的文件內容」與「參考目錄」，確保它知道目錄只是用來識別要上傳什麼，而非回答問題的資料來源。

## Risks / Trade-offs

- **Prompt 長度增加** → 每次查詢多約 3,000–4,000 tokens。Gemini 2.5 Flash 免費額度以輸入 token 計費，高使用量時成本增加。未來若有問題可考慮只注入問題最相關 phases 的子目錄。
- **LLM 可能建議錯誤文件** → 目錄提供了說明欄位幫助 LLM 推理，但仍可能誤判。這是 LLM 推理的固有局限，acceptable trade-off。
- **目錄內容過時** → NPDS 流程若更新，需手動更新 `npds-catalog.js`。目前是靜態常數，沒有同步機制。
