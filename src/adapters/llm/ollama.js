const LLMAdapter = require('./base');

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_GEN_MODEL = 'qwen3:14b';
const DEFAULT_EMBED_MODEL = 'bge-m3';
// temperature 0（greedy）：工具迴圈 + 小模型（qwen3:14b）在 0.2 仍會同題不同解——
// 有時讀到 prompt 開頭的專案背景、有時忽略。改 0 讓同樣輸入永遠同樣輸出，行為可調試；
// 需要多樣性時以 OLLAMA_TEMPERATURE 覆寫。
const GEN_TEMPERATURE = process.env.OLLAMA_TEMPERATURE !== undefined
  ? parseFloat(process.env.OLLAMA_TEMPERATURE)
  : 0;
// Ollama 執行期預設 num_ctx 僅 4096，遠小於模型上限；system prompt（含 NPDS 目錄）+ 工具宣告
// 就會超過，Ollama 會「從前面靜默截斷」——等於砍掉 system 指令與工具，模型開始亂答。
// 實測 2581 個真實請求最大 prompt 9310 tokens、90 百分位 6198；12288 對最大 prompt 仍留
// 約 3000 tokens 給生成，又比 16384 少預留 25% KV。可由 OLLAMA_NUM_CTX 覆寫。
const DEFAULT_NUM_CTX = 12288;

// Gemini 形狀的 contents → Ollama messages。呼叫端（retrieval）維持 Gemini 格式，差異關在這裡。
function toOllamaMessages(contents) {
  const messages = [];
  for (const c of contents || []) {
    if (c.role === 'system') {
      messages.push({ role: 'system', content: (c.parts || []).map(p => p.text || '').join('') });
    } else if (c.role === 'user') {
      messages.push({ role: 'user', content: (c.parts || []).map(p => p.text || '').join('') });
    } else if (c.role === 'model') {
      const toolCalls = (c.parts || []).filter(p => p.functionCall).map(p => ({
        function: { name: p.functionCall.name, arguments: p.functionCall.args || {} },
      }));
      if (toolCalls.length) {
        messages.push({ role: 'assistant', content: '', tool_calls: toolCalls });
      } else {
        messages.push({ role: 'assistant', content: (c.parts || []).map(p => p.text || '').join('') });
      }
    } else if (c.role === 'function') {
      // 每個 functionResponse 一則 tool message
      for (const p of c.parts || []) {
        if (p.functionResponse) {
          messages.push({ role: 'tool', content: JSON.stringify(p.functionResponse.response ?? {}) });
        }
      }
    }
  }
  return messages;
}

