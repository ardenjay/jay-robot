class LLMAdapter {
  async embed(text) {
    throw new Error('NotImplementedError: embed() must be implemented');
  }

  async embedBatch(texts) {
    throw new Error('NotImplementedError: embedBatch() must be implemented');
  }

  async generate(prompt) {
    throw new Error('NotImplementedError: generate() must be implemented');
  }

  async *stream(prompt) {
    throw new Error('NotImplementedError: stream() must be implemented');
  }
}

module.exports = LLMAdapter;
