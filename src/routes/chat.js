const express = require('express');
const { answer } = require('../services/retrieval');

const router = express.Router();

router.post('/', async (req, res) => {
  const { question, project_id } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: '請輸入問題' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    for await (const event of answer(question.trim(), project_id)) {
      if (typeof event === 'string') {
        // Empty DB message
        res.write(`data: ${JSON.stringify({ type: 'token', value: event })}\n\n`);
      } else if (event.type === 'token') {
        res.write(`data: ${JSON.stringify({ type: 'token', value: event.value })}\n\n`);
      } else if (event.type === 'sources') {
        res.write(`data: ${JSON.stringify({ type: 'sources', value: event.value })}\n\n`);
      } else if (event.type === 'tool') {
        res.write(`data: ${JSON.stringify({ type: 'tool', name: event.name, args: event.args })}\n\n`);
      }
    }
  } catch (err) {
    console.error('Chat error:', err);
    res.write(`data: ${JSON.stringify({ type: 'error', value: `錯誤：${err.message}` })}\n\n`);
  } finally {
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

module.exports = router;
