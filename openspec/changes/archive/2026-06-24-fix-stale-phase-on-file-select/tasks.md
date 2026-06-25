## 1. 修正前端 phase 殘留

- [x] 1.1 `public/index.html` 的 `selectFile()`：將 `if (autoPhase) phaseSelect.value = autoPhase;` 改為 `phaseSelect.value = autoPhase || '';`（偵測不到代碼即清空）
- [x] 1.2 確認清空後呼叫 `checkUploadReady()`，使上傳鈕在 phase 未選時停用

## 2. 驗收

- [ ] 2.1 手動驗收：先選含代碼檔（phase 自動帶入）→ 再選無代碼檔 → phase 變回未選、上傳鈕停用
- [ ] 2.2 回歸：選含代碼檔仍自動帶入正確 phase；手動選 phase 後仍可正常上傳
