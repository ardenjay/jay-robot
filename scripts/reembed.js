#!/usr/bin/env node
// 重做 embedding CLI：chunk 原文都在 DB（chunks.content），換 embedding provider 後
// 不必重新上傳文件，直接把每個 chunk 重新 embed、更新 embedding 欄位。
// 用法：
//   LLM_ADAPTER=ollama node scripts/reembed.js            # 重嵌全部 chunks
//   LLM_ADAPTER=ollama node scripts/reembed.js --project <id>   # 只重嵌單一專案
//   node scripts/reembed.js --db data/rag.db --dry-run    # 只顯示會處理幾筆
//
// 執行前會自動備份 DB 檔（rag.db.bak-<timestamp>）。embed 輸入與 ingestion 相同（chunk 原文）。
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parseArgs } = require('util');
const Database = require('better-sqlite3');
const adapter = require('../src/adapters/llm');

const EMBED_BATCH_SIZE = 100; // 與 ingestion 同值

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

async function main() {
  const { values } = parseArgs({
    options: {
      project: { type: 'string' },
      db: { type: 'string', default: path.join(process.cwd(), 'data', 'rag.db') },
      'dry-run': { type: 'boolean', default: false },
    },
  });

  if (!fs.existsSync(values.db)) die(`找不到資料庫：${values.db}`);
  const db = new Database(values.db);
  db.pragma('journal_mode = WAL');

  const rows = values.project
    ? db.prepare('SELECT id, content FROM chunks WHERE project_id = ? ORDER BY id').all(values.project)
    : db.prepare('SELECT id, content FROM chunks ORDER BY id').all();
  if (!rows.length) die(values.project ? `專案 ${values.project} 沒有任何 chunks` : '資料庫沒有任何 chunks');

  console.log(`共 ${rows.length} 個 chunks 待重嵌${values.project ? `（專案 ${values.project}）` : ''}`);
  if (values['dry-run']) return;

  // 自動備份：重嵌是整欄覆寫，出錯（斷線、模型錯誤）時可直接還原
  const backup = `${values.db}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(values.db, backup);
  console.log(`已備份 → ${backup}`);

  const update = db.prepare('UPDATE chunks SET embedding = ? WHERE id = ?');
  const updateMany = db.transaction(pairs => {
    for (const [id, emb] of pairs) update.run(JSON.stringify(emb), id);
  });

  let done = 0;
  for (let i = 0; i < rows.length; i += EMBED_BATCH_SIZE) {
    const batch = rows.slice(i, i + EMBED_BATCH_SIZE);
    const embeddings = await adapter.embedBatch(batch.map(r => r.content));
    updateMany(batch.map((r, j) => [r.id, embeddings[j]]));
    done += batch.length;
    console.log(`  ${done}/${rows.length}`);
  }

  const dim = JSON.parse(db.prepare('SELECT embedding FROM chunks LIMIT 1').get().embedding).length;
  console.log(`✓ 完成：${done} 個 chunks 已重嵌（向量維度 ${dim}）。備份在 ${backup}，確認檢索正常後可刪除。`);
}

main().catch(err => die(err.message));
