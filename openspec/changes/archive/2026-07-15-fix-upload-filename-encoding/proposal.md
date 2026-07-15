## Why

Web 上傳非 ASCII 檔名(中文、全形符號)整段變亂碼:瀏覽器依規範以 UTF-8 送 filename,multer 1.x(busboy)以 latin1 解碼,UTF-8 位元組被逐 byte 拆開(「Jetson T5000 vs T4000 規格比較.md」→「…è¦æ ¼æ¯"è¼ƒ.md」;更早案例:全形底線 ＿→ï¼¿)。docId = 檔名,亂碼汙染來源顯示、文件樹、下載檔名與持久化路徑;內容檢索不受影響。使用者已開始使用中文檔名,先前「改用英文檔名避開」的權宜不再適用。

## What Changes

- 上傳入口把 multer 解出的 `originalname` 以 latin1→UTF-8 還原,修復點在 multer storage 的 filename callback(就地改寫 `file.originalname`,下游五處使用一次全修)。
- 防呆三層:純 ASCII 原樣不動(轉換本來就是恆等);字串含 >U+00FF 字元表示已是正確 UTF-8、不得二次轉換;還原結果含 U+FFFD(replacement char)視為非法、保留原樣。
- 還原邏輯抽成可單元測試的小工具函式。
- 不改 multer 版本、不動 folder CLI(fs 路徑無此問題);既有亂碼文件不遷移(數量少,刪除重傳即可)。

## Capabilities

### New Capabilities

(無)

### Modified Capabilities

- `document-ingestion`: 新增「非 ASCII 上傳檔名正確解碼」需求(ADDED;上傳行為的正確性補強,不改既有需求內容)。

## Impact

- `src/routes/upload.js`:multer storage filename callback 套用還原。
- `src/services/uploadName.js`(新):`fixLatin1Mojibake(name)`。
- 測試:純 ASCII 不變、中文/全形還原、正確 UTF-8 不被二次轉壞、混合中英數。
- 驗收:重傳「Jetson T5000 vs T4000 規格比較.md」,來源/文件樹/下載為正常中文。
