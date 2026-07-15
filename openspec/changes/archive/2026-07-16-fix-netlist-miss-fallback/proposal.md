# Fall back to document search when all netlist queries miss

## Why

含連接器/net/腳位類詞彙的問題（如「TSMC CN34 這條線是做什麼用的?」）會被路由到 netlist 工具。當 netparse 回 `found:false`（例如 `TSMC CN34` 不是合法 net 名、而是連接器編號），模型直接轉述「查無此 net」就收工，不再嘗試文件檢索——即使答案其實在已上傳文件裡（實測 `C430 TSMC.md`：「TSMC CN34 → 100T, used for i2c control」）。

現有防護有缺口：system prompt 雖有「netlist 查無結果時應改查 search_documents」的規則，但只窄化在「用了哪顆晶片/零件、規格為何」這類問題；而程式層的「零工具就作答 → 強制檢索」guard 只在模型**完全沒用任何工具**時觸發。模型用了 netlist（即使全部 miss）就繞過了這個 guard。qwen3:14b 對純 prompt 規則又不可靠（見 memory），需要程式層兜底。

## What Changes

- `retrieval.js` 擴大強制檢索 guard：模型要作答、專案有文件、且**從未呼叫過 search_documents**時，若「完全沒用工具」**或**「用了 netlist 但每一次查詢都 miss（`found:false` / 工具錯誤）」，系統 SHALL 代跑一次 `search_documents`（以原問題為查詢）後讓模型重答。仍最多強制一次。
- 順帶把 system prompt 的 netlist-miss fallback 規則從「僅晶片/零件/規格問題」放寬為「任何 netlist 查無結果、而問題可能由文件回答時」，作為第一線引導（程式 guard 為最終兜底）。

## Impact

- Affected specs: `rag-query`（強制檢索 guard 的觸發條件擴大）
- Affected code: `src/services/retrieval.js`
- 對純電路題（netlist 有查到結果）無影響：guard 只在「netlist 全 miss 且從未查文件」時才追加一次檢索，不會對成功的 netlist 回答硬塞文件檢索。
