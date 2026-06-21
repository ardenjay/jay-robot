## Context

上傳路由 (`src/routes/upload.js`) 目前只接受 `.md` / `.markdown`，對其他格式一律回傳 400。NPDS 文件大多為 PDF，使用者需手動轉換後才能上傳。MinerU 是已安裝在伺服器上的 PDF→Markdown 工具，透過 conda 環境執行。

## Goals / Non-Goals

**Goals:**
- 上傳路由接受 `.pdf`，自動呼叫 MinerU 轉換，轉換完成後走現有 ingest 流程
- 轉換失敗時回傳明確錯誤訊息

**Non-Goals:**
- 不支援其他格式（Word、Excel 等）
- 不在前端顯示轉換進度（同步等待，回傳後才顯示結果）
- 不快取轉換結果

## Decisions

### 1. 使用 `conda run -n mineru` 而非 `conda activate`

**決定**：shell 指令改為 `conda run -n mineru mineru -p "<pdf>" -o "<outdir>"`。

**理由**：Node.js `child_process` 啟動的是非互動式 shell，`conda activate` 在非互動式 shell 中不會生效（conda init 只注入到互動式 shell）。`conda run -n <env>` 是在指定環境中執行單一命令的正確方式，無需 activate。

---

### 2. 在 upload route 直接處理 PDF 轉換，不抽 service

**決定**：轉換邏輯寫在 `src/routes/upload.js`，不另建 service。

**理由**：轉換只有一個呼叫點（上傳路由），沒有複用需求。保持邏輯在同一地方，減少間接層。

---

### 3. MinerU 輸出目錄用臨時目錄，轉換後刪除

**決定**：以 `fs.mkdtempSync()` 建立臨時目錄作為 MinerU 的 `-o` 目標，ingest 完成後刪除整個臨時目錄與原始 PDF。

**理由**：避免轉換中間檔案殘留在 `uploads/` 或其他固定路徑造成衝突。

---

### 4. MinerU 輸出的 .md 路徑：glob 找第一個 .md

**決定**：MinerU 輸出結構為 `<outdir>/<basename>/auto/<basename>.md`，用 `fs.readdirSync` 遞迴找第一個 `.md` 檔案。

**理由**：MinerU 版本不同輸出路徑可能略有差異，glob 比硬編碼路徑更穩健。

## Risks / Trade-offs

- **轉換時間長** → PDF 頁數多時 MinerU 可能需要數十秒。前端 HTTP 請求會等待，瀏覽器預設 timeout 通常夠用，但若有問題可未來改為非同步任務佇列。
- **MinerU 未安裝** → 若伺服器沒有 conda 或 mineru 環境，呼叫會失敗並回傳 500。需在部署文件中說明環境需求。
- **MinerU 輸出品質** → PDF 若含掃描圖片或複雜排版，轉換品質可能不佳，LLM 回答品質連帶受影響。這是 MinerU 本身的限制，acceptable。
