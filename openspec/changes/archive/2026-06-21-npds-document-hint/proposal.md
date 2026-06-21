## Why

目前當 LLM 無法從已上傳文件中找到答案時，只會模糊地提示「請補傳 C4 階段文件」，使用者不知道具體要上傳哪一份。現在使用者提供了完整的 NPDS 文件目錄（C101–C799，共約 89 份），系統應能精確指出「請上傳 C471 EMI & EMC 認證報告（C4 DVT 試作）」這樣的具體提示。

## What Changes

- 新增 `src/config/npds-catalog.js`：儲存 NPDS 完整文件目錄（C1–C7，每份文件含代碼、名稱、說明）
- 更新 `src/services/retrieval.js`：將文件目錄注入 LLM system prompt，讓 LLM 在無法回答時能根據問題內容從目錄中識別並指名具體文件

## Capabilities

### New Capabilities

無（此為現有 `missing-document-hint` capability 的精化，不新增 capability）

### Modified Capabilities

- `missing-document-hint`：提示內容從「請補傳 Cx 階段文件」升級為「請上傳 [代碼] [文件名稱]（[階段]）」，LLM 需根據問題語義從 NPDS 目錄中識別最相關文件

## Impact

- 新增 `src/config/npds-catalog.js`（無 runtime 依賴，pure JS 常數）
- `src/services/retrieval.js`：`buildPrompt()` 加入 NPDS 目錄文字區塊，prompt 長度增加約 3,000–4,000 tokens
- 無 API 介面變更、無資料庫 schema 異動
