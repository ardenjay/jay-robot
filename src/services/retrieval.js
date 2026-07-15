const llm = require('../adapters/llm');
const vectorStore = require('../adapters/vector');
const { formatCatalogForPrompt, extractNpdsCode } = require('../config/npds-catalog');
const netlist = require('./netlist');
const { rerankChunks } = require('./rerank');

const TOP_K = 5;
// hybridSearch/search 先取比 TOP_K 更寬的候選池，再交給 LLM rerank 篩到 TOP_K：
// 候選池太窄時，跨語言/跨文件關鍵字不匹配的正確片段可能連候選都排不進去（見
// fts5-hybrid-search-gotchas 記憶），先擴大候選池才有機會被 rerank 選中。
const RERANK_POOL_K = 15;
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

function buildSystemInstruction(hasNet, uploadedCodes, { projectName, projectContext } = {}) {
  let s = '你是一個 NPDS 新產品開發系統的知識庫助手。\n';
  // 專案名稱固定注入：讓模型知道「100T」這類代稱指的是專案本身，而非某顆零件
  if (projectName) {
    s += `目前專案名稱:「${projectName}」。使用者提到這個名稱時,通常指本專案(產品)本身,而非某個零件。`
      + '此名稱與專案背景僅供解讀代稱,「不可」用來判定使用者的問題與專案無關。\n';
  }
  // 背景放最前面：qwen3:14b 這類小模型對長 prompt 中段的注意力差(lost in the middle)，
  // 塞在規則與目錄之間會被忽略(實測「SoC 用哪顆」背景有寫仍答不出)。
  if (projectContext && projectContext.trim()) {
    s += '\n## 專案背景(使用者提供)\n'
      + '以下背景由使用者直接提供,視為可信事實,可直接作為回答依據(不算「憑記憶猜測」);'
      + '回答前先檢查背景是否已含答案,若有就直接引用,再視需要以工具補充細節:\n'
      + `${projectContext.trim()}\n\n`;
  }
  s += '你可以使用工具查資料,務必根據工具結果回答,不要憑記憶或猜測。\n'
    + '- 文件內容類問題(規格、價格、報價、採購、測試報告、日期等)一律「先呼叫 search_documents 檢索」;'
    + '專案文件不只有產品規格,還包含報價單、採購單、品質報告等,「不可」未經檢索就自行判定問題與專案無關或回答找不到。\n'
    + '- search_documents 也是漸進式的:若第一輪結果與問題相關但不足以完整回答(例如找到對的文件卻缺具體數字),'
    + '你「必須」換更精確的關鍵字(如結果中出現的料號、單號、規格名、文件標題)再檢索 1–3 輪,仍找不到才回答找不到。\n'
    + '- 若檢索到的內容含有圖片(Markdown 圖片語法 ![](...),且為絕對路徑)且該圖有助於說明答案,你可以在答案中直接帶出該圖片連結;但「只能」使用檢索內容中既有的圖片連結,不可自行杜撰或猜測任何圖片路徑。\n';
  if (hasNet) {
    s += '- 凡涉及具體零件(refdes,如 U42)、net、腳位、或連線/追線的問題,你「必須」呼叫 netlist 工具'
      + '(netlist_part / netlist_net / netlist_pin / netlist_find / netlist_trace / netlist_info)查詢,不可憑記憶回答。\n'
      + '- netlist 工具是漸進式的:若第一次查詢只得到「候選清單/模糊比對結果」(例如查某 net 名得到多個相近 net),'
      + '你「必須繼續」用 netlist_net / netlist_trace 深入查那些候選,直到答出實際的連接關係,不可在拿到候選後就停下。\n'
      + '- 問題較籠統時(例如「USB 是怎麼連的」),自行挑 1–3 個最相關的 net/零件,逐一查詢並彙整回答;'
      + '需要時可在回答末尾請使用者指定更精確的 net/零件,但不可因為問得籠統就直接放棄。\n'
      + '- 線路/連線類問題「不要」建議使用者上傳文件——板子的 netlist 本身就有答案,請持續用 netlist 工具查到底。\n'
      + '- 但若 netlist 工具查無相關結果,且問題其實是「用了哪顆晶片/零件、規格為何」這類文件也能回答的問題'
      + '(例如「SoC 用哪一顆」),你「必須」接著呼叫 search_documents 從已上傳文件中找答案,不可只查 netlist 就回答找不到。\n';
  }
  s += `\n針對「文件內容類」問題,若 search_documents 的結果不足以回答,才說「${NO_ANSWER_PHRASE}」,`
    + '並根據下方 NPDS 文件目錄建議使用者上傳 1–3 份最相關的文件(含代碼、名稱、所屬階段)。'
    + '此「建議上傳文件」僅適用於文件內容類問題,不適用於線路/連線類問題。'
    + '建議上傳的文件「只能」從下方目錄挑選(目錄已排除已上傳的);'
    + '出現在檢索結果或來源中的文件代表「已經上傳」,不可建議使用者上傳它們。\n';
  s += `\n## NPDS 文件目錄(參考,供建議上傳用)\n${formatCatalogForPrompt(uploadedCodes)}`;
  return s;
}

