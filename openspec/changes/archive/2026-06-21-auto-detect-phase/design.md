## Context

NPDS 文件代碼規則：`C[1-7]\d{2,}`，首個數字即為階段（C**1**01 → C1，C**3**03 → C3）。檔名通常含此代碼（如 `C303_ProductSpec.md`、`EAR-100T7_C401.pdf`）。NPDS 目錄中的代碼已在 `npds-catalog.js` 完整列出，但 phase 偵測只需正則即可，不需查表。

Vector store 的 `chunks` 表已有 `phase` 欄位，`movePhase` 只需一條 UPDATE。

## Goals / Non-Goals

**Goals:**
- 選檔後自動從檔名解析並預選 phase（純前端）
- 文件樹提供移動階段按鈕，呼叫後端 PATCH 後重新載入文件樹
- Phase 移動更新 SQLite 所有相關 chunks 的 phase 欄位

**Non-Goals:**
- 使用 LLM 或內容分析做 phase 偵測（檔名解析已夠，且零成本）
- 移動後同步更新 `public/documents/` 的目錄結構（文件仍存在原 projectId 目錄下，路徑不含 phase）
- 批次移動多個文件

## Decisions

**D1: Phase 偵測純前端、純檔名正則**

```js
function detectPhase(filename) {
  const m = filename.match(/C([1-7])\d{2}/i);
  return m ? `C${m[1]}` : null;
}
```

偵測不到時，phase 下拉維持未選（或保持現有預設值），User 手動選。不呼叫後端，無延遲。

**D2: 移動階段 UI — 文件樹 inline select**

點「移動階段」按鈕後，在該行顯示 `<select>` 含 C1–C7 選項（目前 phase 預選），選完後呼叫 PATCH，不需 confirm dialog（操作可重做）。PATCH 成功後重新載入文件樹。

**D3: PATCH body 傳 `{ phase }`，docId 在路徑**

與現有 DELETE 路由格式一致：`PATCH /api/projects/:id/documents/:docId/phase`，body `{ phase: "C2" }`。

**D4: movePhase 直接 UPDATE，不刪除重建**

```sql
UPDATE chunks SET phase = ? WHERE doc_id = ? AND project_id = ?
```

比刪除重建快，且 embedding 不需重算。

## Risks / Trade-offs

- [檔名不含 NPDS 代碼] → 偵測不到，phase 保持空選，User 手動選，行為與現在相同。
- [移動階段後文件樹更新] → `loadDocTree()` 已封裝，PATCH 後直接呼叫即可，無需額外狀態管理。
