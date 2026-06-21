## Context

前端 `public/index.html` 在收到串流 token 時執行 `bubble.textContent += event.value`（約在 chat 送出處理區），把回答當純文字累加，因此 Markdown 符號原樣顯示。`marked` v14 已在 `node_modules`，且附帶瀏覽器版 `marked.min.js`（UMD，掛載全域 `marked`）。`src/app.js` 以 `express.static('public')` 服務靜態檔，故 `public/vendor/` 下的檔案可直接被存取。

## Goals / Non-Goals

**Goals:**
- 助手回答以 Markdown 正確渲染（粗體、清單、標題、行內/區塊程式碼、連結等）
- 串流過程逐步渲染，維持「逐字浮現」的即時感
- 不依賴外部 CDN（marked 由本機提供）

**Non-Goals:**
- 不渲染使用者問題泡泡（維持純文字）
- 不改後端回應格式（仍是 SSE token 串流）
- 不導入打包工具（沿用無 build step 的靜態頁）
- 不在本次加入 HTML 淨化函式庫（DOMPurify），改以信任前提 + 後續可加（見 Risks）

## Decisions

### 1. 本機提供 marked，不用 CDN

**決定**：把 `node_modules/marked/marked.min.js` 複製到 `public/vendor/marked.min.js`，在 `index.html` 以 `<script src="/vendor/marked.min.js"></script>` 載入，使用全域 `marked.parse()`。

**理由**：本工具為自架、可能在無外網環境執行；本機提供避免 CDN 連線失敗或版本漂移，也與既有相依版本一致。複製單一 min 檔最簡單，無需打包。

---

### 2. 累積原始 Markdown，逐 token 重新渲染

**決定**：每個助手回答用一個變數累積原始 Markdown（如 `raw += token`），每收到 token 就 `bubble.innerHTML = marked.parse(raw)`。

**理由**：串流時 `textContent` 已被 innerHTML 取代，需另存原始字串以便每次重新解析。回答通常數 KB，逐次 parse 成本可忽略。逐步渲染讓使用者即時看到成形的格式；半成品 Markdown（如尚未閉合的 `**`）會在後續 token 補齊後正確呈現，可接受。

---

### 3. 只渲染助手泡泡；問題與錯誤維持純文字

**決定**：使用者問題泡泡與錯誤訊息仍用 `textContent`；僅助手回答泡泡走 marked 渲染。來源連結區塊（`sourcesEl`）是獨立元素，行為不變。

**理由**：問題是使用者輸入的純文字，不應被當 Markdown 解析（避免意外格式化與注入）。錯誤訊息同理。縮小渲染面，降低風險。

---

### 4. innerHTML 渲染的 XSS 風險以信任前提承擔，sanitize 留待後續

**決定**：本次直接以 `marked.parse()` 結果寫入 `innerHTML`，不加 DOMPurify。

**理由**：回答內容來自本系統的 LLM、根據內部上傳文件生成，且為內部工具，風險低。導入 sanitize 需額外相依與載入流程，超出「修好顯示」的最小範圍。於 Risks 標註，若日後開放外部內容或多租戶，再加 DOMPurify 一層。

## Risks / Trade-offs

- **XSS**：以 innerHTML 渲染 LLM 輸出，理論上若回答含惡意 HTML 可執行。現階段內容可信、屬內部工具，風險低；未來如需強化，於 `marked.parse()` 後套 DOMPurify。
- **串流中半成品 Markdown 閃爍**：未閉合語法在補齊前可能短暫顯示異常，token 到齊即正常。可接受；必要時改為「串流純文字、done 時才渲染」。
- **逐 token 重新 parse 效能**：長回答時每 token 全量 parse 略有成本，但實務回答長度下可忽略。
