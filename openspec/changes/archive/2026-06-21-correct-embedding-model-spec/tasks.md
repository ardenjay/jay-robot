## 1. 校正 spec

- [x] 1.1 在 `openspec/specs/llm-adapter/spec.md` 將「Gemini adapter as default implementation」需求的 embedding 模型由 `text-embedding-004` 改為 `gemini-embedding-001`、維度由 768 改為 3072
- [x] 1.2 將 scenario「Gemini embed returns 768-dim vector」更新為「returns 3072-dim vector」，THEN 改為長度 3072
- [x] 1.3 保留 temperature 相關描述與 scenario 不變

## 2. 驗收

- [x] 2.1 `openspec validate llm-adapter --specs --strict` 通過
- [x] 2.2 確認 spec 與 `src/adapters/llm/gemini.js` 的 `EMBED_MODEL` 一致（皆 `gemini-embedding-001`）
