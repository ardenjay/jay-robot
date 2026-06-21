## Context

上傳流程目前在 `finally` 中刪除原始檔案（`fs.unlinkSync`）。chunks 中的 `docId` 是檔案名稱，但 retrieval 只回傳 chunk titles（小節標題），前端無從得知對應的文件路徑。`express.static` 已服務 `public/`，所以若將檔案放入 `public/documents/`，瀏覽器即可直接存取。

## Goals / Non-Goals

**Goals:**
- 上傳後保留原始檔案（.md 或 .pdf）至 `public/documents/<projectId>/<filename>`
- sources SSE 事件改為以文件為單位的物件 `{docId, url}`，url 為 `/documents/<projectId>/<filename>`
- 前端來源改為可點擊連結（新分頁開啟）

**Non-Goals:**
- 刪除文件時同步清理 `public/documents/`（後續再做）
- 認證 / 存取控制（現為 localhost 工具，無此需求）
- 壓縮或快取策略

## Decisions

**D1: 儲存位置選 `public/documents/<projectId>/`**

`public/` 已掛載 `express.static`，無需新增路由。路徑加入 `projectId` 子目錄以隔離不同 project 的同名檔案（例如兩個 project 都有 `spec.md`）。替代方案（`uploads/` 加獨立路由）需額外程式碼但無額外好處。

**D2: 保存原始上傳檔，不保存轉換後的 MD**

PDF 上傳後，使用者想看的是 PDF（可讀的原始文件），不是 MinerU 輸出的 Markdown 純文字。MD 上傳則直接保留 MD。

**D3: sources 改為文件層級（以 `docId` 去重），非 chunk title**

chunk title 是小節標題（如「3.2 功能需求」），無法作為檔案連結的顯示名稱或 key。改以 `docId`（檔案名稱）去重可讓每份文件只出現一個連結，且連結路徑直接來自 `docId`。

```
chunks → unique by docId → [{docId, url: '/documents/'+projectId+'/'+encodeURIComponent(docId)}]
```

`answer(question, projectId)` 已有 `projectId` 參數，直接使用，不需從 chunks 額外帶回。

**D4: 檔名即路徑，不做 UUID 映射**

multer 已設定 `filename: (req, file, cb) => cb(null, file.originalname)`，上傳後 `req.file.originalname` 與 `docId` 一致。直接用原始檔名作為路徑，簡單可預期。同名重傳會覆蓋舊檔（與現有 chunks 替換行為一致）。

## Risks / Trade-offs

- [磁碟空間] → 文件不會自動清理。現為本機工具，文件量小，可接受；刪除功能後續可擴充。
- [檔名含特殊字元] → docId 部分需 `encodeURIComponent`；projectId 為 UUID，無特殊字元。`express.static` 能正確解析。
- [sources 格式 breaking change] → 前端已在本 change 一起更新，後端無其他 consumer。
