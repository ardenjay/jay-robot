## ADDED Requirements

### Requirement: Rename document
系統 SHALL 提供 `PATCH /api/projects/:id/documents/:docId/rename`(body `{newDocId}`)就地改名:同一交易更新該文件所有 chunks 的 `doc_id` 與 FTS 索引列,並將持久化檔案/資料夾 `fs.rename` 至新名(磁碟來源不存在時僅更新 DB)。newDocId SHALL 驗證非空且不含 `/`、`\`、`..`;與其他既有 docId 重複或目標持久化路徑已存在 SHALL 回 409;文件不存在回 404;唯讀模式回 403。改名 SHALL NOT 觸發重新 embedding 或重灌。

#### Scenario: 改名成功
- **WHEN** 對「C208 DataSheet」PATCH `{newDocId: "C208 Jetson Thor SoC Data Sheet"}`
- **THEN** 回 200;文件樹顯示新名、來源檢視與下載以新名可用、以新檔名關鍵字提問可命中該文件 chunks,舊名搜不到

#### Scenario: 名稱衝突
- **WHEN** newDocId 與專案內另一份文件相同
- **THEN** 回 409,資料不變

#### Scenario: 非法名稱
- **WHEN** newDocId 為空白或含 `/`、`\`、`..`
- **THEN** 回 400

#### Scenario: 唯讀模式
- **WHEN** `READ_ONLY=1` 時呼叫 rename
- **THEN** 回 403

#### Scenario: 改名入口(UI)
- **WHEN** 管理模式下滑過文件樹的文件列
- **THEN** 顯示改名按鈕(與刪除/搬階段同排),點擊以預填舊名的輸入框改名,成功後樹即時更新;唯讀模式不顯示
