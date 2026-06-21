## Context

目前 jay_robot 是單一全域知識庫：所有上傳的文件共用同一個 SQLite `chunks` 表，向量搜尋沒有任何隔離。NPDS 使用場景需要多專案管理，且每個專案的文件按 C1–C7 階段分類，問答時只查詢該專案範圍內的文件。

現有架構：
- `chunks` 表欄位：`id, doc_id, title, text, embedding`
- `vectorStore.search(vector, topK)` 全表掃描
- `ingestFile(filePath, filename, llmAdapter, vectorAdapter)` 無 project 概念
- 前端單頁：上傳區 + 聊天區

## Goals / Non-Goals

**Goals:**
- 支援多專案，每個專案文件互相隔離
- 文件上傳時記錄所屬專案 (`project_id`) 和 NPDS 階段 (`phase`: C1–C7)
- 向量搜尋限縮在指定專案
- UI：專案列表、建立專案、文件樹（C1–C7）、聊天時自動帶入當前專案
- 若查詢時缺少特定階段文件，LLM prompt 中加入提示，讓 LLM 告知使用者補傳

**Non-Goals:**
- 專案權限控管（多使用者）
- C0 階段（Google Sheets 未列出，留待後續）
- 文件刪除功能
- 跨專案搜尋

## Decisions

### 1. 用 `project_id` 欄位隔離，不用多 DB

**決定**：在現有 SQLite 的 `chunks` 表新增 `project_id` 欄位，`search()` 加 WHERE 條件過濾，而非每個專案建立獨立 DB 檔案。

**理由**：單 DB 架構實作最簡單，sql.js 每次載入整個 DB 到記憶體，多 DB 會需要動態切換，複雜度高。NPDS 場景文件量不大，單表效能足夠。

**替代方案**：多 DB 檔案（一專案一檔）→ 動態載入複雜，放棄。

---

### 2. 新增 `projects` 表管理專案

**決定**：在 SQLite 加入 `projects` 表（`id TEXT PRIMARY KEY, name TEXT, created_at TEXT`），`chunks` 表加 `project_id TEXT` 和 `phase TEXT`（C1–C7）。

**理由**：專案 metadata 需要持久化，且未來可能擴充（描述、狀態等）。

---

### 3. `phase` 為 C1–C7 字串，由前端 dropdown 選擇

**決定**：上傳時前端提供 phase 下拉（C1/C2/.../C7），後端只做驗證，不自動偵測。

**理由**：自動偵測檔名或內容判斷 phase 容易出錯，NPDS 使用者清楚自己上傳的是哪個階段。

---

### 4. 缺少文件提示由 LLM prompt 驅動，非硬編碼訊息

**決定**：`retrieval.js` 在組合 prompt 時，檢查當前專案各階段文件是否為空，若有缺失的階段，在 system prompt 中加入一段說明，請 LLM 在無法回答時提示使用者補傳哪個階段。

**理由**：讓 LLM 根據上下文自然地嵌入提示，比前端硬碼判斷更靈活。

---

### 5. 文件樹 API 獨立端點

**決定**：新增 `GET /api/projects/:id/documents` 回傳該專案各 phase 的文件列表，前端組裝樹狀圖。

**理由**：職責分離，前端渲染邏輯不依賴後端 HTML。

## Risks / Trade-offs

- **sql.js schema migration** → 現有 DB 沒有 `project_id` / `phase` 欄位。啟動時執行 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 做平滑遷移，舊資料 project_id 預設為 `default`。
- **前端複雜度上升** → 從單頁增加到多視圖（專案列表、專案詳情、聊天）。用 hash routing（`#/projects`, `#/projects/:id`）在純 Vanilla JS 中實現，不引入框架。
- **sql.js 全表掃描加 WHERE** → sql.js 在記憶體中運行，每次查詢需序列化/反序列化。文件量小（NPDS 單專案 <100 chunks）不是問題，若未來量大需考慮換 better-sqlite3。
