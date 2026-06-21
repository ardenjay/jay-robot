class VectorAdapter {
  async add(chunks) {
    throw new Error('NotImplementedError: add() must be implemented');
  }

  async search(vector, topK) {
    throw new Error('NotImplementedError: search() must be implemented');
  }

  async clear(docId) {
    throw new Error('NotImplementedError: clear() must be implemented');
  }
}

module.exports = VectorAdapter;
