## Purpose

TBD — Chat UI capability for the markdown-rag-chatbot. Provides a single-page web interface for uploading Markdown files and interacting with the RAG-powered chatbot.

## Requirements

### Requirement: Markdown file upload interface
UI SHALL 提供文件上傳區，讓用戶可選取或拖曳 `.md` / `.pdf` 檔案並送出，上傳後顯示處理結果。選取檔案後，UI SHALL 嘗試從檔名自動預填 phase 下拉選單；User 可在送出前修改。

#### Scenario: Upload file and show result
- **WHEN** 用戶選取 `.md` 或 `.pdf` 檔案並點擊上傳
- **THEN** UI 顯示上傳中狀態，完成後顯示「已處理 N 個段落」訊息

#### Scenario: Auto-fill phase from filename
- **WHEN** 用戶選取的檔案名稱含 NPDS 文件代碼（如 `C303_spec.md`）
- **THEN** phase 下拉選單自動預選對應階段（如 C3）

#### Scenario: Upload error
- **WHEN** 上傳失敗（格式錯誤或伺服器錯誤）
- **THEN** UI 顯示具體錯誤訊息，不清除已輸入內容

### Requirement: Chat interface with streaming display
UI SHALL 提供對話輸入框，用戶輸入問題後 SHALL 即時串流顯示 LLM 回答。助手回答 SHALL 以 **Markdown 渲染**呈現（粗體、項目清單、標題、程式碼、連結等），而非顯示原始 Markdown 符號；渲染於瀏覽器端以本機提供的 marked 函式庫完成。使用者輸入的問題泡泡 SHALL 維持純文字、不做 Markdown 渲染。

#### Scenario: Submit question and stream answer
- **WHEN** 用戶在輸入框輸入問題並按 Enter 或點擊送出
- **THEN** 回答區即時顯示生成中的文字，完成後停止更新

#### Scenario: Answer rendered as Markdown
- **WHEN** LLM 回答包含 Markdown 語法（如 `**粗體**`、`*` 項目清單、標題）
- **THEN** 回答泡泡顯示對應的格式化結果（粗體、清單、標題），不顯示原始 `**`、`*` 等符號

#### Scenario: Streaming renders progressively
- **WHEN** 回答以 token 串流逐步抵達
- **THEN** 回答泡泡隨累積的 Markdown 逐步重新渲染，最終呈現完整格式化內容

#### Scenario: User question is not rendered as Markdown
- **WHEN** 用戶送出的問題文字含有 Markdown 符號
- **THEN** 問題泡泡以純文字原樣顯示，不被解析為 Markdown

### Requirement: Generating indicator while waiting for answer
送出問題後，assistant 泡泡 SHALL 立即顯示動態生成中指示（動畫 + 階段文字），直到第一個答案 token 抵達才移除並開始渲染答案；錯誤或串流結束時亦 SHALL 移除（不留殘影）。階段文字 SHALL 由 SSE 事件驅動：初始為「思考中」，收到工具事件時顯示該工具的人話名稱（如 `search_documents`→「搜尋文件」、`netlist_*`→「查電路」），工具事件處理後顯示「整理答案中」。

#### Scenario: Indicator appears immediately on submit
- **WHEN** 使用者送出問題
- **THEN** assistant 泡泡立即出現動態指示與「思考中」文字，畫面不再是空白泡泡

#### Scenario: Stage text follows tool events
- **WHEN** SSE 收到 `tool` 事件（如 `search_documents`）
- **THEN** 指示文字切換為對應人話名稱（「查詢中：搜尋文件」），之後切為「整理答案中」

#### Scenario: Indicator removed when answer arrives
- **WHEN** 第一個 `token` 事件抵達
- **THEN** 指示器移除，泡泡開始顯示渲染後的答案

#### Scenario: Indicator removed on error or abnormal end
- **WHEN** SSE 回傳 `error` 事件、或連線中斷／`[DONE]` 而無任何 token
- **THEN** 指示器移除，不殘留動畫

#### Scenario: Submit while previous response is streaming
- **WHEN** 用戶在上一個回答尚未完成時送出新問題
- **THEN** 前一個串流被中斷，開始處理新問題

