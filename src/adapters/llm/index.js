const adapterName = (process.env.LLM_ADAPTER || 'gemini').toLowerCase();

const adapters = {
  gemini: () => {
    const GeminiAdapter = require('./gemini');
    return new GeminiAdapter();
  },
  // 測試用假 LLM：不打真實 API、不耗配額，仍完整跑工具呼叫流程
  mock: () => {
    const MockAdapter = require('./mock');
    return new MockAdapter();
  },
};

if (!adapters[adapterName]) {
  throw new Error(`Unknown LLM_ADAPTER: "${adapterName}". Available: ${Object.keys(adapters).join(', ')}`);
}

module.exports = adapters[adapterName]();
