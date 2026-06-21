const adapterName = (process.env.LLM_ADAPTER || 'gemini').toLowerCase();

const adapters = {
  gemini: () => {
    const GeminiAdapter = require('./gemini');
    return new GeminiAdapter();
  },
};

if (!adapters[adapterName]) {
  throw new Error(`Unknown LLM_ADAPTER: "${adapterName}". Available: ${Object.keys(adapters).join(', ')}`);
}

module.exports = adapters[adapterName]();
