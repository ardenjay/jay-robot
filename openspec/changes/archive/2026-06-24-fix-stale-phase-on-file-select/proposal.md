## Why

上傳前的 phase 自動偵測有個殘留值的坑：選檔時若檔名含 NPDS 代碼會自動帶入 phase，但**選下一個檔名沒有代碼的檔案時，下拉的舊值不會被清掉**。結果是——先選 `C455_xxx`（帶入 C4）、再選沒有代碼的 `EAR-100T_DS.pdf`，phase 仍殘留 C4，上傳鈕照樣可按，檔案就被默默歸到錯的 phase。使用者以為「沒填 phase」，其實是沿用了上一個檔的值。

## What Changes

- 修正 [public/index.html](../../../public/index.html) 的 `selectFile()`：選新檔時，偵測不到 NPDS 代碼就**清空** phase 下拉（而非保留上一次的值），逼使用者明確選擇。
- 行為對齊既有 spec「檔名不含 NPDS 代碼 → phase 維持未選、須手動選取」。

## Capabilities

### New Capabilities
<!-- 無 -->

### Modified Capabilities
- `document-ingestion`: 釐清/強化 phase 自動偵測——選新檔且檔名無代碼時，須清除先前自動帶入的 phase，不得沿用殘留值。

## Impact

- **修改**：`public/index.html`（`selectFile()` 內 phase 偵測邏輯，約一行）。
- **無後端改動**：後端本就要求合法 phase；此為前端 UX 修正。
- **無 breaking change**：檔名有代碼時行為不變（照樣自動帶入）。
