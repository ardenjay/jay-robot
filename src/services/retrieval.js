const llm = require('../adapters/llm');
const vectorStore = require('../adapters/vector');
const { formatCatalogForPrompt, extractNpdsCode } = require('../config/npds-catalog');
const netlist = require('./netlist');
const { rerankChunks } = require('./rerank');
const { expandQuery } = require('./query-expand');

const TOP_K = 5;
// hybridSearch/search 先取比 TOP_K 更寬的候選池，再交給 LLM rerank 篩到 TOP_K：
// 候選池太窄時，跨語言/跨文件關鍵字不匹配的正確片段可能連候選都排不進去（見
// fts5-hybrid-search-gotchas 記憶），先擴大候選池才有機會被 rerank 選中。
// 25：實測有案例（中文查詢「電源輸入接頭 CN 編號」）正確 chunk 純向量排 #13、但被
// RRF 融合裡爛的關鍵字排名（跨語言 #60）拖到融合後 #19–22，需要池夠大才涵蓋得到；
// 涵蓋到之後 rerank 每次都能把它拉回 top-5 第一。
const RERANK_POOL_K = 25;
// 多查詢（原查詢＋英文擴展）合併後的候選上限：兩 variant 最多 50，全丟 rerank 太長、
// 也稀釋判斷；round-robin 合併後前 30 已涵蓋兩語言最相關者。
const UNION_CAP = 30;
const MAX_TOOL_ROUNDS = 6;
// Sidecar 表格列的有界注入（見 document-retrieval spec: Bounded table-row injection）：
// 密集規格/pin 表的單屬性查詢對整表 chunk 相似度被稀釋、進不了主池（spec-table-recall-
// dilution）。修法：ingestion 把大表每列另存 table_rows（不進主池），檢索時只在
// 「列相似度 ≥ 門檻」時取前 ≤2 列「附加」進候選池，主池分毫不動——門檻即 router、
// 上限即保險絲，rerank 當守門員。門檻 0.60 由探測定（probe3：正解列 0.64–0.72，
// 無關查詢噪音多在 0.43–0.55）。前案「拆列進主池」無界競爭淨負已否決（openspec archive）。
const ROW_SIM_FLOOR = parseFloat(process.env.ROW_SIM_FLOOR || '0.60');
const MAX_ROW_INJECT = parseInt(process.env.MAX_ROW_INJECT || '2', 10);

// 字面加成：embedding 分不出「pin 1」與「pin 5」（數字語意太弱），查詢裡的數字/短英數
// token（IP、J105）若與列首格吻合（數字須全等、字母 token 為包含），該列在過門檻的候選中
// 優先注入。純 reorder：不放寬門檻、不增加注入數。
function boostRowsByFirstCell(query, rows) {
  const nums = query.match(/\d+/g) || [];
  const words = (query.match(/[A-Za-z][A-Za-z0-9_-]+/g) || []).map(w => w.toLowerCase());
  const hit = (r) => {
    const fc = String(r.firstCell || '').trim();
    if (!fc) return 0;
    if (nums.includes(fc)) return 1;
    const fcl = fc.toLowerCase();
    return words.some(w => fcl.includes(w)) ? 1 : 0;
  };
  return [...rows].sort((a, b) => hit(b) - hit(a) || b.similarity - a.similarity);
}
const NO_ANSWER_PHRASE = '無法在提供的資料中找到答案';
// 放棄語前綴：NO_ANSWER_PHRASE 的共同前綴。模型放棄時常改寫尾巴（「…找到與X相關的資訊」），
// 用前綴才抓得到這些變體；仍是系統指定放棄語的一部分，誤中正常答案的機率低。
const NO_ANSWER_PREFIX = '無法在提供的資料中找到';

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
      + '- 但若 netlist 工具查無相關結果(所有查詢都 found:false),而問題其實文件也可能回答'
      + '(不限於晶片/零件/規格,也包含某連接器/介面的用途、某編號代表什麼等),你「必須」接著呼叫 search_documents'
      + '從已上傳文件中找答案,不可只查 netlist 就回答找不到。\n';
  }
  s += `\n針對「文件內容類」問題,若 search_documents 的結果不足以回答,才說「${NO_ANSWER_PHRASE}」,`
    + '並根據下方 NPDS 文件目錄建議使用者上傳 1–3 份最相關的文件(含代碼、名稱、所屬階段)。'
    + '此「建議上傳文件」僅適用於文件內容類問題,不適用於線路/連線類問題。'
    + '建議上傳的文件「只能」從下方目錄挑選(目錄已排除已上傳的);'
    + '出現在檢索結果或來源中的文件代表「已經上傳」,不可建議使用者上傳它們。\n';
  s += `\n## NPDS 文件目錄(參考,供建議上傳用)\n${formatCatalogForPrompt(uploadedCodes)}`;
  return s;
}

// 是否該由系統代跑一次強制文件檢索（純函式，便於窮舉各分支測試）。
// 前提：專案有文件、整段對話從未成功查過文件、且尚未強制過。滿足前提後，下列任一為真即回 true：
// 「完全沒用工具」、「用了 netlist 但每次查詢都 miss」、或「最終答案是放棄語（沒查文件就要放棄）」。
function shouldForceDocSearch({ hasDocs, usedDocSearch, forcedSearch, usedAnyTool, netlistCalls, netlistMisses, givingUp }) {
  if (!hasDocs || usedDocSearch || forcedSearch) return false;
  const allNetlistMissed = netlistCalls > 0 && netlistMisses === netlistCalls;
  return !usedAnyTool || allNetlistMissed || !!givingUp;
}

