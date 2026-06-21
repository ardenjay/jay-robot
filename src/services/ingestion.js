const fs = require('fs');
const { marked } = require('marked');
const llm = require('../adapters/llm');
const vectorStore = require('../adapters/vector');

const MAX_CHUNK_LENGTH = 1500;

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

async function ingestFile(filePath, filename, llmAdapter, vectorAdapter) {
  const adapter = llmAdapter || llm;
  const store = vectorAdapter || vectorStore;

  const markdownText = fs.readFileSync(filePath, 'utf-8');
  const docId = filename;

  const rawChunks = parseAndChunk(markdownText, filename);
  if (rawChunks.length === 0) return 0;

  const embeddedChunks = [];
  for (const chunk of rawChunks) {
    const embedding = await adapter.embed(chunk.text);
    embeddedChunks.push({ docId, title: chunk.title, text: chunk.text, embedding });
  }

  await store.clear(docId);
  await store.add(embeddedChunks);

  return embeddedChunks.length;
}

module.exports = { parseAndChunk, ingestFile };
