const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const NETLIST_ROOT = path.join(process.cwd(), 'tools', 'netlist');
const NETPARSE = path.join(NETLIST_ROOT, 'netparse.py');
const REQUIRED_FILES = ['pstxprt.dat', 'pstchip.dat', 'pstxnet.dat'];
const MAX_BUFFER = 20 * 1024 * 1024;

// 依「專案名稱」解析 netlist 資料夾；三個 .dat 齊全才視為有 netlist，否則回 null。
function netlistDir(projectName) {
  if (!projectName) return null;
  const dir = path.join(NETLIST_ROOT, projectName);
  const ok = REQUIRED_FILES.every(f => fs.existsSync(path.join(dir, f)));
  return ok ? dir : null;
}

function hasNetlist(projectName) {
  return netlistDir(projectName) !== null;
}

// 執行 netparse 某命令（--json），回傳 { ok, result } 或 { ok:false, error }。
// 注意：查詢「找不到」不是錯誤——netparse 會以 exit 0 回 found:false 的 JSON。
function runNetparse(projectName, cmd, extraArgs = []) {
  const dir = netlistDir(projectName);
  if (!dir) {
    return Promise.resolve({ ok: false, error: `專案 '${projectName}' 沒有可用的 netlist` });
  }
  const args = [NETPARSE, '--dir', dir, cmd, ...extraArgs, '--json'];
  return new Promise(resolve => {
    execFile('python3', args, { maxBuffer: MAX_BUFFER }, (err, stdout, stderr) => {
      if (err) {
        return resolve({ ok: false, error: (stderr || err.message || '').trim() || 'netparse 執行失敗' });
      }
      try {
        resolve({ ok: true, result: JSON.parse(stdout) });
      } catch (e) {
        resolve({ ok: false, error: `netparse 輸出非合法 JSON: ${e.message}` });
      }
    });
  });
}

// 各查詢的便捷包裝
const queryInfo = p => runNetparse(p, 'info');
const queryFind = (p, keyword) => runNetparse(p, 'find', [String(keyword)]);
const queryPart = (p, refdes) => runNetparse(p, 'part', [String(refdes)]);
const queryNet = (p, netname) => runNetparse(p, 'net', [String(netname)]);
const queryPin = (p, label) => runNetparse(p, 'pin', [String(label)]);
const queryConnector = (p, refdes) => runNetparse(p, 'connector', [String(refdes)]);
const queryTrace = (p, pin, hopCap = false) =>
  runNetparse(p, 'trace', hopCap ? [String(pin), '--hop-cap'] : [String(pin)]);

// 給 LLM 的工具(function)宣告
const NETLIST_TOOL_DECLARATIONS = [
  {
    name: 'netlist_part',
    description: '查某零件(refdes,如 U42)的所有腳位,以及每個腳位接到的 net',
    parameters: { type: 'object', properties: { refdes: { type: 'string', description: '零件編號,如 U42' } }, required: ['refdes'] },
  },
  {
    name: 'netlist_net',
    description: '查某條 net 上連接了哪些零件腳位',
    parameters: { type: 'object', properties: { netname: { type: 'string', description: 'net 名稱' } }, required: ['netname'] },
  },
  {
    name: 'netlist_pin',
    description: '用腳位/訊號標籤反查它出現在哪些零件腳上、屬於哪條 net',
    parameters: { type: 'object', properties: { label: { type: 'string', description: '腳位/訊號標籤' } }, required: ['label'] },
  },
  {
    name: 'netlist_find',
    description: '依關鍵字(零件名或型號,如 RTL8126)搜尋零件',
    parameters: { type: 'object', properties: { keyword: { type: 'string' } }, required: ['keyword'] },
  },
  {
    name: 'netlist_trace',
    description: '從某腳位(格式 refdes.pin,如 U42.4)追線,穿過串聯 R/L/FB(可選穿過電容)直到端點',
    parameters: {
      type: 'object',
      properties: {
        pin: { type: 'string', description: '起點腳位,格式 refdes.pin' },
        hop_cap: { type: 'boolean', description: '是否也穿過電容(預設否)' },
      },
      required: ['pin'],
    },
  },
  {
    name: 'netlist_info',
    description: '回傳這塊板子的總覽(net 數、零件數、零件前綴分布)',
    parameters: { type: 'object', properties: {} },
  },
];

// 由工具名稱 + 參數 分派到對應查詢，供工具迴圈呼叫
function runNetlistTool(projectName, name, args = {}) {
  switch (name) {
    case 'netlist_part': return queryPart(projectName, args.refdes);
    case 'netlist_net': return queryNet(projectName, args.netname);
    case 'netlist_pin': return queryPin(projectName, args.label);
    case 'netlist_find': return queryFind(projectName, args.keyword);
    case 'netlist_trace': return queryTrace(projectName, args.pin, !!args.hop_cap);
    case 'netlist_info': return queryInfo(projectName);
    default: return Promise.resolve({ ok: false, error: `未知的 netlist 工具: ${name}` });
  }
}

module.exports = {
  netlistDir,
  hasNetlist,
  runNetparse,
  queryInfo,
  queryFind,
  queryPart,
  queryNet,
  queryPin,
  queryConnector,
  queryTrace,
  NETLIST_TOOL_DECLARATIONS,
  runNetlistTool,
};
