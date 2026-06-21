class LLMAdapter {
  async embed(text) {
    throw new Error('NotImplementedError: embed() must be implemented');
  }

  async generate(prompt) {
    throw new Error('NotImplementedError: generate() must be implemented');
  }

  async *stream(prompt) {
    throw new Error('NotImplementedError: stream() must be implemented');
  }
}

module.exports = LLMAdapter;
