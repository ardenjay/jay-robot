const fs = require('fs');
const { marked } = require('marked');
const llm = require('../adapters/llm');
const vectorStore = require('../adapters/vector');

const MAX_CHUNK_LENGTH = 1500;
// 批次 embedding 每批筆數，降低 API 請求數與 429 風險
const EMBED_BATCH_SIZE = 100;

function parseAndChunk(markdownText, filename) {
  const tokens = marked.lexer(markdownText);
  const chunks = [];
  let currentTitle = filename;
  let currentText = '';

  function flushChunk() {
    const text = currentText.trim();
    if (text) {
      splitLongChunk(text, currentTitle).forEach(t => chunks.push({ title: currentTitle, text: t }));
    }
    currentText = '';
  }

  for (const token of tokens) {
    if (token.type === 'heading') {
      flushChunk();
      currentTitle = token.text;
    } else if (token.type === 'space') {
      currentText += '\n';
    } else if (token.raw) {
      currentText += token.raw;
    }
  }
  flushChunk();

  return chunks;
}

function splitLongChunk(text, title) {
  if (text.length <= MAX_CHUNK_LENGTH) return [text];

  const paragraphs = text.split(/\n+/).filter(p => p.trim());
  const result = [];
  let current = '';

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > MAX_CHUNK_LENGTH && current.length > 0) {
      result.push(current.trim());
      current = para;
    } else {
      current = current ? current + '\n\n' + para : para;
    }
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

async function ingestFile(filePath, filename, projectId, phase, llmAdapter, vectorAdapter) {
  const adapter = llmAdapter || llm;
  const store = vectorAdapter || vectorStore;

  const markdownText = fs.readFileSync(filePath, 'utf-8');
  const docId = filename;

  const rawChunks = parseAndChunk(markdownText, filename);
  if (rawChunks.length === 0) return 0;

  const embeddedChunks = [];
  for (let i = 0; i < rawChunks.length; i += EMBED_BATCH_SIZE) {
    const batch = rawChunks.slice(i, i + EMBED_BATCH_SIZE);
    const embeddings = await adapter.embedBatch(batch.map(c => c.text));
    batch.forEach((chunk, j) => {
      embeddedChunks.push({ docId, title: chunk.title, text: chunk.text, embedding: embeddings[j], projectId, phase });
    });
  }

  await store.clear(docId, projectId);
  await store.add(embeddedChunks);

  return embeddedChunks.length;
}

module.exports = { parseAndChunk, ingestFile };
