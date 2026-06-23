## ADDED Requirements

### Requirement: Expose netlist queries as LLM tools
系統 SHALL 將 netparse 的查詢命令（`find`、`part`、`net`、`pin`、`connector`、`trace`、`info`）以工具（function）形式提供給 LLM 呼叫，每個工具帶對應參數（如 refdes、netname、label、pin）。工具以 `python3 netparse.py --dir <該專案netlist目錄> <命令> … --json` 執行，回傳結構化結果供 LLM 組成答案。

#### Scenario: LLM calls a netlist tool to answer a connectivity question
- **WHEN** 使用者問與具體零件、net、腳位或連線相關的問題
- **THEN** LLM 呼叫對應的 netlist 工具（如 `part`/`net`/`trace`），系統執行 netparse 並回傳結果，LLM 據以回答

#### Scenario: Trace through series passives
- **WHEN** 使用者要求從某腳追線（trace）
- **THEN** 系統執行 `trace`，穿越串聯 R/L/FB（可選 C），回傳到達的端點路徑

### Requirement: Resolve a project's netlist by folder name
系統 SHALL 以**專案名稱**對應 netlist 資料夾 `tools/netlist/<專案名>/`。當該資料夾存在且含 `pstxprt.dat`、`pstchip.dat`、`pstxnet.dat` 三檔時，SHALL 對該專案啟用 netlist 工具；否則 SHALL 不提供 netlist 工具（僅文件查詢可用）。

#### Scenario: Project has a netlist folder
- **WHEN** 專案名為 `100T` 且 `tools/netlist/100T/` 含三個 `.dat` 檔
- **THEN** 該專案的對話中可使用 netlist 工具

#### Scenario: Project has no netlist
- **WHEN** 專案沒有對應的 netlist 資料夾
- **THEN** 該專案不提供 netlist 工具，問答僅使用文件查詢

### Requirement: Structured JSON tool output
`netparse.py` SHALL 對每個查詢命令支援 `--json`，輸出結構化 JSON（而非僅人類可讀文字），供工具回填給 LLM。

#### Scenario: Query with --json
- **WHEN** 以 `--json` 執行任一查詢命令
- **THEN** 輸出為可解析的 JSON，內容對應該命令的查詢結果

### Requirement: Handle large nets and power-pin traces
為避免電源/地或超大 net 造成輸出爆量，系統 SHALL 對節點數超過門檻的查詢結果**截斷並附摘要**（總節點數、依零件前綴的統計、列出前 N 個），並讓 LLM 可在需要時要求完整列表。當 `trace` 的起點為電源/地腳位時，系統 SHALL 回傳警告與建議（改查該 net 或換腳），而非展開大量路徑。判斷電源/地 SHALL 以名稱樣式（如 VDD/VCC/GND/VSS）為主、節點數門檻為輔。

#### Scenario: Query a large power net
- **WHEN** 查詢的 net 節點數超過門檻（如電源網）
- **THEN** 回傳截斷後的前 N 個節點與摘要統計，並標示總數

#### Scenario: Trace starting from a power pin
- **WHEN** `trace` 的起點腳位屬於電源/地網
- **THEN** 回傳警告與建議（改查 net 或選其他腳位），不展開大量路徑
