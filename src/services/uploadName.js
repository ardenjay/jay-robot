// multer 1.x（busboy）把瀏覽器以 UTF-8 送出的 filename 當 latin1 解碼，
// 非 ASCII 檔名（中文、全形符號）會逐 byte 拆成 mojibake（規格比較 → è¦æ ¼æ¯"è¼ƒ）。
// 此函式把誤解碼還原，三層防呆確保絕不誤傷正常檔名。
function fixLatin1Mojibake(name) {
  if (typeof name !== 'string' || !name) return name;
  // 1) 純 ASCII：latin1/UTF-8 編碼相同，轉換恆等，提早退出
  if (!/[\u0080-\uffff]/.test(name)) return name;
  // 2) 含 > U+00FF 的字元：latin1 誤解碼的產物必然全落在 ≤ U+00FF，
  //    出現更高碼位表示字串已是正確 UTF-8，不可二次轉換（會轉出 U+FFFD/亂碼）
  if (/[\u0100-\uffff]/.test(name)) return name;
  // 3) 嘗試還原；結果含 replacement char（U+FFFD）代表原本就不是 UTF-8 位元組
  //    （真 latin1 檔名），保留原樣
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? name : decoded;
}

module.exports = { fixLatin1Mojibake };
