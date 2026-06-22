## Context

`src/adapters/llm/gemini.js` 以 `EMBED_MODEL = 'gemini-embedding-001'` 呼叫 `embedContent()`，未設 `outputDimensionality`，使用模型預設維度。實測一次 embed 呼叫，回傳向量長度為 3072。但 `llm-adapter` 主 spec 仍寫 `text-embedding-004`（768 維）——應為早期版本遺留、未隨程式碼更新。

## Goals / Non-Goals

**Goals:**
- spec 的 embedding 模型與維度與實作一致（`gemini-embedding-001`、3072 維）

**Non-Goals:**
- 不改任何程式碼或實際模型 / 維度（程式碼是對的，要改的是文件）
- 不調整 embedding 維度設定（不引入 `outputDimensionality`）

## Decisions

### 1. 以實測值校正 spec

**決定**：模型名稱改為 `gemini-embedding-001`，維度改為 3072（依實際 embed 回傳長度），並同步更新對應 scenario。

**理由**：spec 應反映真實行為。維度以實際 API 回傳值為準，而非沿用舊文件的 768。

## Risks / Trade-offs

- **極低**：純文件校正。唯一風險是日後若程式改用其他模型 / 維度，spec 需再同步——屬一般維護，不在本變更範圍。