// Gemini functionDeclarations 形狀 → Ollama tools 形狀（欄位皆為 JSON Schema，一對一）
function toOllamaTools(tools) {
  return (tools || []).map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

// tool_calls 的 arguments 可能是物件或 JSON 字串；壞 JSON 容錯為 {}
function parseArgs(args) {
  if (args == null) return {};
  if (typeof args === 'object') return args;
  try { return JSON.parse(args); } catch { return {}; }
}

class OllamaAdapter extends LLMAdapter {
  constructor(opts = {}) {
    super();
    this.baseUrl = (opts.baseUrl || process.env.OLLAMA_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.genModel = opts.genModel || process.env.OLLAMA_GEN_MODEL || DEFAULT_GEN_MODEL;
    this.embedModel = opts.embedModel || process.env.OLLAMA_EMBED_MODEL || DEFAULT_EMBED_MODEL;
    this.numCtx = opts.numCtx || parseInt(process.env.OLLAMA_NUM_CTX, 10) || DEFAULT_NUM_CTX;
    this.fetch = opts.fetch || globalThis.fetch;
    // 請求逾時與瞬斷重試：長跑時本機 Ollama 高負載下偶發連線瞬斷/卡死，adapter 層自癒。
    this.timeoutMs = opts.timeoutMs || parseInt(process.env.OLLAMA_TIMEOUT_MS, 10) || 120000;
    this.maxRetries = opts.maxRetries != null ? opts.maxRetries
      : (process.env.OLLAMA_MAX_RETRIES != null ? parseInt(process.env.OLLAMA_MAX_RETRIES, 10) : 2);
    this.retryDelayMs = opts.retryDelayMs != null ? opts.retryDelayMs
      : (process.env.OLLAMA_RETRY_DELAY_MS != null ? parseInt(process.env.OLLAMA_RETRY_DELAY_MS, 10) : 2000);
    console.log(`[Ollama] ${this.baseUrl}｜生成：${this.genModel}｜embedding：${this.embedModel}｜num_ctx：${this.numCtx}`);
  }

  async _post(path, body) {
    let res;
    try {
      res = await this.fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(`無法連線 Ollama（${this.baseUrl}），請確認 ollama serve 已啟動：${err.message}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let detail = text;
      try { detail = JSON.parse(text).error || text; } catch {}
      const hint = /not found/i.test(detail) ? `（模型未安裝？請執行 ollama pull ${body.model}）` : '';
      throw new Error(`Ollama ${path} 回應 ${res.status}：${detail}${hint}`);
    }
    return res;
  }

  // 非串流請求：fetch + res.json() 包在同一個 AbortController timeout 內（timeout 涵蓋到取得
  // 完整 JSON，因生成是在讀 body 時發生，非 fetch resolve 時）。連線瞬斷/逾時/5xx 自動重試，
  // 4xx（如 model not found）確定性錯誤不重試。重試耗盡拋含 URL + ollama serve 指引的錯誤。
  async _postJson(path, body) {
    const attempts = Math.max(1, this.maxRetries + 1);
    let lastErr;
    for (let i = 0; i < attempts; i++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetch(`${this.baseUrl}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          let detail = text;
          try { detail = JSON.parse(text).error || text; } catch {}
          const hint = /not found/i.test(detail) ? `（模型未安裝？請執行 ollama pull ${body.model}）` : '';
          const httpErr = new Error(`Ollama ${path} 回應 ${res.status}：${detail}${hint}`);
          if (res.status >= 400 && res.status < 500) throw httpErr; // 確定性錯誤，不重試
          lastErr = httpErr; // 5xx 可重試
        } else {
          const data = await res.json();
          // 近上限警告：num_ctx 調小後,prompt 超過會被 Ollama 從前面靜默截斷、悄悄掉內容。
          // 實際 prompt token 數(prompt_eval_count)超過 num_ctx 90% 時印警告,讓接近截斷顯性化。
          // 只適用生成(/api/chat):embedding 批次的 prompt_eval_count 是「全批文字的總和」,
          // 每筆各自獨立 embed、單筆遠低於上限,拿總和比 num_ctx 必誤報(實測批次 33402/12288
          // 照樣全對)——embed 路徑跳過,免得狼來了稀釋真警告。
          if (path !== '/api/embed' && data.prompt_eval_count && data.prompt_eval_count > this.numCtx * 0.9) {
            console.warn(`[Ollama] prompt 用了 ${data.prompt_eval_count}/${this.numCtx} tokens（>90%），接近 num_ctx 上限，可能被截斷`);
          }
          return data;
        }
      } catch (err) {
        if (err.message && err.message.startsWith('Ollama ')) throw err; // 4xx httpErr，直接往上拋
        const reason = err.name === 'AbortError' ? `請求逾時（${this.timeoutMs}ms）` : err.message;
        lastErr = new Error(`無法連線 Ollama（${this.baseUrl}），請確認 ollama serve 已啟動：${reason}`);
      } finally {
        clearTimeout(timer);
      }
      if (i < attempts - 1) {
        console.warn(`[Ollama] ${path} 第 ${i + 1} 次失敗，${this.retryDelayMs}ms 後重試：${lastErr.message}`);
        await new Promise(r => setTimeout(r, this.retryDelayMs));
      }
    }
    throw lastErr;
  }

  async embed(text) {
    const vectors = await this.embedBatch([text]);
    return vectors[0];
  }

  // /api/embed 原生支援批次：input 傳陣列，一次請求回傳同序向量
  async embedBatch(texts) {
    if (texts.length === 0) return [];
    const data = await this._postJson('/api/embed', { model: this.embedModel, input: texts });
    return data.embeddings;
  }

  // 立刻卸載生成模型釋放 VRAM（MinerU VLM 轉檔等外部程序要用 GPU 時呼叫）。
  // keep_alive: 0 是「單次請求」語意：只卸這一次,不改伺服器的 OLLAMA_KEEP_ALIVE 預設;
  // 下次任何生成請求會自動重載並恢復預設常駐,無需復原任何設定。embedding 模型不動。
  async unloadGenerateModel() {
    await this._postJson('/api/generate', { model: this.genModel, keep_alive: 0 });
  }

  _chatBody(messages, extra = {}) {
    return {
      model: this.genModel,
      messages,
      think: false, // qwen3 是 thinking 模型；工具迴圈每輪都推理，關掉以壓延遲
      options: { temperature: GEN_TEMPERATURE, num_ctx: this.numCtx },
      ...extra,
    };
  }

  async generate(prompt) {
    const data = await this._postJson('/api/chat', this._chatBody([{ role: 'user', content: prompt }], { stream: false }));
    return (data.message && data.message.content) || '';
  }

  // stream:true 回 NDJSON（一行一個 JSON chunk），逐段 yield message.content（忽略 message.thinking）
  async *stream(prompt) {
    const res = await this._post('/api/chat', this._chatBody([{ role: 'user', content: prompt }], { stream: true }));
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop(); // 最後一段可能不完整，留到下一輪
      for (const line of lines) {
        if (!line.trim()) continue;
        const chunk = JSON.parse(line);
        const text = chunk.message && chunk.message.content;
        if (text) yield text;
        if (chunk.done) return;
      }
    }
  }

  async chatWithTools(contents, tools) {
    const body = this._chatBody(toOllamaMessages(contents), { stream: false });
    if (tools && tools.length) body.tools = toOllamaTools(tools);
    const data = await this._postJson('/api/chat', body);
    const msg = data.message || {};
    const calls = msg.tool_calls || [];
    if (calls.length) {
      return {
        functionCalls: calls.map(c => ({ name: c.function.name, args: parseArgs(c.function.arguments) })),
        text: null,
      };
    }
    return { functionCalls: [], text: msg.content || '' };
  }
}

module.exports = OllamaAdapter;
module.exports.toOllamaMessages = toOllamaMessages;
module.exports.toOllamaTools = toOllamaTools;
