## Context

`src/routes/upload.js` 用 multer diskStorage,filename callback 直接以 `file.originalname` 存檔;originalname 之後還用在副檔名判斷、`ingestFile` 的 docId、原始檔持久化與完成訊息(共五處)。multer 1.x 把 UTF-8 filename 以 latin1 解碼,產生 mojibake。先前已用 DB hex dump 驗證 `Buffer.from(bad,'latin1').toString('utf8')` 能無損還原實例。

## Goals / Non-Goals

**Goals:**
- 中文/全形檔名上傳後,docId、顯示、下載、持久化路徑皆為正確 UTF-8。
- 英文(純 ASCII)檔名零影響;已正確的 UTF-8 字串絕不二次轉換。

**Non-Goals:**
- 不升級 multer(2.x 行為變動風險大於此修)。
- 不遷移既有亂碼 docId(刪除重傳)。
- 不動 folder CLI 與 netlist 路徑(fs 讀檔名無此問題)。

## Decisions

1. **修復點放 multer storage 的 filename callback,就地改寫 `file.originalname`**:`file` 物件與 `req.file` 同一參照,callback 內 `file.originalname = fixed` 一處改寫,下游五處(存檔名、副檔名、docId、持久化、訊息)自動全對。替代:在 route handler 開頭修——但 storage 存暫存檔用的是 callback 當下的名字,會留下亂碼暫存檔名,否決。
2. **三層防呆,順序判斷**:
   - 不含 U+0080–U+00FF → 純 ASCII,原樣回傳(轉換恆等,提早退出);
   - 含任何 > U+00FF 的字元 → 字串已是正確解碼的 UTF-8(latin1 誤解碼的產物必然全落在 ≤ U+00FF),原樣回傳——這層擋掉「對正確中文再做 latin1→utf8 產生 U+FFFD」的二次破壞;
   - latin1→utf8 還原後含 U+FFFD → 真的是 latin1 檔名而非 mojibake,原樣回傳;否則採用還原結果。
3. **工具函式獨立成 `src/services/uploadName.js`**:純函式、可單元測試;upload.js 只 require。

## Risks / Trade-offs

- [真正的 latin1 西歐檔名(café.pdf)會被誤還原成中文亂碼?] → 不會:此類還原多半產生 U+FFFD 被防呆擋下;且現代瀏覽器一律送 UTF-8,此情境實務上不存在。
- [使用者以舊亂碼 docId 重問] → 舊文件刪除重傳後 docId 變了,來源連結自然更新;無程式風險。
