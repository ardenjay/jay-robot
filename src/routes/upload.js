const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { ingestFile } = require('../services/ingestion');

const router = express.Router();

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

  try {
    const chunkCount = await ingestFile(req.file.path, req.file.originalname);
    fs.unlinkSync(req.file.path);
    res.json({ message: `成功處理 ${req.file.originalname}`, chunks: chunkCount });
  } catch (err) {
    console.error('Ingestion error:', err);
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: `處理失敗：${err.message}` });
  }
});

module.exports = router;
