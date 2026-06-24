const { GoogleGenerativeAI } = require('@google/generative-ai');
const LLMAdapter = require('./base');

const EMBED_MODEL = 'gemini-embedding-001';
const GEN_MODEL = 'gemini-2.5-flash';
const MAX_RETRIES = 5;
const MAX_BACKOFF_MS = 60_000;
// 低 temperature：RAG 任務要忠於文件、回答一致，避免同問題隨機放棄作答
const GEN_TEMPERATURE = 0.2;

// 從 429 errorDetails 取出伺服器建議的 RetryInfo.retryDelay（如 "17s"），回傳毫秒；無則 null
function parseRetryDelayMs(err) {
  const details = err && err.errorDetails;
  if (!Array.isArray(details)) return null;
  const info = details.find(d => typeof d['@type'] === 'string' && d['@type'].includes('RetryInfo'));
  if (!info || !info.retryDelay) return null;
  const m = String(info.retryDelay).match(/([\d.]+)s/);
  return m ? Math.round(parseFloat(m[1]) * 1000) : null;
}

async function withBackoff(fn) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit = err.status === 429 || (err.message && err.message.includes('429'));
      if (!isRateLimit || attempt === MAX_RETRIES - 1) throw err;
      // 優先依伺服器建議的 retryDelay 等待，否則指數退避；皆設上限
      const suggested = parseRetryDelayMs(err);
      const delay = Math.min(suggested ?? Math.pow(2, attempt) * 1000, MAX_BACKOFF_MS);
      await new Promise(res => setTimeout(res, delay));
    }
  }
}

class GeminiAdapter extends LLMAdapter {
  constructor(apiKey) {
    super();
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY is required');
    this.client = new GoogleGenerativeAI(key);
    // 啟動時印出載入的 key 指紋（只印前後碼，不外洩完整 key），方便確認換 key 是否生效
    console.log(`[Gemini] key 載入：${key.slice(0, 6)}...${key.slice(-4)}（長度 ${key.length}）`);
  }

  async embed(text) {
    return withBackoff(async () => {
      const model = this.client.getGenerativeModel({ model: EMBED_MODEL });
      const result = await model.embedContent(text);
      return result.embedding.values;
    });
  }

  // 批次 embedding：一次送多筆，減少 API 請求數（降低 429 風險）。回傳與輸入同序的向量陣列。
  async embedBatch(texts) {
    if (texts.length === 0) return [];
    return withBackoff(async () => {
      const model = this.client.getGenerativeModel({ model: EMBED_MODEL });
      const result = await model.batchEmbedContents({
        requests: texts.map(text => ({ content: { parts: [{ text }] } })),
      });
      return result.embeddings.map(e => e.values);
    });
  }

  async generate(prompt) {
    return withBackoff(async () => {
      const model = this.client.getGenerativeModel({
        model: GEN_MODEL,
        generationConfig: { temperature: GEN_TEMPERATURE },
      });
      const result = await model.generateContent(prompt);
      return result.response.text();
    });
  }

  // 工具呼叫（function calling）：送出工具宣告，回傳 LLM 要求的 functionCalls 或最終文字。
  // 預設 AUTO 模式（由模型決定是否呼叫工具）。呼叫端負責多輪迴圈（回填 functionResponse 後再呼叫）。
  async chatWithTools(contents, tools) {
    return withBackoff(async () => {
      const model = this.client.getGenerativeModel({
        model: GEN_MODEL,
        generationConfig: { temperature: GEN_TEMPERATURE },
        tools: tools && tools.length ? [{ functionDeclarations: tools }] : undefined,
      });
      const result = await model.generateContent({ contents });
      const resp = result.response;
      const calls = (typeof resp.functionCalls === 'function' ? resp.functionCalls() : null) || [];
      if (calls.length) {
        return { functionCalls: calls.map(c => ({ name: c.name, args: c.args || {} })), text: null };
      }
      return { functionCalls: [], text: resp.text() };
    });
  }

  async *stream(prompt) {
    const model = this.client.getGenerativeModel({
      model: GEN_MODEL,
      generationConfig: { temperature: GEN_TEMPERATURE },
    });
    const result = await withBackoff(() => model.generateContentStream(prompt));
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
  }
}

module.exports = GeminiAdapter;
