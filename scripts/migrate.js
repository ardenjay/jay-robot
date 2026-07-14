#!/usr/bin/env node
// 異機資料搬運 CLI：從來源機把 data/、public/documents/、tools/netlist/ 拉到本機。
// 用法：
//   node scripts/migrate.js <user@host>                  # 來源機專案路徑同本機
//   node scripts/migrate.js <user@host> --path /path/to/jay-robot
//   node scripts/migrate.js <user@host> --dry-run        # 只預覽，不動資料
//   node scripts/migrate.js <user@host> --stop-remote    # 代為停止來源機 server
//
// 防呆：.env 永不搬；來源 server 在跑預設中止（WAL 熱複製會不一致）；
// 搬前自動備份本機 data/；搬完驗證目錄結構與 embedding 維度。
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parseArgs } = require('util');
const { spawnSync } = require('child_process');
const { TRANSFER_LIST, parseTarget, buildRsyncArgs, checkDocsLayout, expectedDim } = require('./lib/migrate-core');

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

// 不用 BatchMode：來源機若是密碼登入，讓 ssh 透過 tty 正常提示（建議設 ssh key 免重複輸入）
function ssh(target, cmd) {
  return spawnSync('ssh', [target, cmd], { encoding: 'utf-8' });
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      path: { type: 'string', default: process.cwd() },
      'dry-run': { type: 'boolean', default: false },
      'stop-remote': { type: 'boolean', default: false },
      'skip-netlist': { type: 'boolean', default: false },
    },
  });

  const parsed = parseTarget(positionals[0]);
  if (!parsed) die('用法：node scripts/migrate.js <user@host> [--path P] [--dry-run] [--stop-remote]');
  const { target } = parsed;
  const remotePath = values.path;
  const dryRun = values['dry-run'];

  // --- 前置檢查 1：SSH 連線 + 遠端路徑存在 ---
  console.log(`[1/5] 檢查 SSH 連線與遠端路徑 ${target}:${remotePath}`);
  const probe = ssh(target, `test -d ${JSON.stringify(remotePath)} && echo ok`);
  if (probe.status !== 0 || !probe.stdout.includes('ok')) {
    if (probe.stderr.trim()) console.error(probe.stderr.trim());
    die(`SSH 連不上或遠端沒有 ${remotePath}——路徑不同請用 --path 指定來源機的專案位置`);
  }

  // --- 前置檢查 2：來源機 server 是否在跑（WAL 熱複製會抓到不一致瞬間）---
  console.log('[2/5] 檢查來源機 server 狀態');
  const pg = ssh(target, 'pgrep -f "node src/app.js"');
  const remoteRunning = pg.status === 0 && pg.stdout.trim() !== '';
  let stoppedRemote = false;
  if (remoteRunning) {
    if (!values['stop-remote']) {
      die('來源機的 server 還在跑，熱複製 SQLite（WAL）可能抓到不一致的資料。\n' +
        '  選項 1：到來源機手動停掉再重跑\n' +
        '  選項 2：加 --stop-remote 讓工具代為停止（搬完需自行重啟）');
    }
    if (dryRun) {
      console.log('  （dry-run：跳過實際停止來源機 server）');
    } else {
      ssh(target, 'pkill -f "node src/app.js"');
      stoppedRemote = true;
      console.log('  已停止來源機 server（--stop-remote）');
    }
  } else {
    console.log('  來源機 server 未在執行，安全');
  }

  // --- 前置 3：備份本機 data/ ---
  const backupDir = `data.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  if (dryRun) {
    console.log(`[3/5] （dry-run）將備份本機 data/ → ${backupDir}/`);
  } else if (fs.existsSync('data')) {
    fs.cpSync('data', backupDir, { recursive: true });
    console.log(`[3/5] 已備份本機 data/ → ${backupDir}/`);
  } else {
    console.log('[3/5] 本機沒有 data/，跳過備份');
  }

  // --- 搬運 ---
  const list = TRANSFER_LIST.filter(item => !(values['skip-netlist'] && item.srcRel.startsWith('tools/netlist')));
  const summary = [];
  for (const item of list) {
    const args = buildRsyncArgs(target, remotePath, item, { dryRun });
    console.log(`[4/5] rsync ${item.name}${dryRun ? '（dry-run）' : ''}`);
    console.log(`  $ rsync ${args.join(' ')}`);
    if (!dryRun) fs.mkdirSync(item.destRel, { recursive: true });
    const r = spawnSync('rsync', args, { encoding: 'utf-8' });
    if (r.status !== 0) die(`rsync ${item.name} 失敗（exit ${r.status}）：${(r.stderr || '').trim()}`);
    const files = /Number of regular files transferred: (\d[\d,]*)/.exec(r.stdout);
    summary.push(`  ${item.name}：傳輸 ${files ? files[1] : '?'} 個檔案`);
  }

  // --- 後置驗證 ---
  console.log('[5/5] 後置驗證');
  const layout = checkDocsLayout(path.join(process.cwd(), 'public', 'documents'));
  if (!layout.ok) {
    console.error(`✗ ${layout.error}`);
    console.error(`  修復指令：${layout.fix}`);
    if (!dryRun) process.exit(1);
  }

  let dimHint = null;
  if (!dryRun && fs.existsSync('data/rag.db')) {
    try {
      const Database = require('better-sqlite3');
      const db = new Database('data/rag.db', { readonly: true });
      const row = db.prepare('SELECT embedding FROM chunks LIMIT 1').get();
      if (row) {
        const dim = JSON.parse(row.embedding).length;
        const expect = expectedDim(process.env);
        if (expect && dim !== expect) {
          dimHint = `DB 向量是 ${dim} 維，但目前 LLM_ADAPTER=${process.env.LLM_ADAPTER || 'gemini'} 預期 ${expect} 維——` +
            `檢索會失效，請執行：node scripts/reembed.js`;
        }
      }
      db.close();
    } catch (err) {
      console.warn(`  （維度檢查略過：${err.message}）`);
    }
  }

  // --- 摘要 ---
  console.log(`\n${dryRun ? '（dry-run 完成，未動任何資料）' : '✓ 搬運完成'}`);
  for (const line of summary) console.log(line);
  if (!dryRun) console.log(`  本機 DB 備份：${backupDir}/（確認正常後可刪）`);
  if (layout.ok) console.log('  目錄結構驗證：通過');
  if (dimHint) console.log(`  ⚠️ ${dimHint}`);
  else if (!dryRun) console.log('  embedding 維度：相符');
  if (stoppedRemote) console.log(`  ⚠️ 來源機 server 已被停止，需要的話請到 ${target} 重啟`);
}

main().catch(err => die(err.message));
