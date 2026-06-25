#!/usr/bin/env node
// 資料夾進料 CLI：把「PC 上跑好 MinerU」的資料夾（md + images/）灌進知識庫。
// 用法：
//   node scripts/ingest-folder.js <folder> --project <id> [--phase <Cx>]
//   node scripts/ingest-folder.js --project <id>        # 未給 folder → 處理 incoming/ 下每個子資料夾
//
// phase：有給 --phase 以參數為準（須 C1–C7）；沒給則從資料夾名推（C560→C5）；推不出就報錯要求 --phase。
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parseArgs } = require('util');
const { ingestFolder, phaseFromFolderName } = require('../src/services/ingestion');

const VALID_PHASES = new Set(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7']);

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

// 解析單一資料夾的 phase：參數優先，否則從資料夾名推。回傳 phase 或丟錯。
function resolvePhase(folderName, phaseArg) {
  if (phaseArg) {
    if (!VALID_PHASES.has(phaseArg)) throw new Error(`--phase 必須為 C1 至 C7（收到 "${phaseArg}"）`);
    return phaseArg;
  }
  const inferred = phaseFromFolderName(folderName);
  if (!inferred) {
    throw new Error(`無法從資料夾名 "${folderName}" 推得 phase，請用 --phase 指定（C1–C7）`);
  }
  return inferred;
}

async function ingestOne(folder, projectId, phaseArg) {
  const docId = path.basename(folder.replace(/[\\/]+$/, ''));
  const phase = resolvePhase(docId, phaseArg);
  const r = await ingestFolder(folder, { projectId, phase });
  console.log(`✓ ${r.docId}  [${phase}]  md=${r.mdCount}  chunks=${r.chunkCount}  images=${r.imageCount}`);
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { project: { type: 'string' }, phase: { type: 'string' } },
  });

  if (!values.project) die('--project 為必填');
  const projectId = values.project;
  const phaseArg = values.phase;

  let targets;
  if (positionals[0]) {
    if (!fs.existsSync(positionals[0]) || !fs.statSync(positionals[0]).isDirectory()) {
      die(`找不到資料夾：${positionals[0]}`);
    }
    targets = [positionals[0]];
  } else {
    // 未給路徑 → 處理 incoming/ 下每個子資料夾
    const incoming = path.join(process.cwd(), 'incoming');
    if (!fs.existsSync(incoming)) die(`未指定資料夾，且預設的 incoming/ 不存在`);
    targets = fs.readdirSync(incoming)
      .map(name => path.join(incoming, name))
      .filter(p => fs.statSync(p).isDirectory());
    if (targets.length === 0) die('incoming/ 下沒有任何資料夾');
  }

  let failed = 0;
  for (const folder of targets) {
    try {
      await ingestOne(folder, projectId, phaseArg);
    } catch (err) {
      failed++;
      console.error(`✗ ${path.basename(folder)}：${err.message}`);
    }
  }
  if (failed) process.exit(1);
}

main().catch(err => die(err.message));
