// 站台唯讀模式：由環境變數 READ_ONLY 控制。
// 嚴格比對 'true'，未設定或其他值一律視為一般（可寫入）模式，確保零 breaking change。
function isReadOnly() {
  return process.env.READ_ONLY === 'true';
}

// 掛在寫入路由 handler 之前的 middleware：唯讀模式下直接回 403，
// 在執行任何寫入副作用（檔案、轉檔、DB）之前就阻擋，無法靠繞過前端規避。
function blockWhenReadOnly(req, res, next) {
  if (isReadOnly()) {
    return res.status(403).json({ error: '此站台為唯讀模式，不開放上傳/修改' });
  }
  next();
}

module.exports = { isReadOnly, blockWhenReadOnly };
