## ADDED Requirements

### Requirement: Non-ASCII upload filenames are decoded correctly
Web 上傳時系統 SHALL 修復 multer 對 filename 的 latin1 誤解碼:於 storage filename callback 以 latin1→UTF-8 還原 `originalname` 並就地改寫,使 docId、暫存檔名、持久化檔名、下載與顯示皆為正確 UTF-8。還原 SHALL 具防呆:純 ASCII 檔名不受影響;已為正確 UTF-8 的字串(含任何 > U+00FF 字元)SHALL NOT 被二次轉換;還原結果含 U+FFFD 時 SHALL 保留原字串。

#### Scenario: 中文檔名還原
- **WHEN** 上傳「Jetson T5000 vs T4000 規格比較.md」(multer 解出 mojibake)
- **THEN** docId、文件樹、來源顯示與下載檔名皆為「Jetson T5000 vs T4000 規格比較.md」

#### Scenario: 全形符號還原
- **WHEN** 上傳檔名含全形底線 ＿(先前實例 C315 Sensing＿PO)
- **THEN** 儲存後檔名保留 ＿,不再出現 ï¼¿

#### Scenario: 純 ASCII 檔名零影響
- **WHEN** 上傳「report_v2.pdf」
- **THEN** 檔名逐 byte 不變

#### Scenario: 已正確的 UTF-8 不被二次轉換
- **WHEN** `fixLatin1Mojibake` 收到已是正確中文的字串(含 > U+00FF 字元)
- **THEN** 原樣回傳,不做 latin1 轉換(避免產生 U+FFFD/亂碼)
