const adapterName = (process.env.VECTOR_ADAPTER || 'sqlite').toLowerCase();

const adapters = {
  sqlite: () => {
    const SqliteVectorAdapter = require('./sqlite');
    return new SqliteVectorAdapter();
  },
};

if (!adapters[adapterName]) {
  throw new Error(`Unknown VECTOR_ADAPTER: "${adapterName}". Available: ${Object.keys(adapters).join(', ')}`);
}

module.exports = adapters[adapterName]();
