## 1. Prompt 路由防護(已隨 22c9bfa、8a8f182 上線)

- [x] 1.1 `src/services/retrieval.js`:netlist 落空且問題屬「用哪顆料/規格」類 → 必須接著呼叫 search_documents
- [x] 1.2 `src/services/retrieval.js`:文件內容類問題一律先檢索;專案名稱/背景僅供解讀代稱,不可判定離題
- [x] 1.3 `src/services/retrieval.js`:專案背景區塊明示為可信事實、可直接引用
- [x] 1.4 `src/services/retrieval.js`:文件檢索漸進式——第一輪不足以完整回答時,用結果中的料號/單號換關鍵字再檢索 1–3 輪
- [x] 1.5 `src/services/retrieval.js`:程式層強制首輪檢索——模型零工具就作答時代跑一次 search_documents 塞回重答(最多一次);含測試 ×3
- [x] 1.6 `src/services/retrieval.js`:專案背景移到 prompt 開頭(lost-in-the-middle 對策)並指示先查背景;禁止建議上傳已上傳的文件
- [x] 1.7 `src/adapters/llm/ollama.js`:生成 temperature 0.2 → 0(greedy)——同題不同解的隨機性來源;可用 OLLAMA_TEMPERATURE 覆寫
- [x] 1.8 `src/services/retrieval.js`:專案背景作為每次 search_documents 結果的首個 chunk(不列入 sources)——qwen 只信工具結果,prompt 開頭的背景實測仍被無視;沙箱實測 SoC 題答對、sensing 價格題不回歸;含測試 ×2

## 2. 專案設定 UI 儲存狀態(已隨 36bae3b 上線)

- [x] 2.1 `public/index.html`:dirty 追蹤 — 未儲存變更時按鈕亮起並提示;儲存成功/剛載入時按鈕鎖定顯示「✓ 已儲存」

## 3. 評測(regression eval)

- [x] 3.0 `scripts/eval-answers.js` + `evals/answer-cases.json`:代表性問題跑完整管線(DB 沙箱複本 + 真 Ollama)驗證答案關鍵字;`npm run eval`;knownFail 不影響 exit code。首跑:SoC ✅、sensing 價格 ✅、CAN 數 🟡 knownFail

## 4. 驗證

- [x] 3.1 `npm test` 全綠(111)
- [ ] 3.2 使用者實測:「soc使用哪一顆」「sensing camera 多少錢」重問驗收(重啟實例後)
