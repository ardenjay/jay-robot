# Detect netlist_find (and all tool) misses so document fallback fires

## Why

`fix-netlist-miss-fallback` 讓「用了 netlist 但全 miss、又沒查文件」時強制代跑一次 `search_documents`。但 miss 偵測寫死成 `result.found === false`，而各 netlist 工具的「查無」回傳結構不一致：

- `netlist_net` / `netlist_part` / `netlist_pin` / `netlist_trace` → `{ found: false }`
- `netlist_find` → `{ count: 0, hits: [] }`（**沒有 `found` 欄位**）
- `netlist_info` → 總覽資料（無 miss 概念）

因此 `netlist_find` 查無時偵測不到 miss，fallback 不觸發。實測失敗案例：「Thor 載板的乙太網路 RJ45 連接器編號是哪個?」——模型 `netlist_find({keyword:'RJ45'})` 查無（count:0），直接回「未找到」，沒 fallback 去查文件，但答案就在 C208「RJ45 connector (J85)」。

## What Changes

- 在 `netlist.js` 新增並導出 `isNetlistMiss(r)`，統一判斷各工具的查無：工具錯誤（`!ok`）、`found === false`、或 `count === 0` 皆為 miss；`netlist_info` 這類無 found/count 的不算 miss。
- `retrieval.js` 的 miss 計數改用 `isNetlistMiss(r)`，取代原本寫死的 `result.found === false`。

## Impact

- Affected specs: `rag-query`（強制檢索 guard 的 netlist-miss 判定涵蓋所有工具回傳結構）
- Affected code: `src/services/netlist.js`（新增 helper）、`src/services/retrieval.js`（改用 helper）
