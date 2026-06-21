# Jay Robot

個人 Markdown 知識庫 RAG 聊天機器人。上傳 `.md` 文件後，用自然語言提問，系統根據文件內容回答並標註來源。

## 功能

- 上傳 Markdown 文件（支援拖曳）
- 依標題自動切塊、向量化儲存
- 問題向量化 → 相似度搜尋 → Gemini 生成答案
- 串流輸出，即時顯示回答
- 每個回答附來源段落標題
- LLM 與 Vector Store 均可透過環境變數替換

## 環境需求

- Node.js v18+
- Gemini API Key（[取得免費額度](https://aistudio.google.com/app/apikey)）

## 安裝

```bash
git clone https://github.com/你的帳號/jay-robot.git
cd jay-robot
npm install
cp .env.example .env
```

編輯 `.env`，填入你的 API key：

```
GEMINI_API_KEY=your_api_key_here
```

## 啟動

```bash
npm start
```

開啟瀏覽器：`http://localhost:3000`

## 使用方式

1. 左側上傳區選取或拖曳 `.md` 檔案 → 點擊「上傳」
2. 右側輸入問題，按 Enter 送出
3. 回答即時串流顯示，下方附來源段落

## 專案結構

```
src/
├── adapters/
│   ├── llm/        # LLM 介面（預設：Gemini）
│   └── vector/     # Vector Store 介面（預設：SQLite）
├── services/
│   ├── ingestion.js  # 文件解析、切塊、向量化
│   └── retrieval.js  # 搜尋、生成、串流
├── routes/
│   ├── upload.js   # POST /api/upload
│   └── chat.js     # POST /api/chat (SSE)
└── app.js
public/
└── index.html      # 前端 UI
```

## 環境變數

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `GEMINI_API_KEY` | — | Gemini API 金鑰（必填） |
| `VECTOR_ADAPTER` | `sqlite` | Vector Store 實作 |
| `LLM_ADAPTER` | `gemini` | LLM 實作 |
| `PORT` | `3000` | 伺服器 port |
