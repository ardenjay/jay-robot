const LLMAdapter = require('./base');

// 從第一個 user 訊息取出真正的問題（system instruction 後面接「## 使用者問題」）
function extractQuestion(contents) {
  const first = (contents || []).find(c => c.role === 'user');
  const text = first ? first.parts.map(p => p.text || '').join('') : '';
  const idx = text.lastIndexOf('使用者問題');
  return (idx >= 0 ? text.slice(idx).replace(/^使用者問題[\s:：\n]*/, '') : text).trim();
}

// 依問題決定要呼叫哪個 netlist 工具（決定性、無 LLM）
function pickTool(question) {
  const pin = question.match(/\b([A-Za-z]{1,4}\d+)\.([A-Za-z0-9]+)\b/);
  if (pin) return { name: 'netlist_trace', args: { pin: `${pin[1].toUpperCase()}.${pin[2]}` } };
  const ref = question.match(/\b([A-Za-z]{1,3}\d+)\b/);
  if (ref) return { name: 'netlist_part', args: { refdes: ref[1].toUpperCase() } };
  const net = question.match(/\b([A-Z][A-Z0-9_]{2,})\b/);
  if (net) return { name: 'netlist_net', args: { netname: net[1] } };
  const kw = question.match(/[A-Za-z][A-Za-z0-9]{2,}/);
  if (kw) return { name: 'netlist_find', args: { keyword: kw[0] } };
  return { name: 'netlist_info', args: {} };
}

function formatResult(name, r) {
  if (!r || r.error) return `工具錯誤：${(r && r.error) || '未知'}`;
  if (name === 'netlist_part' || name === 'netlist_connector') {
    if (!r.found) return r.error || '查無此零件';
    const pins = (r.pins || []).slice(0, 80).map(p => `- ${p.pin} → ${p.net}`).join('\n');
    return `**${r.refdes}** = ${r.part}\n\n腳位 → net：\n${pins}`;
  }
  if (name === 'netlist_net') {
    if (!r.found) {
      if (r.suggestions) return `沒有精確的 net，候選：\n${r.suggestions.map(s => `- ${s.net}（${s.nodes} 節點）`).join('\n')}`;
      if (r.label_nets) return `「${r.query}」是腳位標籤，所在 net：\n${r.label_nets.map(n => `- ${n}`).join('\n')}`;
      return r.error || '查無此 net';
    }
    const head = r.truncated
      ? `**${r.net}** 共 ${r.node_count} 個節點（大網，僅顯示前 ${r.shown}）`
      : `**${r.net}**（${r.node_count} 個節點）`;
    const nodes = (r.nodes || []).map(n => `- ${n.refdes}.${n.pin} ${n.part}`).join('\n');
    return `${head}\n\n${nodes}`;
  }
  if (name === 'netlist_trace') {
    if (r.power_net) return `⚠️ ${r.warning}\n\n${r.suggestion}`;
    if (!r.found) return r.error || '無法追線';
    const paths = (r.paths || []).slice(0, 10)
      .map((p, i) => `路徑 ${i + 1}：` + p.map(s => `${s.refdes}.${s.pin}`).join(' → ')).join('\n');
    return `從 ${r.start} 追線，共 ${r.path_count} 條${r.path_count > 10 ? '（顯示前 10）' : ''}：\n${paths}`;
  }
  if (name === 'netlist_find') {
    if (!r.count) return `找不到含「${r.keyword}」的零件`;
    return `找到 ${r.count} 個：\n` + r.hits.slice(0, 20).map(h => `- ${h.refdes} ${h.part}（${h.pins} 腳）`).join('\n');
  }
  if (name === 'netlist_info') {
    return `板子總覽：${r.parts} 零件 / ${r.nets} nets / ${r.nodes} 節點`;
  }
  if (name === 'search_documents') {
    if (!r.chunk_count) return '文件中找不到相關內容。';
    return r.chunks.map(c => `**${c.title}**\n${c.text}`).join('\n\n---\n\n');
  }
  return '```json\n' + JSON.stringify(r, null, 1) + '\n```';
}

// 假 LLM：不打真實 API。第一輪依問題挑工具,第二輪把工具結果格式化成 Markdown 答案。
class MockAdapter extends LLMAdapter {
  async embed() { return new Array(3072).fill(0); }
  async embedBatch(texts) { return texts.map(() => new Array(3072).fill(0)); }
  async generate() { return '【mock】此為測試用假 LLM。'; }
  async *stream() { yield '【mock】此為測試用假 LLM。'; }

  async chatWithTools(contents, tools) {
    const toolNames = new Set((tools || []).map(t => t.name));
    const fnResp = [...(contents || [])].reverse().find(c => c.role === 'function');

    if (!fnResp) {
      const question = extractQuestion(contents);
      const pick = pickTool(question);
      if (toolNames.has(pick.name)) return { functionCalls: [pick], text: null };
      if (toolNames.has('search_documents')) {
        return { functionCalls: [{ name: 'search_documents', args: { query: question } }], text: null };
      }
      return { functionCalls: [], text: '【mock】此專案沒有可用的工具。' };
    }

    const part = (fnResp.parts || []).find(p => p.functionResponse);
    const fc = part ? part.functionResponse : null;
    const body = fc ? formatResult(fc.name, fc.response) : '（無工具結果）';
    return { functionCalls: [], text: `（mock 依工具結果作答）\n\n${body}` };
  }
}

module.exports = MockAdapter;
