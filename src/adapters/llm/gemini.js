const { GoogleGenerativeAI } = require('@google/generative-ai');
const LLMAdapter = require('./base');

const EMBED_MODEL = 'gemini-embedding-001';
const GEN_MODEL = 'gemini-2.5-flash';
const MAX_RETRIES = 3;
// 低 temperature：RAG 任務要忠於文件、回答一致，避免同問題隨機放棄作答
const GEN_TEMPERATURE = 0.2;

async function withBackoff(fn) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit = err.status === 429 || (err.message && err.message.includes('429'));
      if (!isRateLimit || attempt === MAX_RETRIES - 1) throw err;
      const delay = Math.pow(2, attempt) * 1000;
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
  }

  async embed(text) {
    return withBackoff(async () => {
      const model = this.client.getGenerativeModel({ model: EMBED_MODEL });
      const result = await model.embedContent(text);
      return result.embedding.values;
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
