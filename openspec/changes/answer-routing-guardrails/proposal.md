## Why

(追溯補記:實作已隨 `22c9bfa`、`36bae3b`、`8a8f182` 上線,本 change 補齊規格軌跡。)

專案名稱/背景注入上線後,實測暴露兩個回答路由缺陷:(1)「SoC 用哪一顆」被 netlist 必查規則路由到 netlist_find,落空後模型直接放棄,不會轉查文件(答案明明在 datasheet);(2)「sensing camera 多少錢」被模型未經檢索就判定與專案(Box PC)無關而拒答,但報價單就在專案裡 — 名稱/背景被誤用成離題過濾器。另外專案設定 UI 儲存後狀態不明,使用者不確定到底存進去沒。

## What Changes

- system prompt 補規則:netlist 工具查無結果、且問題屬「用哪顆料/規格」類 → 必須接著呼叫 search_documents,不可只查 netlist 就說找不到。
- system prompt 補規則:文件內容類問題一律先呼叫 search_documents 才能回答找不到;專案名稱與背景僅供解讀代稱,不可用來判定問題與專案無關。
- 專案背景區塊明示為可信事實,可直接作為回答依據。
- 專案設定 UI:追蹤已存值,有未儲存變更時按鈕亮起並提示;儲存成功後按鈕鎖定顯示「✓ 已儲存」。

## Capabilities

### New Capabilities

(無)

### Modified Capabilities

- `rag-query`: 新增「回答找不到/離題前必須先檢索」的路由防護需求(netlist 落空轉查文件;不可未經檢索判定離題)。
- `project-context`: 背景注入明示為可信事實;專案設定 UI 需求補「儲存狀態清楚可辨」情境。

## Impact

- `src/services/retrieval.js`:buildSystemInstruction 三處 prompt 規則。
- `public/index.html`:專案設定儲存狀態追蹤。
- 測試:既有 111 tests 全綠(prompt 措辭不逐字入測,行為由實測驗收)。
