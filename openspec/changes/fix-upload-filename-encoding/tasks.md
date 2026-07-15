## 1. 還原工具

- [x] 1.1 `src/services/uploadName.js`(新):`fixLatin1Mojibake(name)` — 三層防呆(純 ASCII 提早退出;含 >U+00FF 視為已正確;還原含 U+FFFD 保留原樣)
- [x] 1.2 測試 `tests/upload-name.test.js`:純 ASCII 不變、中文 mojibake 還原、全形 ＿ 還原、正確中文不二次轉換、混合中英數、含 U+FFFD 保留原樣

## 2. 上傳入口套用

- [x] 2.1 `src/routes/upload.js`:multer storage filename callback 內 `file.originalname = fixLatin1Mojibake(file.originalname)` 後再 `cb(null, file.originalname)`

## 3. 驗證

- [x] 3.1 `npm test` 全綠;不碰真實 `data/rag.db`
- [x] 3.2 使用者驗收:刪除亂碼文件、重傳「Jetson T5000 vs T4000 規格比較.md」,來源/文件樹/下載為正常中文(驗收通過前不 commit)
