// 是否含 CJK 字元（中日韓統一表意文字，含擴展 A 區）。用來決定要不要做中→英擴展。
function hasCJK(s) {
  return /[㐀-鿿]/.test(String(s || ''));
}

// query expansion：專案文件多為英文，中文查詢對英文 chunk 召回常不足。含 CJK 的查詢
// 額外產生一個英文版本，讓呼叫端用「原查詢＋英文查詢」各自檢索再合併，補跨語言召回缺口。
// 無 CJK（本就英文）→ 不翻、只回原查詢；翻譯失敗/回空/等同原查詢 → 退回單一查詢，永不中斷。
async function expandQuery(adapter, query) {
  const q = String(query || '');
  if (!hasCJK(q)) return [q];
  try {
    const raw = await adapter.generate(
      `把以下檢索查詢翻成英文，只回傳英文查詢本身，不要任何解釋、標點包裝或引號：\n${q}`
    );
    const en = String(raw || '').trim().replace(/^["'`]+|["'`]+$/g, '').trim();
    if (en && en.toLowerCase() !== q.toLowerCase()) return [q, en];
  } catch (err) {
    console.warn(`[query-expand] 翻譯失敗，退回單一查詢：${err.message}`);
  }
  return [q];
}

module.exports = { expandQuery, hasCJK };
