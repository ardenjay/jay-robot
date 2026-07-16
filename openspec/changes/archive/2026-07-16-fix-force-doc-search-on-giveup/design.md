# Design: force doc search on give-up

## Context

`shouldForceDocSearch({ hasDocs, usedDocSearch, forcedSearch, usedAnyTool, netlistCalls, netlistMisses })` 目前在「零工具」或「netlist 全 miss」時回 true。缺口：netlist 有任一命中（`allNetlistMissed=false`）但模型仍放棄、且從未查文件時，不觸發。

## Decisions

### 以「放棄語」作為額外觸發訊號

system prompt 指示模型答不出時說固定片語 `無法在提供的資料中找到答案`。模型實際放棄時會用這個片語或其前綴（實測：「無法在提供的資料中找到與 GMSL board 相關的零件資訊」）。因此用**前綴** `無法在提供的資料中找到` 當放棄訊號——這是系統自己教模型講的話，誤判率低（正確答案不會含它）。

`shouldForceDocSearch` 增參數 `givingUp`（呼叫端以 `finalText.includes('無法在提供的資料中找到')` 計算）：

```js
function shouldForceDocSearch({ hasDocs, usedDocSearch, forcedSearch, usedAnyTool, netlistCalls, netlistMisses, givingUp }) {
  if (!hasDocs || usedDocSearch || forcedSearch) return false;
  const allNetlistMissed = netlistCalls > 0 && netlistMisses === netlistCalls;
  return !usedAnyTool || allNetlistMissed || !!givingUp;
}
```

呼叫端在模型產生最終回答（無 function calls）時，先算 `final = text`，再以 `givingUp: final.includes(NO_ANSWER_GIVEUP_PREFIX)` 呼叫。

### 為何用前綴而非完整片語比對

完整片語 `...找到答案` 太嚴，模型放棄時常改寫尾巴（「…找到與X相關的資訊」）。取共同前綴 `無法在提供的資料中找到` 才抓得到這些變體，同時仍是「系統指定放棄語」的一部分，不會誤中正常答案。

## Risks / Trade-offs

- **誤觸發**：只有答案含放棄語前綴才會多查一次；正確答案不含它。且 `!usedDocSearch` 前提保證只在「從沒查過文件」時介入，已查過仍放棄則接受（避免迴圈）。
- **延遲**：放棄的問題本來就要再給答案，多一次檢索划算。
- 沿用「最多強制一次」語意（`forcedSearch` 旗標），不會無限迴圈。

## Migration

無資料/schema 遷移。
