const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { ingestFile } = require('../services/ingestion');

const router = express.Router();

const VALID_PHASES = new Set(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7']);

const storage = multer.diskStorage({
  destination: path.join(process.cwd(), 'uploads'),
  filename: (req, file, cb) => cb(null, file.originalname),
});

const upload = multer({ storage });

router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '請選擇要上傳的檔案' });
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  if (ext !== '.md' && ext !== '.markdown') {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: '僅接受 .md 或 .markdown 格式的檔案' });
  }

  // Task 5.1: read project_id and phase from form fields
  const projectId = req.body.project_id;
  const phase = req.body.phase;

  // Task 5.2
  if (!projectId || !projectId.trim()) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'project_id 為必填' });
  }

  // Task 5.3
  if (!phase || !VALID_PHASES.has(phase)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'phase 必須為 C1 至 C7' });
  }

  try {
    // Task 5.4: pass projectId and phase to ingestFile
    const chunkCount = await ingestFile(req.file.path, req.file.originalname, projectId.trim(), phase);
    fs.unlinkSync(req.file.path);
    res.json({ message: `成功處理 ${req.file.originalname}`, chunks: chunkCount });
  } catch (err) {
    console.error('Ingestion error:', err);
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: `處理失敗：${err.message}` });
  }
});

module.exports = router;
