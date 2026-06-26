const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const llm = require('../adapters/llm');
const vectorStore = require('../adapters/vector');
const { extractNpdsCode } = require('../config/npds-catalog');
const { rewriteImageLinks } = require('./imageLinks');

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

// 由資料夾名（docId）推得 phase：取 NPDS 代碼的階段碼（C560 → C5）。取不到回傳 null。
function phaseFromFolderName(name) {
  const code = extractNpdsCode(name);
  return code ? `C${code[1]}` : null;
}

// 共用：把 rawChunks 批次 embedding 後，先清除該 docId 舊資料再寫入。回傳寫入筆數。
async function embedAndStore(rawChunks, { docId, projectId, phase }, adapter, store) {
  if (rawChunks.length === 0) {
    await store.clear(docId, projectId);
    return 0;
  }
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

// Web 上傳路徑：單一 md 檔，docId = 檔名。
async function ingestFile(filePath, filename, projectId, phase, llmAdapter, vectorAdapter) {
  const adapter = llmAdapter || llm;
  const store = vectorAdapter || vectorStore;

  const markdownText = fs.readFileSync(filePath, 'utf-8');
  const docId = filename;
  const rawChunks = parseAndChunk(markdownText, filename);
  if (rawChunks.length === 0) return 0;

  return embedAndStore(rawChunks, { docId, projectId, phase }, adapter, store);
}

// 把資料夾內所有 .md 切塊；每個 chunk 的 title 標示來源 md 檔名。
function chunkFolderMarkdown(folderPath, projectId, docId) {
  const mdFiles = fs.readdirSync(folderPath).filter(f => f.toLowerCase().endsWith('.md')).sort();
  if (mdFiles.length === 0) {
    throw new Error(`資料夾內找不到任何 .md：${folderPath}`);
  }
  const rawChunks = [];
  for (const mdName of mdFiles) {
    const text = rewriteImageLinks(fs.readFileSync(path.join(folderPath, mdName), 'utf-8'), projectId, docId);
    for (const c of parseAndChunk(text, mdName)) {
      // 來源 md 檔名記進 title，多 md 時可追溯（無標題的塊 title 已是 mdName，不重複加）
      const title = c.title === mdName ? mdName : `${mdName} › ${c.title}`;
      rawChunks.push({ title, text: c.text });
    }
  }
  return { rawChunks, mdCount: mdFiles.length };
}

// 驗證資料夾頂層恰好一個 PDF（folder 進料的原始檔），回傳該 PDF 檔名；0 或多於一個則丟錯。
function requirePdf(folderPath) {
  const pdfs = fs.readdirSync(folderPath).filter(f => f.toLowerCase().endsWith('.pdf'));
  if (pdfs.length === 0) throw new Error(`資料夾需含一個 PDF 原始檔（供下載）：${folderPath}`);
  if (pdfs.length > 1) throw new Error(`資料夾的 PDF 需恰好一個，找到 ${pdfs.length} 個：${folderPath}`);
  return pdfs[0];
}

// 把整個資料夾原樣複製到持久位置（含 PDF、md、images）；重複進料整夾替換。回傳圖片數。
function persistFolderAssets(folderPath, projectId, docId, docsRoot) {
  const dest = path.join(docsRoot, projectId, docId);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(folderPath, dest, { recursive: true });

  const imagesSrc = path.join(folderPath, 'images');
  if (fs.existsSync(imagesSrc) && fs.statSync(imagesSrc).isDirectory()) {
    return fs.readdirSync(imagesSrc).filter(f => fs.statSync(path.join(imagesSrc, f)).isFile()).length;
  }
  return 0;
}

// 資料夾進料路徑：一資料夾 = 一 docId（= 資料夾名），可多 md，共用 images/。
// opts: { projectId, phase, docId?, docsRoot? }
async function ingestFolder(folderPath, opts, llmAdapter, vectorAdapter) {
  const adapter = llmAdapter || llm;
  const store = vectorAdapter || vectorStore;
  const folder = folderPath.replace(/[\\/]+$/, '');
  const projectId = opts.projectId;
  const phase = opts.phase;
  const docId = opts.docId || path.basename(folder);
  const docsRoot = opts.docsRoot || path.join(process.cwd(), 'public', 'documents');

  requirePdf(folder); // 進料前驗證：必含恰好一個 PDF 原始檔（供下載）
  const { rawChunks, mdCount } = chunkFolderMarkdown(folder, projectId, docId);
  const chunkCount = await embedAndStore(rawChunks, { docId, projectId, phase }, adapter, store);
  const imageCount = persistFolderAssets(folder, projectId, docId, docsRoot);

  return { docId, mdCount, chunkCount, imageCount };
}

module.exports = {
  parseAndChunk,
  ingestFile,
  ingestFolder,
  phaseFromFolderName,
  rewriteImageLinks,
};