// 文件檢索：embed 問題 → hybrid search（向量 + 關鍵字融合）取 top-K chunks，
// 並把來源 docId 累積到 sources。store 未提供 hybridSearch（舊注入物件）時退回純向量。
// projectContext 非空時作為首個 chunk 一併回傳（不列入 sources）：qwen3:14b 實測只信工具
// 結果、無視 system prompt 裡的背景（「務必根據工具結果回答」壓過「背景可直接引用」），
// 把背景塞進工具結果它才會用。
async function runSearchDocuments(adapter, store, query, projectId, sources, projectContext) {
  // 跨語言召回：專案文件多為英文，中文查詢對英文 chunk 召回常不足。含 CJK 的查詢
  // 另產生英文版本，原查詢與英文查詢各自檢索、round-robin 合併去重成候選池（補召回），
  // rerank 仍以原查詢判定相關性，但 snippet 開窗用全部變體（補英文表格的答案可見性）。
  const variants = await expandQuery(adapter, query);
  const lists = [];
  const queryVectors = []; // 留給 sidecar 表格列注入複用（零額外 embed 成本）
  for (const q of variants) {
    const v = await adapter.embed(q);
    queryVectors.push(v);
    lists.push(typeof store.hybridSearch === 'function'
      ? await store.hybridSearch(q, v, RERANK_POOL_K, projectId)
      : await store.search(v, RERANK_POOL_K, projectId));
  }
  const seen = new Set();
  const pool = [];
  for (let i = 0; i < RERANK_POOL_K && pool.length < UNION_CAP; i++) {
    for (const list of lists) {
      const c = list[i];
      if (!c) continue;
      if (c.id != null && seen.has(c.id)) continue; // 依 chunk id 去重（真實 chunk 皆有 id）
      if (c.id != null) seen.add(c.id);
      pool.push(c);
      if (pool.length >= UNION_CAP) break;
    }
  }
  // Sidecar 表格列有界注入：各 variant 向量查 table_rows（跨 variant 同列取最高分），
  // 過門檻者經字面加成排序後取前 ≤2「附加」進池（主池候選一個不少）。
  // fetch 數取 50：正解 pin 列在列索引純向量排名可到 20~30 名，字面加成要看得到才救得起。
  if (typeof store.searchTableRows === 'function') {
    const rowCands = new Map();
    for (const v of queryVectors) {
      for (const r of await store.searchTableRows(v, 50, projectId)) {
        const prev = rowCands.get(r.id);
        if (!prev || r.similarity > prev.similarity) rowCands.set(r.id, r);
      }
    }
    const passed = [...rowCands.values()].filter(r => r.similarity >= ROW_SIM_FLOOR);
    for (const r of boostRowsByFirstCell(query, passed).slice(0, MAX_ROW_INJECT)) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      pool.push({ id: r.id, docId: r.docId, title: r.title, text: r.text, distance: 1 - r.similarity });
    }
  }

  // rerank 以原查詢判定相關性；snippet 開窗改用全部變體（含英文版），補跨語言可見性缺口
  const chunks = await rerankChunks(adapter, query, pool, TOP_K, variants);
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
  let usedDocSearch = false;
  let forcedSearch = false;
  // netlist 全 miss 的偵測：問題被路由到 netlist 但每一次查詢都查無結果時，
  // 模型常直接回「查無此 net」放棄，不再試文件——即使答案其實在文件裡。
  let netlistCalls = 0;
  let netlistMisses = 0;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const { functionCalls, text } = await adapter.chatWithTools(contents, tools);

    if (!functionCalls.length) {
      // 程式層防護：小模型（如 qwen3:14b）對 prompt 規則不可靠，可能沒查文件就作答。
      // 三種情境代跑一次文件檢索、以工具回合塞回歷史讓模型重答（僅強制一次，避免迴圈）：
      // (a) 完全沒用工具就作答；(b) 只用了 netlist 且每次查詢都 miss；(c) 最終答案是放棄語（沒查文件就要放棄）。
      // 只要曾成功查過文件（usedDocSearch），就不介入。
      const givingUp = (text || '').includes(NO_ANSWER_PREFIX);
      if (shouldForceDocSearch({ hasDocs, usedDocSearch, forcedSearch, usedAnyTool, netlistCalls, netlistMisses, givingUp })) {
        forcedSearch = true;
        usedDocSearch = true;
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
        usedDocSearch = true;
        response = await runSearchDocuments(adapter, store, fc.args.query || question, projectId, sources, projectContext);
      } else {
        const r = await netlist.runNetlistTool(projectName, fc.name, fc.args || {});
        netlistCalls++;
        // miss 判定涵蓋各工具查無結構（found:false / find 的 count:0 / 工具錯誤），見 netlist.isNetlistMiss
        if (netlist.isNetlistMiss(r)) netlistMisses++;
        response = r.ok ? r.result : { error: r.error };
      }
      responseParts.push({ functionResponse: { name: fc.name, response } });
    }
    contents.push({ role: 'function', parts: responseParts });
  }

  yield { type: 'token', value: '查詢過程過長,請換個方式詢問。' };
  yield { type: 'sources', value: [] };
}

module.exports = { answer, shouldForceDocSearch, boostRowsByFirstCell };
