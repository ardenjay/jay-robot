const HEAD_LEN = 400;      // 每個候選片段先取的前段長度（＝原本固定截斷長度，保證不比舊行為差）
const WIN_BEFORE = 60;     // query 命中處視窗往前
const WIN_AFTER = 180;     // query 命中處視窗往後

// query-aware 片段：長 chunk（如規格表）答案可能落在前段之後，固定截斷會讓重排器看不到
// 關鍵字而誤踢。做法是純加法——一律先給 head（同舊行為），再看查詢關鍵字有沒有「只出現在
// head 之後」，有的話另附該命中處一段視窗把答案帶出。只看落在 head 之後的命中（head 內已可見
// 的詞如查詢裡的產品名不算），避免被前段就命中的通用詞誤導而漏掉真正深埋的答案關鍵字。
function buildSnippet(query, text) {
  const s = String(text || '');
  if (s.length <= HEAD_LEN) return s;
  const head = s.slice(0, HEAD_LEN);
  const terms = String(query || '').split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 2);
  let hit = -1;
  for (const t of terms) {
    const i = s.indexOf(t);
    if (i >= HEAD_LEN && (hit < 0 || i < hit)) hit = i; // 只看落在 head 之後的命中
  }
  if (hit < 0) return head;
  const win = s.slice(Math.max(0, hit - WIN_BEFORE), hit + WIN_AFTER);
  return `${head} … ${win}`;
}

function buildPrompt(query, chunks, topK) {
  const listing = chunks
    .map((c, i) => `[${i}] ${c.title}\n${buildSnippet(query, c.text)}`)
    .join('\n\n');
  return `你是文件檢索的相關性判斷器。使用者問題：「${query}」\n\n`
    + `以下是候選文件片段，每段前有編號 [n]：\n\n${listing}\n\n`
    + `請找出「最能」回答上述問題的片段，依相關性由高到低排序，最多列出 ${Math.min(chunks.length, topK)} 個編號。`
    + `只回傳一個 JSON 陣列（例如 [3,0,7]），不要任何其他文字或說明。`;
}

function parseIndices(raw, maxIndex) {
  const match = String(raw || '').match(/\[[\d,\s]+\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]);
    return arr.filter(n => Number.isInteger(n) && n >= 0 && n < maxIndex);
  } catch {
    return [];
  }
}

// BM25/向量對跨語言或跨文件的相關性判斷不夠可靠（中文查詢 vs 英文內容、或全域統計
// 波動導致排名不穩，見 fts5-hybrid-search-gotchas 記憶）；候選數超過 topK 時，
// 用生成模型對候選片段做一次語意排序取代單純依賴檢索分數。
// 解析失敗或呼叫出錯時 SHALL NOT 中斷檢索，退回原排序的前 topK 筆。
async function rerankChunks(adapter, query, chunks, topK) {
  if (chunks.length <= topK) return chunks;

  let indices = [];
  try {
    const raw = await adapter.generate(buildPrompt(query, chunks, topK));
    indices = parseIndices(raw, chunks.length);
  } catch (err) {
    console.warn(`[rerank] LLM rerank 失敗，退回原排序：${err.message}`);
  }

  const seen = new Set();
  const picked = [];
  for (const i of indices) {
    if (seen.has(i)) continue;
    seen.add(i);
    picked.push(chunks[i]);
    if (picked.length >= topK) break;
  }
  // 模型輸出不足 topK（解析失敗或列出太少）時，依原排序遞補未選中的候選
  for (let i = 0; i < chunks.length && picked.length < topK; i++) {
    if (seen.has(i)) continue;
    seen.add(i);
    picked.push(chunks[i]);
  }
  return picked;
}

module.exports = { rerankChunks, buildSnippet };
