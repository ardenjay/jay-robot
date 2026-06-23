const llm = require('../adapters/llm');
const vectorStore = require('../adapters/vector');
const { formatCatalogForPrompt, extractNpdsCode } = require('../config/npds-catalog');
const netlist = require('./netlist');

const TOP_K = 5;
const MAX_TOOL_ROUNDS = 6;
const NO_ANSWER_PHRASE = '無法在提供的資料中找到答案';

// 文件檢索工具：需要已上傳文件內容時由 LLM 呼叫
const SEARCH_DOCUMENTS_DECL = {
  name: 'search_documents',
  description: '搜尋本專案已上傳的 NPDS 文件,回傳最相關的內容片段。需要文件內容才能回答時使用。',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: '搜尋用的問題或關鍵字' } },
    required: ['query'],
  },
};

function buildSystemInstruction(hasNet, uploadedCodes) {
  let s = '你是一個 NPDS 新產品開發系統的知識庫助手。\n'
    + '你可以使用工具查資料,務必根據工具結果回答,不要憑記憶或猜測。\n'
    + '- 需要已上傳文件的內容時,呼叫 search_documents。\n';
  if (hasNet) {
    s += '- 凡涉及具體零件(refdes,如 U42)、net、腳位、或連線/追線的問題,你「必須」呼叫 netlist 工具'
      + '(netlist_part / netlist_net / netlist_pin / netlist_find / netlist_trace / netlist_info)查詢,不可憑記憶回答。\n'
      + '- netlist 工具是漸進式的:若第一次查詢只得到「候選清單/模糊比對結果」(例如查某 net 名得到多個相近 net),'
      + '你「必須繼續」用 netlist_net / netlist_trace 深入查那些候選,直到答出實際的連接關係,不可在拿到候選後就停下。\n'
      + '- 問題較籠統時(例如「USB 是怎麼連的」),自行挑 1–3 個最相關的 net/零件,逐一查詢並彙整回答;'
      + '需要時可在回答末尾請使用者指定更精確的 net/零件,但不可因為問得籠統就直接放棄。\n'
      + '- 線路/連線類問題「不要」建議使用者上傳文件——板子的 netlist 本身就有答案,請持續用 netlist 工具查到底。\n';
  }
  s += `\n針對「文件內容類」問題,若 search_documents 的結果不足以回答,才說「${NO_ANSWER_PHRASE}」,`
    + '並根據下方 NPDS 文件目錄建議使用者上傳 1–3 份最相關的文件(含代碼、名稱、所屬階段)。'
    + '此「建議上傳文件」僅適用於文件內容類問題,不適用於線路/連線類問題。\n\n'
    + `## NPDS 文件目錄(參考,供建議上傳用)\n${formatCatalogForPrompt(uploadedCodes)}`;
  return s;
}

// 文件檢索：embed 問題 → 取 top-K chunks，並把來源 docId 累積到 sources
async function runSearchDocuments(adapter, store, query, projectId, sources) {
  const queryVector = await adapter.embed(query);
  const chunks = await store.search(queryVector, TOP_K, projectId);
  for (const c of chunks) {
    sources.set(c.docId, { docId: c.docId, url: `/documents/${projectId}/${encodeURIComponent(c.docId)}` });
  }
  return {
    chunk_count: chunks.length,
    chunks: chunks.map(c => ({ title: c.title, text: c.text, docId: c.docId })),
  };
}

// 以 LLM 工具呼叫迴圈回答問題。adapter / store 可注入(預設用模組 singleton)。
async function* answer(question, projectId, adapter = llm, store = vectorStore) {
  // 解析專案名稱（netlist 依專案名對資料夾）
  let projectName;
  if (store.listProjects) {
    const projects = await store.listProjects();
    const p = projects.find(x => x.id === projectId);
    projectName = p && p.name;
  }
  const hasNet = netlist.hasNetlist(projectName);
  const hasDocs = !(store.isEmpty && store.isEmpty(projectId));

  if (!hasDocs && !hasNet) {
    yield { type: 'token', value: '此專案尚未上傳任何文件,也沒有可用的 netlist。請先上傳文件。' };
    yield { type: 'sources', value: [] };
    return;
  }

  const uploadedDocs = store.listDocuments ? await store.listDocuments(projectId) : [];
  const uploadedCodes = new Set(uploadedDocs.map(d => extractNpdsCode(d.docId)).filter(Boolean));

  const tools = [SEARCH_DOCUMENTS_DECL, ...(hasNet ? netlist.NETLIST_TOOL_DECLARATIONS : [])];
  const sys = buildSystemInstruction(hasNet, uploadedCodes);
  const contents = [{ role: 'user', parts: [{ text: `${sys}\n\n## 使用者問題\n${question}` }] }];
  const sources = new Map();

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const { functionCalls, text } = await adapter.chatWithTools(contents, tools);

    if (!functionCalls.length) {
      const final = text || '';
      yield { type: 'token', value: final };
      yield { type: 'sources', value: final.includes(NO_ANSWER_PHRASE) ? [] : [...sources.values()] };
      return;
    }

    // 模型要求的工具呼叫回合
    contents.push({ role: 'model', parts: functionCalls.map(fc => ({ functionCall: { name: fc.name, args: fc.args } })) });

    const responseParts = [];
    for (const fc of functionCalls) {
      console.log(`[tool] ${fc.name}(${JSON.stringify(fc.args)})`);
      yield { type: 'tool', name: fc.name, args: fc.args || {} };
      let response;
      if (fc.name === 'search_documents') {
        response = await runSearchDocuments(adapter, store, fc.args.query || question, projectId, sources);
      } else {
        const r = await netlist.runNetlistTool(projectName, fc.name, fc.args || {});
        response = r.ok ? r.result : { error: r.error };
      }
      responseParts.push({ functionResponse: { name: fc.name, response } });
    }
    contents.push({ role: 'function', parts: responseParts });
  }

  yield { type: 'token', value: '查詢過程過長,請換個方式詢問。' };
  yield { type: 'sources', value: [] };
}

module.exports = { answer };