### Requirement: Source citations display
UI SHALL 在每個回答下方顯示所引用的來源文件連結列表。每個來源 SHALL 渲染為可點擊的 `<a target="_blank">` 超連結，點擊後在新分頁開啟對應原始文件。

#### Scenario: Answer with sources
- **WHEN** LLM 回答完成且 sources 列表非空
- **THEN** 回答下方出現「來源：」區塊，列出來源文件的可點擊連結（顯示 docId，href 為 url）

#### Scenario: No relevant sources found
- **WHEN** 資料庫為空或無相關 chunks
- **THEN** 來源區塊顯示「無相關文件」

#### Scenario: LLM reports no answer
- **WHEN** sources 列表為空陣列（LLM 無法回答）
- **THEN** 來源區塊不顯示任何連結

### Requirement: Single-page application
UI SHALL 為單一 HTML 頁面，無需頁面跳轉，所有功能在同一畫面完成。

#### Scenario: Page load
- **WHEN** 用戶開啟 `http://localhost:3000`
- **THEN** 頁面呈現上傳區與對話區，無需任何登入或設定

### Requirement: Move document phase in document tree
文件樹中每個文件 SHALL 提供移動階段按鈕，點擊後顯示 C1–C7 選擇器（當前 phase 預選），選完後呼叫 PATCH API 並重新載入文件樹。

#### Scenario: User moves document to another phase
- **WHEN** 用戶在文件樹中點擊某文件的移動階段按鈕並選擇新 phase
- **THEN** 系統呼叫 PATCH API，成功後文件出現在新 phase 的分組下

#### Scenario: User cancels phase move
- **WHEN** 用戶點擊移動階段按鈕後按 Escape 或點擊取消
- **THEN** phase 不變，文件樹保持原狀

### Requirement: Navigate between project list and project detail
UI SHALL 提供專案列表頁與專案內頁兩個視圖。進入某專案內頁時，標題列 SHALL 顯示「返回專案列表」按鈕；點擊後 SHALL 回到專案列表頁，供使用者新建或切換專案。位於專案列表頁時，該返回按鈕 SHALL 隱藏。

#### Scenario: Back button visible in project detail
- **WHEN** 使用者進入某專案內頁（`#/projects/<id>`）
- **THEN** 標題列顯示「返回專案列表」按鈕

#### Scenario: Back button returns to project list
- **WHEN** 使用者在專案內頁點擊「返回專案列表」按鈕
- **THEN** 畫面切換回專案列表頁，可見建立專案表單與既有專案清單

#### Scenario: Back button hidden on project list
- **WHEN** 使用者位於專案列表頁
- **THEN** 返回按鈕不顯示

### Requirement: Display tool-call progress
聊天介面 SHALL 在助手回答過程中顯示工具呼叫進度：收到工具進度事件時，UI SHALL 呈現正在呼叫哪個工具（如「🔧 正在查 trace(U42.4)…」），讓使用者看到答案的依據；最終答案仍以 Markdown 逐字渲染。

#### Scenario: Show tool calls during answering
- **WHEN** 助手在生成過程中呼叫一個或多個工具
- **THEN** UI 依序顯示各工具呼叫的進度提示

#### Scenario: Final answer after tools
- **WHEN** 工具呼叫完成、LLM 開始輸出最終答案
- **THEN** UI 接續以 Markdown 逐字渲染最終答案（工具進度可保留為過程記錄）

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

### Requirement: Sidebar width is user-resizable
專案詳情頁側欄與聊天區之間 SHALL 提供拖拉把手,即時調整側欄寬度(下限 200px、上限視窗寬一半);寬度 SHALL 記憶於 localStorage,重新載入後套用。

#### Scenario: 拖拉調寬
- **WHEN** 使用者拖動側欄右緣把手
- **THEN** 側欄寬度即時跟隨,長檔名得以完整顯示

#### Scenario: 寬度記憶
- **WHEN** 調整寬度後重新整理頁面
- **THEN** 側欄維持調整後的寬度
