const llm = require('../adapters/llm');
const vectorStore = require('../adapters/vector');
const { formatCatalogForPrompt } = require('../config/npds-catalog');

const TOP_K = 5;

function buildPrompt(question, chunks) {
  const context = chunks
    .map((c, i) => `[${i + 1}] ${c.title ? `**${c.title}**\n` : ''}${c.text}`)
    .join('\n\n---\n\n');

  return `你是一個 NPDS 新產品開發系統的知識庫助手。請只根據以下提供的文件內容回答問題。
如果文件中沒有足夠的資訊，請直接說「無法在提供的資料中找到答案」，並根據下方的「NPDS 文件目錄」，具體指出使用者應上傳哪份文件（請包含文件代碼、名稱與所屬階段），不要捏造內容。

## 文件內容

${context}

## NPDS 文件目錄（參考用）

以下是完整的 NPDS 文件目錄，僅供推理使用，不作為回答問題的資料來源。當無法從已上傳文件找到答案時，請根據問題語義從此目錄中識別 1–3 份最相關的文件，建議使用者上傳。

${formatCatalogForPrompt()}

## 問題

${question}

## 回答`;
}

async function* answer(question, projectId) {
  if (vectorStore.isEmpty && vectorStore.isEmpty(projectId)) {
    yield '此專案尚未上傳任何文件，請先上傳 Markdown 檔案。';
    return;
  }

  const queryVector = await llm.embed(question);
  const chunks = await vectorStore.search(queryVector, TOP_K, projectId);

  if (chunks.length === 0) {
    yield '此專案尚未上傳任何文件，請先上傳 Markdown 檔案。';
    return;
  }

  const prompt = buildPrompt(question, chunks);

  let fullResponse = '';
  for await (const token of llm.stream(prompt)) {
    fullResponse += token;
    yield { type: 'token', value: token };
  }

  const NO_ANSWER_PHRASE = '無法在提供的資料中找到答案';
  const sources = fullResponse.includes(NO_ANSWER_PHRASE)
    ? []
    : [...new Map(chunks.map(c => [c.docId, {
        docId: c.docId,
        url: `/documents/${projectId}/${encodeURIComponent(c.docId)}`,
      }])).values()];
  yield { type: 'sources', value: sources };
}

module.exports = { answer };
