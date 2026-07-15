# Design: unified netlist miss detection

## Context

`fix-netlist-miss-fallback` 在 `retrieval.js` 工具迴圈裡以
`if (!r.ok || (r.result && r.result.found === false)) netlistMisses++;`
計數 netlist miss。此判斷只涵蓋回傳 `found` 布林的工具，漏掉 `netlist_find`（回 `{count, hits}`）。

各 netlist 工具查無時的實際回傳：

| 工具 | 命中 | 查無 |
| --- | --- | --- |
| netlist_net / part / pin / trace | `found: true` | `found: false` |
| netlist_find | `count: N>0, hits:[...]` | `count: 0, hits: []` |
| netlist_info | `{root, nets, parts, ...}` | 不適用（總覽） |

## Decisions

### 把 miss 判斷收斂成 `isNetlistMiss(r)` 放進 netlist.js

miss 判定本質是「解讀 netlist 工具回傳」，與這些回傳結構同源，放 `netlist.js` 最內聚，也能對真實 netlist 模組單元測試各工具的查無/命中。

```js
function isNetlistMiss(r) {
  if (!r || !r.ok) return true;        // 工具執行錯誤
  const res = r.result || {};
  if (res.found === false) return true; // net/part/pin/trace 查無
  if (res.count === 0) return true;     // find 零命中
  return false;                         // 其餘（含 info 總覽、任何命中）不算 miss
}
```

`retrieval.js` 改為 `if (isNetlistMiss(r)) netlistMisses++;`。

### 為何 info 不算 miss

`netlist_info` 回總覽（nets/parts 數），沒有 found/count 概念，永遠有內容；不該因為它就觸發文件 fallback。它既非 found:false 也非 count:0，自然回 false。

## Risks / Trade-offs

- 判斷加了 `count === 0` 分支：只有 `netlist_find` 用 count，其他工具無此欄位、`=== 0` 為 false，不受影響。
- 保守安全：任何無法判定命中的工具錯誤都算 miss，寧可多觸發一次文件 fallback，不可漏。

## Migration

無資料/schema 遷移。
