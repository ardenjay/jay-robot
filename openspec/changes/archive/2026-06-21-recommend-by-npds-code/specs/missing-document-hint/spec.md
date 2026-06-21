## ADDED Requirements

### Requirement: Exclude already-uploaded documents by NPDS code
系統 SHALL 在 RAG 查詢時，從該專案已上傳文件的識別（檔名 / `docId`）解析出 NPDS 編號集合，並在組裝注入 LLM prompt 的 NPDS 文件目錄時**移除這些已上傳編號的項目**，使 LLM 無從建議使用者重複上傳。文件以 **NPDS 編號**為身分判定（編號相同即視為已上傳），不分大小寫，且與檔名其餘部分無關。

#### Scenario: Uploaded code is not recommended again
- **WHEN** 專案已上傳一份檔名含 `C560` 的文件，使用者詢問需要 C560 的問題但 chunks 不足以回答
- **THEN** LLM 回答中不再建議上傳 C560（因 C560 已在已上傳編號清單中）

#### Scenario: Same code different filename counts as uploaded
- **WHEN** 已上傳文件的檔名與目錄中該編號的標準名稱不同，但編號同為 `C560`
- **THEN** 系統仍視 C560 為已上傳，不建議再次上傳

#### Scenario: Missing code is still recommended
- **WHEN** 使用者詢問需要 C602 的問題，且專案尚未上傳任何含 `C602` 編號的文件
- **THEN** LLM 仍正常建議上傳 C602（含代碼、名稱與所屬階段）

#### Scenario: Filename without NPDS code
- **WHEN** 已上傳文件的檔名無法解析出 NPDS 編號
- **THEN** 該文件不納入已上傳編號清單，建議行為與未注入清單時相同（不影響其他編號的判定）

#### Scenario: No documents uploaded yet
- **WHEN** 專案尚無任何已上傳文件
- **THEN** 注入 prompt 的目錄維持完整（無項目被移除），建議行為維持原狀
