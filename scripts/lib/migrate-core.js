// migrate 的純函式核心：不執行任何 ssh/rsync，只組參數與驗證，供單元測試。
const fs = require('fs');
const path = require('path');

// 搬運清單：來源相對路徑 → 本機相對路徑。excludes 交給 rsync --exclude。
// netlist 排除 *.py：netparse.py 是版控程式碼，不能被來源機舊版蓋掉。
const TRANSFER_LIST = [
  { name: 'DB（data/）', srcRel: 'data/', destRel: 'data/', excludes: [] },
  { name: '文件（public/documents/）', srcRel: 'public/documents/', destRel: 'public/documents/', excludes: [] },
  { name: 'netlist（tools/netlist/）', srcRel: 'tools/netlist/', destRel: 'tools/netlist/', excludes: ['*.py'] },
];

// user@host 驗證；不合法回 null
function parseTarget(spec) {
  const m = /^([A-Za-z0-9._-]+)@([A-Za-z0-9._-]+)$/.exec(spec || '');
  return m ? { user: m[1], host: m[2], target: spec } : null;
}

// 組 rsync 參數。來源結尾斜線在此強制補上——少了斜線會把整個資料夾巢狀塞進目標
// （實際踩過：public/documents/documents/，文件全 404）。
function buildRsyncArgs(target, remotePath, item, { dryRun = false } = {}) {
  const srcDir = path.posix.join(remotePath, item.srcRel).replace(/\/*$/, '/');
  const args = ['-az', '--stats'];
  if (dryRun) args.push('-n');
  for (const ex of item.excludes) args.push(`--exclude=${ex}`);
  args.push(`${target}:${srcDir}`, `./${item.destRel}`);
  return args;
}

// 驗證 public/documents/ 第一層：不得含名為 documents 的子目錄（rsync 巢狀特徵）。
// 回傳 { ok: true } 或 { ok: false, error, fix }。
function checkDocsLayout(docsRoot) {
  if (!fs.existsSync(docsRoot)) return { ok: true }; // 沒有文件也算正常
  const entries = fs.readdirSync(docsRoot, { withFileTypes: true });
  if (entries.some(e => e.isDirectory() && e.name === 'documents')) {
    return {
      ok: false,
      error: `偵測到巢狀目錄 ${path.join(docsRoot, 'documents')}（rsync 來源少了結尾斜線的特徵），文件連結會 404`,
      fix: `mv "${path.join(docsRoot, 'documents')}"/* "${docsRoot}/" && rmdir "${path.join(docsRoot, 'documents')}"`,
    };
  }
  return { ok: true };
}

// 由環境變數推目前 adapter 的預期 embedding 維度；推不出回 null（跳過檢查）
function expectedDim(env) {
  const adapter = (env.LLM_ADAPTER || 'gemini').toLowerCase();
  if (adapter === 'gemini') return 3072;
  if (adapter === 'ollama') {
    const model = (env.OLLAMA_EMBED_MODEL || 'bge-m3').toLowerCase();
    return model.startsWith('bge-m3') ? 1024 : null;
  }
  return null;
}

module.exports = { TRANSFER_LIST, parseTarget, buildRsyncArgs, checkDocsLayout, expectedDim };