// 文件檢索：embed 問題 → hybrid search（向量 + 關鍵字融合）取 top-K chunks，
// 並把來源 docId 累積到 sources。store 未提供 hybridSearch（舊注入物件）時退回純向量。
// projectContext 非空時作為首個 chunk 一併回傳（不列入 sources）：qwen3:14b 實測只信工具
// 結果、無視 system prompt 裡的背景（「務必根據工具結果回答」壓過「背景可直接引用」），
// 把背景塞進工具結果它才會用。
async function runSearchDocuments(adapter, store, query, projectId, sources, projectContext) {
  const queryVector = await adapter.embed(query);
  const pool = typeof store.hybridSearch === 'function'
    ? await store.hybridSearch(query, queryVector, RERANK_POOL_K, projectId)
    : await store.search(queryVector, RERANK_POOL_K, projectId);
  const chunks = await rerankChunks(adapter, query, pool, TOP_K);
  for (const c of chunks) {
    sources.set(c.docId, { docId: c.docId, url: `/documents/${projectId}/${encodeURIComponent(c.docId)}` });
  }
  const out = chunks.map(c => ({ title: c.title, text: c.text, docId: c.docId }));
  if (projectContext && projectContext.trim()) {
    out.unshift({ title: '專案背景(使用者提供,可信事實)', text: projectContext.trim(), docId: null });
  }
  return { chunk_count: out.length, chunks: out };
}

// 以 LLM 工具呼叫迴圈回答問題。adapter / store 可注入(預設用模組 singleton)。
async function* answer(question, projectId, adapter = llm, store = vectorStore) {
  // 解析專案名稱與背景（netlist 依專案名對資料夾；名稱與背景也注入 system prompt）
  let projectName;
  let projectContext;
  if (store.listProjects) {
    const projects = await store.listProjects();
    const p = projects.find(x => x.id === projectId);
    projectName = p && p.name;
    projectContext = p && p.context;
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
  const sys = buildSystemInstruction(hasNet, uploadedCodes, { projectName, projectContext });
  // system 指令與使用者問題分開送：塞進同一個 user 訊息會被部分模型（如 qwen3）的
  // chat template 弱化，模型會用文字宣告要查資料而不實際呼叫工具（實測 0/4 → 修正後 3/3）。
  const contents = [
    { role: 'system', parts: [{ text: sys }] },
    { role: 'user', parts: [{ text: question }] },
  ];
  const sources = new Map();

  let usedAnyTool = false;
  let forcedSearch = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const { functionCalls, text } = await adapter.chatWithTools(contents, tools);

    if (!functionCalls.length) {
      // 程式層防護：小模型（如 qwen3:14b）可能無視「必須先檢索」的 prompt 規則，
      // 一個工具都沒呼叫就作答。此時系統代跑一次文件檢索、以工具回合塞回歷史，
      // 讓模型依據檢索結果重答（僅強制一次，避免迴圈）。
      if (!usedAnyTool && !forcedSearch && hasDocs) {
        forcedSearch = true;
        console.log(`[tool] search_documents(forced) ${JSON.stringify({ query: question })}`);
        yield { type: 'tool', name: 'search_documents', args: { query: question } };
        const response = await runSearchDocuments(adapter, store, question, projectId, sources, projectContext);
        contents.push({ role: 'model', parts: [{ functionCall: { name: 'search_documents', args: { query: question } } }] });
        contents.push({ role: 'function', parts: [{ functionResponse: { name: 'search_documents', response } }] });
        continue;
      }
      const final = text || '';
      yield { type: 'token', value: final };
      yield { type: 'sources', value: final.includes(NO_ANSWER_PHRASE) ? [] : [...sources.values()] };
      return;
    }

    // 模型要求的工具呼叫回合
    usedAnyTool = true;
    contents.push({ role: 'model', parts: functionCalls.map(fc => ({ functionCall: { name: fc.name, args: fc.args } })) });

    const responseParts = [];
    for (const fc of functionCalls) {
      console.log(`[tool] ${fc.name}(${JSON.stringify(fc.args)})`);
      yield { type: 'tool', name: fc.name, args: fc.args || {} };
      let response;
      if (fc.name === 'search_documents') {
        response = await runSearchDocuments(adapter, store, fc.args.query || question, projectId, sources, projectContext);
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
