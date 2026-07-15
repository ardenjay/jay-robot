#!/usr/bin/env node
// 回答品質評測（regression eval）：對代表性問題跑「完整 answer() 管線 + 本地 Ollama」，
// 驗證答案是否含關鍵字。與 npm test 分離——需要 Ollama 與真實資料，一題約 1–2 分鐘。
//
// 安全：絕不碰真實 data/rag.db——把 DB 複製到 temp 沙箱、netlist 以唯讀 symlink 掛入，
// cwd 切到沙箱後才載入 retrieval（vector/llm 單例以 require 當下的 cwd 定位資料）。
//
// 用法：node scripts/eval-answers.js [--project 100T] [--case "soc"] [--smoke]
//   --project  專案名稱（預設 100T）
//   --case     只跑問題文字含此字串的 case
//   --smoke    只跑標記 smoke:true 的案例（快速子集，供每次改動後手動驗證用）
//
// 案例定義：優先讀 evals/answer-cases.local.json（gitignored，含真實客戶專案資料，不進公開 repo）；
// 不存在則退回 evals/answer-cases.json（公開 repo 版，只放不涉密的示範案例）。
// knownFail: true 的 case 失敗不影響 exit code。

const os = require('os');
const fs = require('fs');
const path = require('path');
const { parseArgs } = require('util');

const REPO_ROOT = path.resolve(__dirname, '..');
const { values } = parseArgs({
  options: {
    project: { type: 'string', default: '100T' },
    case: { type: 'string' },
    smoke: { type: 'boolean', default: false },
  },
});

// ── 沙箱：複製 DB、symlink netlist，cwd 切過去後才 require 管線 ──
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-answers-'));
fs.mkdirSync(path.join(sandbox, 'data'));
for (const f of ['rag.db', 'rag.db-wal', 'rag.db-shm']) {
  const src = path.join(REPO_ROOT, 'data', f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(sandbox, 'data', f));
}
const netlistSrc = path.join(REPO_ROOT, 'tools', 'netlist');
if (fs.existsSync(netlistSrc)) {
  fs.mkdirSync(path.join(sandbox, 'tools'));
  fs.symlinkSync(netlistSrc, path.join(sandbox, 'tools', 'netlist'));
}
if (!process.env.LLM_ADAPTER) process.env.LLM_ADAPTER = 'ollama';
process.chdir(sandbox);

const { answer } = require(path.join(REPO_ROOT, 'src/services/retrieval'));
const vectorStore = require(path.join(REPO_ROOT, 'src/adapters/vector'));

async function runCase(c, projectId) {
  const started = Date.now();
  const toolCalls = [];
  let text = '';
  for await (const e of answer(c.q, projectId)) {
    if (e.type === 'tool') toolCalls.push(`${e.name}(${JSON.stringify(e.args)})`);
    else if (e.type === 'token') text += e.value;
  }
  const pass = c.expectAny.some(k => text.toLowerCase().includes(k.toLowerCase()));
  return { pass, text, toolCalls, seconds: Math.round((Date.now() - started) / 1000) };
}

(async () => {
  const projects = await vectorStore.listProjects();
  const project = projects.find(p => p.name === values.project);
  if (!project) {
    console.error(`找不到專案「${values.project}」；現有：${projects.map(p => p.name).join(', ')}`);
    process.exit(2);
  }

  const localCasesPath = path.join(REPO_ROOT, 'evals', 'answer-cases.local.json');
  const casesPath = fs.existsSync(localCasesPath) ? localCasesPath : path.join(REPO_ROOT, 'evals', 'answer-cases.json');
  let cases = JSON.parse(fs.readFileSync(casesPath, 'utf-8'));
  if (values.smoke) cases = cases.filter(c => c.smoke === true);
  if (values.case) cases = cases.filter(c => c.q.includes(values.case));
  console.log(`專案:${project.name}｜案例檔:${path.basename(casesPath)}｜cases:${cases.length}${values.smoke ? '（smoke）' : ''}｜LLM_ADAPTER=${process.env.LLM_ADAPTER}\n`);

  let hardFail = 0;
  for (const c of cases) {
    const r = await runCase(c, project.id);
    const tag = r.pass ? '✅ PASS' : (c.knownFail ? '🟡 KNOWN-FAIL' : '❌ FAIL');
    if (!r.pass && !c.knownFail) hardFail++;
    if (r.pass && c.knownFail) console.log('   （knownFail 已轉綠，可從 evals/answer-cases.json 移除標記）');
    console.log(`${tag}  ${c.q}（${r.seconds}s）`);
    console.log(`   工具:${r.toolCalls.join(' → ') || '（無）'}`);
    console.log(`   期望其一:${c.expectAny.join(' / ')}`);
    console.log(`   答案:${r.text.replace(/\n+/g, ' ').slice(0, 160)}${r.text.length > 160 ? '…' : ''}`);
    if (c.note) console.log(`   備註:${c.note}`);
    console.log();
  }

  fs.rmSync(sandbox, { recursive: true, force: true });
  console.log(hardFail ? `結果:${hardFail} 個非 knownFail 的 case 失敗` : '結果:全數通過（knownFail 除外）');
  process.exit(hardFail ? 1 : 0);
})().catch(err => { console.error('EVAL ERROR:', err); process.exit(2); });
