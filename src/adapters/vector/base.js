class VectorAdapter {
  async add(chunks) {
    throw new Error('NotImplementedError: add() must be implemented');
  }

  async search(vector, topK) {
    throw new Error('NotImplementedError: search() must be implemented');
  }

  // Hybrid search（向量 + 關鍵字融合）。預設實作 = 純向量搜尋，
  // 未實作 keyword 搜尋的 adapter（含測試 mock）行為不變。
  async hybridSearch(queryText, vector, topK, projectId) {
    return this.search(vector, topK, projectId);
  }

  async clear(docId) {
    throw new Error('NotImplementedError: clear() must be implemented');
  }
}

module.exports = VectorAdapter;
