const express = require('express');
const { isReadOnly } = require('../middleware/readOnly');

const router = express.Router();

// 前端啟動時讀此端點得知目前模式，決定要不要顯示寫入入口。任何模式下都可讀取。
router.get('/', (req, res) => {
  res.json({ readOnly: isReadOnly() });
});

module.exports = router;
