# Force a document search before accepting a give-up answer

## Why

含連接器編號（如 CN1）的問題會被路由到 netlist。若 netlist 的某次查詢命中（CN1 是實體 connector，`netlist_part('CN1')` found:true）、但模型仍答不出使用者要的功能描述，就可能吐「無法在提供的資料中找到…」放棄——**而它整段從沒查過文件**。現有強制檢索 guard 只在「零工具」或「netlist **全** miss」時觸發；netlist 有任一命中就不觸發，於是這種「部分命中卻放棄、又沒查文件」的情況漏接。

實測失敗：「EAR-100T 主機板的 CN1 和 GMSL board 的 CN1 分別是接什麼?」——模型 `netlist_part('CN1')`(命中) → `netlist_find('GMSL board')`(miss) → 放棄。但答案（主機板 CN1=19~36V、GMSL CN1=12V）明明在 C455 UM 表格裡，文件檢索的 rerank top5 同時撈到兩個 CN1 描述。

## What Changes

- 擴大強制檢索 guard：模型要產生最終回答、專案有文件、整段從未查過文件時，若最終答案是「放棄語」（含系統指定的 NO_ANSWER 片語前綴「無法在提供的資料中找到」），SHALL 代跑一次 `search_documents` 讓模型依文件重答。原有「零工具」「netlist 全 miss」觸發條件不變；仍最多強制一次。

## Impact

- Affected specs: `rag-query`
- Affected code: `src/services/retrieval.js`（`shouldForceDocSearch` 增 `givingUp` 條件）
- 低風險：只在「答案含放棄語 且 從未查文件」時多觸發一次檢索；正確答案不含放棄語、已查過文件者不受影響，也不會無限迴圈（強制後 forcedSearch 為真）。
