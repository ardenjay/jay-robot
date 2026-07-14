## 1. 純函式核心（scripts/lib/migrate-core.js）

- [x] 1.1 `parseTarget(spec)`：驗證 `user@host` 格式；`buildRsyncArgs(remote, srcRel, destRel, opts)`：組完整 rsync 參數，**來源結尾斜線在此強制補上**，支援 `-n`（dry-run）與 `--stats`
- [x] 1.2 搬運清單常數：`data/` → `data/`、`public/documents/` → `public/documents/`、`tools/netlist/`（只含專案子目錄、排除 `*.py`）→ `tools/netlist/`
- [x] 1.3 `checkDocsLayout(docsRoot)`：第一層含 `documents` 子目錄 → 回傳巢狀錯誤與 `mv` 修復指令
- [x] 1.4 `expectedDim(env)`：由 `LLM_ADAPTER`／`OLLAMA_EMBED_MODEL` 推預期維度（gemini→3072、bge-m3→1024、其他→null 不檢查）

## 2. CLI 主體（scripts/migrate.js）

- [x] 2.1 參數解析（`parseArgs`）：`<user@host>`、`--path`、`--dry-run`、`--stop-remote`、`--skip-netlist`；沿用 `die()` 慣例
- [x] 2.2 前置檢查：ssh 探測 + 遠端路徑存在（不存在提示 `--path`）；`pgrep` 偵測遠端 server → 無 `--stop-remote` 即中止，有則 `pkill` 並記錄「結束時提醒重啟」
- [x] 2.3 本機 `data/` 備份為 `data.bak-<timestamp>/`，再依清單逐項 spawn rsync（stdio 繼承顯示進度）
- [x] 2.4 後置驗證與摘要：`checkDocsLayout`、讀 DB 首筆 chunk 維度比對 `expectedDim` 給 reembed 提示、解析 `--stats` 印各目錄傳輸摘要與備份位置

## 3. 測試（tests/migrate.test.js）

- [x] 3.1 `buildRsyncArgs`：來源必有結尾斜線、`-n` 傳遞、netlist 排除規則；`parseTarget` 合法／非法格式
- [x] 3.2 `checkDocsLayout`：tmpdir 假檔案樹——正常（UUID 目錄）通過、巢狀 `documents/` 報錯含修復指令
- [x] 3.3 `expectedDim`：gemini／ollama+bge-m3／未知模型三種 env 組合
- [x] 3.4 test script 加入新檔，跑全套測試

## 4. 端到端驗證與文件

- [ ] 4.1 `--dry-run` 對真實來源機（或 localhost 自連）跑一次，確認計畫輸出與前置檢查正確
- [x] 4.2 更新 Obsidian 筆記 [[cb-migrate-data]]：改為以工具搬運為主，手動 rsync 降為附錄（遵守 vault 備份規則）
