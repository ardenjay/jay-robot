## ADDED Requirements

### Requirement: Phase auto-detection does not retain a stale selection

上傳前的 phase 自動偵測 SHALL 在每次選取新檔時，依該檔名重新決定 phase：檔名含 NPDS 代碼則自動帶入對應 phase；檔名**不含**可辨識代碼時，SHALL 清空 phase 下拉，使其回到「未選」狀態，不得沿用先前所選檔案殘留的 phase 值。如此檔名無代碼時，使用者必須明確選擇 phase，上傳鈕在 phase 未選時 SHALL 維持停用。

#### Scenario: Newly selected file without code clears previous phase
- **WHEN** 使用者先選了檔名含代碼的檔案（phase 自動帶入，如 C4），接著選取一個檔名不含 NPDS 代碼的檔案
- **THEN** phase 下拉被清空為未選狀態，且上傳鈕停用，直到使用者手動選擇 phase

#### Scenario: Newly selected file with code updates phase
- **WHEN** 使用者選取檔名含 NPDS 代碼的檔案（不論先前下拉為何值）
- **THEN** phase 下拉更新為該檔名對應的 phase
