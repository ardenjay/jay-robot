## Context

[public/index.html](../../../public/index.html) 的 `selectFile()` 在選檔時呼叫 `detectPhase(file.name)`，並 `if (autoPhase) phase-select.value = autoPhase`——只在「偵測到代碼」時設值，偵測不到時**不動**下拉，於是沿用上一個檔的殘留值。`checkUploadReady()` 只看 `selectedFile && phase` 是否都有值，因此殘留 phase 會讓上傳鈕在使用者沒主動選 phase 的情況下仍可按。

## Goals / Non-Goals

**Goals:** 選新檔時，偵測不到代碼就清空 phase，逼使用者明確選擇；有代碼則照常帶入。

**Non-Goals:** 不改後端、不改自動偵測的代碼規則、不動其他上傳流程。

## Decisions

### 在 selectFile 中改為「偵測到就設值，偵測不到就清空」
把 `if (autoPhase) phaseSelect.value = autoPhase;` 改成 `phaseSelect.value = autoPhase || '';`，並接著 `checkUploadReady()`（既有）讓上傳鈕狀態同步更新。

- **為何**：最小修改即對齊 spec「無代碼 → 未選」；清空後 `checkUploadReady` 會把鈕停用，行為自洽。
- **替代方案**：在 `checkUploadReady` 另做檢查 → 多餘，根因是 selectFile 沒重設值。

## Risks / Trade-offs

- **[使用者連續選同階段多檔，需重複選 phase]** → 可接受；正確性（不誤歸 phase）優先於少點一下。檔名有代碼者仍自動帶入，不受影響。
