const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vectorStore = require('../adapters/vector');
const { blockWhenReadOnly } = require('../middleware/readOnly');
const { resolveDocView, resolveDownload } = require('../services/docView');

const router = express.Router();

const DOCS_ROOT = path.join(process.cwd(), 'public', 'documents');

router.post('/', blockWhenReadOnly, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: '專案名稱為必填' });
  }
  try {
    const id = crypto.randomUUID();
    const project = await vectorStore.createProject(id, name.trim());
    res.status(201).json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 更新專案背景說明（回答時注入 system prompt）
const MAX_CONTEXT_LEN = 4000;
router.patch('/:id', blockWhenReadOnly, async (req, res) => {
  const { context } = req.body;
  if (typeof context !== 'string') {
    return res.status(400).json({ error: 'context 必須為字串' });
  }
  if (context.length > MAX_CONTEXT_LEN) {
    return res.status(400).json({ error: `context 長度上限 ${MAX_CONTEXT_LEN} 字` });
  }
  try {
    const ok = await vectorStore.updateProjectContext(req.params.id, context);
    if (!ok) return res.status(404).json({ error: '找不到專案' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const projects = await vectorStore.listProjects();
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/documents', async (req, res) => {
  const PHASES = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'];
  try {
    const docs = await vectorStore.listDocuments(req.params.id);
    const tree = Object.fromEntries(PHASES.map(p => [p, []]));
    for (const { phase, docId } of docs) {
      if (tree[phase]) tree[phase].push(docId);
    }
    res.json(tree);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 來源檢視：folder 進料的文件（持久化為目錄含 md+images）回 markdown 供前端渲染；
// 只有原始檔的文件回 file url 由前端開原檔。GET 讀取路由，不受唯讀模式阻擋。
router.get('/:id/documents/:docId/view', (req, res) => {
  const { status, body } = resolveDocView(DOCS_ROOT, req.params.id, req.params.docId);
  res.status(status).json(body);
});

// 下載原始檔（檔案型→該檔；目錄型→裡面的 PDF）。GET 讀取路由，唯讀模式可用。
router.get('/:id/documents/:docId/download', (req, res) => {
  const r = resolveDownload(DOCS_ROOT, req.params.id, req.params.docId);
  if (!r) return res.status(404).json({ error: '找不到可下載的原始檔' });
  res.download(r.filePath, r.filename);
});

router.delete('/:id/documents/:docId', blockWhenReadOnly, async (req, res) => {
  try {
    await vectorStore.clear(req.params.docId, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 文件改名：DB（chunks + FTS）先行，成功後搬持久化檔案/資料夾。
// 含自癒路徑：前次改名 DB 成功但磁碟搬移失敗 → 重試同一改名時只補搬移。
router.patch('/:id/documents/:docId/rename', blockWhenReadOnly, async (req, res) => {
  const projectId = req.params.id;
  const oldDocId = req.params.docId;
  const newDocId = (req.body.newDocId || '').trim();

  if (!newDocId || /[\\/]/.test(newDocId) || newDocId.includes('..')) {
    return res.status(400).json({ error: 'newDocId 不可為空,且不可含 /、\\ 或 ..' });
  }
  if (newDocId === oldDocId) return res.json({ ok: true, renamed: 0 });

  try {
    const docs = await vectorStore.listDocuments(projectId);
    const hasOld = docs.some(d => d.docId === oldDocId);
    const hasNew = docs.some(d => d.docId === newDocId);
    const oldPath = path.join(DOCS_ROOT, projectId, oldDocId);
    const newPath = path.join(DOCS_ROOT, projectId, newDocId);

    // 自癒：DB 已是新名、磁碟還在舊名 → 只補搬移
    if (hasNew && !hasOld && fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
      fs.renameSync(oldPath, newPath);
      return res.json({ ok: true, healed: true });
    }
    if (hasNew) return res.status(409).json({ error: `「${newDocId}」已存在` });
    if (!hasOld) return res.status(404).json({ error: '找不到文件' });
    if (fs.existsSync(newPath)) return res.status(409).json({ error: `持久化路徑「${newDocId}」已被占用` });

    const renamed = await vectorStore.renameDocument(projectId, oldDocId, newDocId);
    try {
      if (fs.existsSync(oldPath)) fs.renameSync(oldPath, newPath);
      else console.log(`[rename] 無持久化來源,僅更新 DB:${oldDocId}`);
    } catch (fsErr) {
      return res.status(500).json({ error: `DB 已改名,持久化搬移失敗(${fsErr.message});請以相同名稱重試以補搬移` });
    }
    res.json({ ok: true, renamed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const VALID_PHASES = new Set(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7']);

router.patch('/:id/documents/:docId/phase', blockWhenReadOnly, async (req, res) => {
  const { phase } = req.body;
  if (!phase || !VALID_PHASES.has(phase)) {
    return res.status(400).json({ error: 'phase 必須為 C1 至 C7' });
  }
  try {
    await vectorStore.movePhase(req.params.docId, req.params.id, phase);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
