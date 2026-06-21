## Why

目前沒有任何測試覆蓋，開發過程中用臨時腳本驗證後即刪除。補上正式的 unit test 套件，讓之後修改核心邏輯時能快速確認沒有 regression。

## What Changes

- 建立 `tests/` 資料夾，放置可直接用 `node` 執行的測試腳本
- 使用 Node.js 內建的 `node:test` + `node:assert`，不需要額外安裝套件
- 新增 `npm test` script，一次執行所有測試
- 涵蓋範圍：Markdown chunker、Vector adapter（含 cosine similarity）、Ingestion pipeline（mock LLM）

## Capabilities

### New Capabilities

- `unit-tests`: 可從 command line 執行的 unit test 套件，覆蓋 chunker、vector adapter、ingestion pipeline

### Modified Capabilities

## Impact

- 新增 `tests/` 資料夾與測試檔案
- `package.json` 新增 `"test": "node --test tests/**/*.test.js"` script
- 無現有程式碼修改，只新增測試
