## Context

這個 app 是一個 Express（commonjs）伺服器，前端為單一 `public/index.html`。寫入操作分散在三個路由模組：`upload.js`（上傳）、`projects.js`（新建專案、刪除文件、搬移 phase），讀取與問答則是 `chat.js` 與 `projects.js` 的 GET。目前沒有任何存取控制，任何能連到站台的人都能寫入。

需求是把同一份 code 分享給其他人時切成唯讀，避免他人亂上傳/刪除/修改，但管理者自己仍能用完整功能。本機已規劃以 systemd 部署，env 可由 unit 檔注入。

## Goals / Non-Goals

**Goals:**
- 用單一環境變數 `READ_ONLY` 在「完整」與「唯讀」之間切換，同一份 code 兩用。
- 後端強制阻擋所有寫入路由（真正的安全邊界），無法靠 `curl` 繞過。
- 前端依模式隱藏寫入入口（體驗），問答與讀取不受影響。
- 預設行為（未設 `READ_ONLY`）與現況完全相同，零 breaking change。

**Non-Goals:**
- 不做使用者帳號 / 登入 / 角色權限系統（唯讀是站台層級的單一開關，非 per-user）。
- 不做細粒度授權（例如某些人可上傳某些不行）。
- 不處理網路層存取控制（TLS、防火牆、反向代理 auth）——那是部署層的事，與本功能正交。

## Decisions

### 決策 1：用一個共用的 read-only 阻擋 middleware，掛在寫入路由上
新增一個小 middleware（例如 `src/middleware/readOnly.js` 匯出 `blockWhenReadOnly`）：當 `process.env.READ_ONLY === 'true'` 時 `res.status(403).json({ error: ... })`，否則 `next()`。把它掛在四個寫入 handler 之前。

- **為何**：集中一處判斷，四個路由共用同一邏輯，日後新增寫入路由只要記得掛上即可。
- **替代方案**：在每個 handler 內各自 `if` 判斷 → 重複、易漏。或用全域 middleware 依 method/path 比對 → 比對字串脆弱、容易誤擋讀取路由。明確掛在指定 handler 前最清楚。
- **掛載位置**：`upload.js` 掛在 `upload.single('file')` **之前**，確保唯讀時連 multer 都不接收檔案、不寫入 `uploads/`。

### 決策 2：以 `=== 'true'` 嚴格比對
只有字串 `"true"` 啟用唯讀；其他值（含未設定、空字串、`"false"`、`"1"`）一律視為一般模式。

- **為何**：行為可預測，且未設定時 = 一般模式 = 與現況相同，確保零 breaking change。

### 決策 3：新增 `GET /api/config` 給前端讀模式
回傳 `{ readOnly: process.env.READ_ONLY === 'true' }`。前端在初始化時 fetch 一次，存成旗標再決定要不要 render 寫入 UI。

- **為何**：前端不該硬編模式；用一個端點讓「一份 HTML、兩種模式」自然成立。
- **替代方案**：把旗標直接內嵌進 HTML（server-side render）→ 這個 app 是純靜態 `index.html`，沒有樣板引擎，加端點比改成動態渲染簡單。

### 決策 4：前端隱藏採「render 前判斷」而非 CSS 蓋掉
讀到 `readOnly` 後，在建立上傳區、檔案的刪除/搬移按鈕、新建專案入口的程式碼路徑上直接略過（或設 `display:none`）。

- **為何**：避免使用者用 devtools 把隱藏的按鈕點回來——雖然後端已經擋，前端少 render 也乾淨。後端 403 才是安全保證，前端只是少給入口。

## Risks / Trade-offs

- **[只藏前端會被繞過]** → 後端 middleware 才是安全邊界；spec 明確要求「直接 API 呼叫仍回 403」並列為驗收情境。
- **[漏掛 middleware 在未來新增的寫入路由]** → 在 design 與 tasks 註明「新增寫入路由必須掛 blockWhenReadOnly」；測試涵蓋四個現有路由。
- **[誤把讀取/問答也擋掉]** → middleware 只掛在四個寫入 handler，不掛在 chat 與 GET；加測試確認唯讀模式下 `POST /api/chat` 與 GET 仍 200。
- **[env 拼字錯誤導致沒生效]** → 嚴格 `=== 'true'`，並在 README/部署說明標明 `READ_ONLY=true`；`GET /api/config` 可即時驗證目前模式。

## Migration Plan

1. 合併後預設 `READ_ONLY` 未設定 → 所有既有部署行為不變。
2. 要分享的 instance（systemd unit）加 `Environment=READ_ONLY=true` 後重啟即生效。
3. 回滾：移除該 env 變數並重啟，即恢復完整功能；無資料遷移、無 schema 變更。
