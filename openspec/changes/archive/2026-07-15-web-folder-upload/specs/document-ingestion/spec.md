## ADDED Requirements

### Requirement: Ingest a folder via web upload
系統 SHALL 提供 `POST /api/upload/folder` 接收整個資料夾(多檔 multipart `files` + 同序相對路徑欄位 `paths`),檔案副檔名 SHALL 限白名單(md/pdf/常見圖檔),違規即整批 400 並列出檔名;同名 docId 已存在且未帶 `overwrite=true` SHALL 回 409;於暫存區重建目錄結構後以既有 `ingestFolder` 進料 — docId = 資料夾名、頂層須恰好一個 PDF、至少一個 md、子資料夾(附件圖)結構保留、重灌同 docId 整夾替換,規則與 CLI 進料完全一致。phase 取自請求欄位,未提供時 SHALL 嘗試由資料夾名的 NPDS 代碼推得,皆無則回 400。唯讀模式 SHALL 回 403。完成後暫存 SHALL 清理。

#### Scenario: 成功進料
- **WHEN** 上傳含 `note.md`、`doc.pdf`、`附件/圖.jpg` 的資料夾「C208 SoC Data Sheet」
- **THEN** 回 200 與 `{docId, mdCount, chunkCount, imageCount}`;文件樹出現該 docId(phase 由名稱推得 C2),來源檢視可顯圖、可下載 PDF

#### Scenario: 缺 PDF 拒收
- **WHEN** 上傳的資料夾頂層沒有 PDF
- **THEN** 回 400 並附「資料夾需含一個 PDF 原始檔」訊息,不留任何持久化殘留

#### Scenario: 路徑穿越擋下
- **WHEN** `paths` 含 `../evil.md` 或絕對路徑
- **THEN** 整批回 400,不寫入任何檔案

#### Scenario: phase 無法解析
- **WHEN** 未選 phase 且資料夾名無 NPDS 代碼
- **THEN** 回 400 要求選擇階段

#### Scenario: 唯讀模式
- **WHEN** `READ_ONLY=1` 時呼叫 `POST /api/upload/folder`
- **THEN** 回 403

#### Scenario: 中文資料夾名
- **WHEN** 上傳資料夾名為中文(multipart 欄位可能被 latin1 誤解)
- **THEN** docId 與持久化路徑為正確 UTF-8(沿用 fixLatin1Mojibake)

#### Scenario: 不合法檔案直接報錯
- **WHEN** 資料夾內含 `.DS_Store` 或 `notes.txt` 等白名單外的檔案
- **THEN** 回 400 並列出不合法檔名,整批不進料

#### Scenario: 同名 docId 覆蓋確認
- **WHEN** 上傳的資料夾名與既有 docId 相同且未帶 `overwrite=true`
- **THEN** 回 409 與該 docId;帶 `overwrite=true` 重送則整夾替換(沿用重灌語意)
