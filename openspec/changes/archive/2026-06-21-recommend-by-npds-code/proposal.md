## Why

當 RAG 查詢無法完整回答時，系統會請 LLM 從 NPDS 文件目錄建議使用者上傳相關文件。但目前 prompt 完全沒有告訴 LLM「哪些文件已經上傳」，因此即使使用者已上傳 C560，系統仍會建議「請上傳 C560」。

根因：文件以**檔名**作為識別（`docId = filename`），而建議邏輯由 LLM 依目錄產生，兩者之間沒有任何「已上傳」資訊串接。使用者實務上以 **NPDS 編號**（如 C560）為文件身分，檔名只是外觀，不應影響判斷。

## What Changes

- RAG 查詢時，從該專案已上傳文件解析出 **NPDS 編號集合**（由 `docId` / 檔名以正則擷取，如 `C560`、`C3081`），編號比對不分大小寫
- 將這些已上傳編號**從注入 prompt 的 NPDS 文件目錄中移除**——LLM 看不到已上傳的編號，自然不會建議使用者重複上傳
- 識別以**編號為主、檔名不重要**：只要編號相同即視為已上傳，無論檔名為何
- 不改變既有「找不到答案時建議具體文件」的行為，只是讓建議來源（目錄）排除已上傳的編號
- 上傳越多文件、目錄越短，比「另外附上一份已上傳清單」更省 token

## Capabilities

### New Capabilities

無

### Modified Capabilities

- `missing-document-hint`：缺漏文件提示新增「排除已上傳編號」的規則——以 NPDS 編號（而非檔名）判定文件是否已上傳，已上傳的編號從注入 prompt 的目錄中移除，不再可能被建議

## Impact

- `src/services/retrieval.js`：`answer()` 查詢已上傳文件、擷取編號集合，傳給 `formatCatalogForPrompt`
- `src/config/npds-catalog.js`：`formatCatalogForPrompt(excludeCodes)` 新增可選參數，輸出時濾掉已上傳編號的項目
- 可能新增小型工具函式（從檔名擷取 NPDS 編號），供 retrieval 使用
- 無 API 介面變更（chat request / response 結構不變）
- 無資料庫 schema 異動（沿用既有 `listDocuments`）
