require('dotenv').config();
const express = require('express');
const path = require('path');

const uploadRouter = require('./routes/upload');
const chatRouter = require('./routes/chat');
const projectsRouter = require('./routes/projects');
const configRouter = require('./routes/config');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'public')));

app.use('/api/upload', uploadRouter);
app.use('/api/chat', chatRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/config', configRouter);

app.listen(PORT, () => {
  console.log(`Jay Robot running at http://localhost:${PORT}`);
  // 啟動背景回填 sidecar table_rows（fire-and-forget）：schema 升級由 adapter 的版本
  // 階梯在 require 時同步完成，需要 embedding 的資料補建在此背景進行——不阻塞服務，
  // 失敗（如 Ollama 未起）只留 log、下次啟動續跑。正式機 git pull 重啟即自動補料。
  try {
    const { backfillTableRows } = require('./services/ingestion');
    const vectorStore = require('./adapters/vector');
    const llm = require('./adapters/llm');
    backfillTableRows(vectorStore, llm).catch(err => console.warn(`[sidecar-backfill] ${err.message}`));
  } catch (err) {
    console.warn(`[sidecar-backfill] 初始化失敗：${err.message}`);
  }
});

module.exports = app;
