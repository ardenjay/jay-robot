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

  // 工具呼叫：給定對話訊息(contents)與工具宣告(tools)，回傳 LLM 要求的工具呼叫或最終文字。
  // 回傳 { functionCalls: [{name, args}], text: string|null }；呼叫端可將工具結果回填後再次呼叫。
  async chatWithTools(contents, tools) {
    throw new Error('NotImplementedError: chatWithTools() must be implemented');
  }
}

module.exports = LLMAdapter;
