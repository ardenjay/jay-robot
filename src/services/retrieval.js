const llm = require('../adapters/llm');
const vectorStore = require('../adapters/vector');

const TOP_K = 5;

function buildPrompt(question, chunks) {
  const context = chunks
    .map((c, i) => `[${i + 1}] ${c.title ? `**${c.title}**\n` : ''}${c.text}`)
    .join('\n\n---\n\n');

  return `你是一個知識庫助手。請只根據以下提供的文件內容回答問題。
如果文件中沒有足夠的資訊，請直接說「無法在提供的資料中找到答案」，不要捏造內容。

## 文件內容

${context}

## 問題

${question}

## 回答`;
}

async function* answer(question) {
  if (vectorStore.isEmpty && vectorStore.isEmpty()) {
    yield '尚未上傳任何文件，請先上傳 Markdown 檔案。';
    return;
  }

  const queryVector = await llm.embed(question);
  const chunks = await vectorStore.search(queryVector, TOP_K);

  if (chunks.length === 0) {
    yield '尚未上傳任何文件，請先上傳 Markdown 檔案。';
    return;
  }

  const prompt = buildPrompt(question, chunks);

  for await (const token of llm.stream(prompt)) {
    yield { type: 'token', value: token };
  }

  const sources = [...new Set(chunks.map(c => c.title).filter(Boolean))];
  yield { type: 'sources', value: sources };
}

module.exports = { answer };
