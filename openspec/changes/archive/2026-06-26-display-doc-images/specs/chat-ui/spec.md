## ADDED Requirements

### Requirement: Images render within the answer bubble

當助手答案的 Markdown 含圖片語法（`![](...)`，連結為持久化文件的絕對路徑）時，答案泡泡 SHALL 將其渲染為實際圖片。圖片 SHALL 以受限樣式呈現（如 `max-width:100%`、`height:auto`、區塊顯示），避免大圖溢出或破壞版面。圖片以瀏覽器端 marked 渲染，圖片來源為伺服器靜態服務的 `/documents/<projectId>/<docId>/images/...`。

#### Scenario: Answer containing an image renders it
- **WHEN** 助手答案含 `![](/documents/p1/C560/images/fig1.jpg)`
- **THEN** 答案泡泡顯示該圖片（而非原始 Markdown 文字），且圖片不超出泡泡寬度

#### Scenario: Answer without images is unaffected
- **WHEN** 助手答案不含任何圖片語法
- **THEN** 答案如現況以 Markdown 文字渲染，無任何圖片元素

### Requirement: Source viewer shows document content with images

答案下方「來源」的每個項目 SHALL 可點擊開啟檢視器。點擊時 UI SHALL 向唯讀端點查詢該 docId 的可檢視內容，並依回傳型別分流：當文件有持久化的 Markdown（如資料夾進料的文件）時，SHALL 在頁內檢視器（如 modal）以 marked 渲染其內容，文件內的絕對路徑圖片一併顯示；當文件僅有原始檔（如 web 上傳的 PDF）時，SHALL 維持現行行為，於新分頁開啟原始檔。此端點為 GET 讀取路由，SHALL NOT 受唯讀模式阻擋。

#### Scenario: View a folder-ingested document with images
- **WHEN** 使用者點擊一個有持久化 `.md` 的來源（如資料夾進料的 `C560`）
- **THEN** UI 開啟檢視器，以 marked 渲染該文件 Markdown，且其中的絕對路徑圖片正常顯示

#### Scenario: View a document that only has an original file
- **WHEN** 使用者點擊一個僅有原始檔的來源（如 web 上傳的 `C560.pdf`）
- **THEN** UI 於新分頁開啟該原始檔（fallback，維持現行行為）

#### Scenario: Source viewer endpoint works in read-only mode
- **WHEN** 站台以 `READ_ONLY=true` 運行，使用者點擊來源檢視
- **THEN** 檢視端點正常回傳內容（GET 讀取路由，不被唯讀阻擋）
