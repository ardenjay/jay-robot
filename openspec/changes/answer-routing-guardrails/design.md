## Context

(追溯補記。)專案名稱/背景注入(project-context-prompt)上線後,實測發現模型的工具路由在兩個邊界出錯:netlist 必查規則落空後不會轉查文件;名稱/背景被當成離題過濾器、未經檢索就拒答。另外專案設定 UI 儲存後狀態不明。三者皆已修並上線(`22c9bfa`、`36bae3b`、`8a8f182`)。

## Goals / Non-Goals

**Goals:**
- 回答「找不到/離題」前必須先用對工具檢索過(netlist 落空 → search_documents;文件類問題一律先檢索)。
- 名稱/背景限縮為「解讀代稱」用途,明示背景為可信事實。
- 專案設定儲存狀態一目瞭然(dirty 追蹤)。

**Non-Goals:**
- 不改檢索演算法(hybrid search 不動)。
- prompt 措辭不逐字寫入單元測試(行為由實測驗收,措辭可迭代)。

## Decisions

1. **以 prompt 規則修,不加程式層強制**:也可在工具迴圈程式裡強制「netlist 空手後自動補一輪 search_documents」,但會對線路類問題造成多餘檢索;交給模型依問題類型判斷,規則寫明「必須」即足夠,實測有效。
2. **防護規則寫進 buildSystemInstruction 而非專案背景**:這是系統行為契約,不能依賴使用者自己在背景裡寫。
3. **UI 用「與已存值比對」的 dirty 追蹤**:單一 `savedProjectContext` 變數,input 事件刷新按鈕狀態;比「存完顯示一行字」明確,重進頁面即反映伺服器狀態。

## Risks / Trade-offs

- [文件類問題一律先檢索 → 純閒聊也可能多一次檢索] → 成本低(一次 embed + top-K),換取不漏答,可接受。
- [prompt 規則堆疊變長] → 目前規模尚可;若再長,考慮依問題類型動態組 prompt。
