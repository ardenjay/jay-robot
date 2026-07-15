# Design: netlist-miss → document search fallback

## Context

工具迴圈（`answer` in `retrieval.js`）現有兩層防護：
1. **prompt 規則**：netlist 查無結果、且問題屬「用了哪顆晶片/零件、規格為何」時，必須改呼叫 search_documents。
2. **程式 guard**：`!usedAnyTool && !forcedSearch && hasDocs` 時（模型零工具就要作答），代跑一次 search_documents 塞回歷史。

缺口：問題「TSMC CN34 這條線是做什麼用的?」被路由到 `netlist_net`，netparse 回 `found:false`，模型轉述「查無此 net」。此時 `usedAnyTool` 已是 true（用過 netlist），程式 guard 不觸發；prompt 規則又只涵蓋「晶片/零件/規格」類，這題（問連接器用途）不在其中，模型直接放棄。

## Decisions

### 1. 以「是否用過 search_documents」+「netlist 是否全 miss」擴大 guard

新增追蹤：
- `usedDocSearch`：任一次（模型主動或強制）呼叫 search_documents 即為 true。
- `netlistCalls` / `netlistMisses`：每次 netlist 工具回應，`netlistCalls++`；結果 `found === false` 或工具 `ok:false`（error）時 `netlistMisses++`。
- `allNetlistMissed = netlistCalls > 0 && netlistMisses === netlistCalls`。

模型要作答（無 function calls）時的強制條件由：
```
!usedAnyTool && !forcedSearch && hasDocs
```
改為：
```
!usedDocSearch && !forcedSearch && hasDocs && (!usedAnyTool || allNetlistMissed)
```
（`!usedAnyTool` 蘊含 `!usedDocSearch`，故涵蓋原本的零工具情境；新增涵蓋「用了 netlist 但全 miss、從未查文件」情境。）

### 2. 為何用「全 miss」而非「只要 netlist 沒完全答出」

只在 netlist **每一次查詢都 miss** 時才追加文件檢索，避免對「netlist 有查到、答得好」的純電路題硬塞一次文件檢索（多餘延遲 + 可能引入雜訊）。若 netlist 有任一 hit，視為 netlist 路徑有效，不介入。

### 3. prompt 規則放寬為輔助

把 netlist-miss fallback 從「僅晶片/零件/規格」放寬為「任何 netlist 查無結果、問題可能由文件回答時，先查 search_documents 再回答找不到」。這是第一線引導；程式 guard 才是不依賴模型自律的最終兜底（memory：qwen3:14b 對 prompt 規則不可靠）。

## Risks / Trade-offs

- **多一次檢索的延遲**：僅發生在 netlist 全 miss 的問題上，本來就要再給使用者一個答案，值得。
- **強制檢索後模型仍可能答不好**：沿用既有「最多強制一次」語意，不會無限迴圈；最差退回「查無」等同修改前。
- **判定 miss 依賴 netparse 的 `found` 欄位**：現有 net/part/pin/find 查詢皆回 `found` 布林；`ok:false`（工具執行錯誤）也計入 miss，保守但安全。

## Migration

無資料/schema 遷移。純工具迴圈控制流程改動。
