## ADDED Requirements

### Requirement: Upload section supports folder selection
上傳區 SHALL 提供「上傳資料夾」入口(瀏覽器原生資料夾選取,`webkitdirectory`),選取後顯示資料夾名與檔數,送出時以 `files` + 同序 `paths`(webkitRelativePath)呼叫 `POST /api/upload/folder`,成功後更新文件樹並顯示 chunk/圖片數。唯讀模式下 SHALL 隨上傳區一併隱藏。

#### Scenario: 選取資料夾並上傳
- **WHEN** 使用者點「上傳資料夾」選取含 md+images+pdf 的資料夾並送出
- **THEN** 顯示進料結果(chunks/圖數),文件樹出現該文件

#### Scenario: 唯讀模式隱藏
- **WHEN** READ_ONLY 模式載入頁面
- **THEN** 資料夾上傳入口與整個上傳區一併隱藏

#### Scenario: 選完即驗,不合格不上傳
- **WHEN** 選取的資料夾缺頂層 PDF、無頂層 md、或含白名單外檔案
- **THEN** 立即顯示具體原因(含違規檔名),不發出上傳請求

#### Scenario: 覆蓋確認
- **WHEN** 伺服器回 409(同名 docId 已存在)
- **THEN** 顯示確認對話「將整夾替換既有文件,確定?」,確認後帶 overwrite 重送,取消則中止
