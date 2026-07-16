# Design: startup table_rows backfill

## 兩層升級機制

| 層 | 觸發 | 特性 | 版本戳 | 放什麼 |
|---|---|---|---|---|
| 同步階梯 | adapter constructor | 秒級、零外部依賴、阻塞啟動 | `PRAGMA user_version` vs `DB_VERSION` | schema 變更、FTS 重建 |
| 背景補料 | app 啟動後 fire-and-forget | 分鐘級、需 Ollama、不阻塞 | `doc_ingest_meta.sidecar_version` vs `SIDECAR_VERSION` | 需 embedding 的衍生資料 |

分兩層的原因：需要 embedding 的步驟不能塞進阻塞式階梯（Ollama 沒起來就開不了服務），也不能全域一戳（分鐘級任務會中斷，要 per-doc 冪等續跑）。

## 同步階梯（一般化既有 FTS_VERSION）

```js
const DB_VERSION = 6;
const MIGRATIONS = [
  { to: 5, run: (db) => rebuildFts(db) },        // 歷史步驟:FTS 定義 v1~v5(行為同現狀)
  { to: 6, run: (db) => ensureSidecarSchema(db) }, // 本次:table_rows + doc_ingest_meta
];
// constructor: 依序執行 to > user_version 的步驟,每步完成即 pragma user_version = to
```

- 對既有 DB（user_version=5）只跑 step 6；全新 DB 從頭跑到 6。
- FTS 的「筆數不符即重建」防護檢查保留在階梯之外（它是一致性防護,不是版本遷移）。
- 步驟必須冪等（重跑無害）,以防「執行成功、蓋戳前崩潰」。

## 背景補料架構

```
正式機部署 = git pull + 重啟,之後:

啟動
 ├─ sqlite adapter constructor(同步):
 │    跑同步階梯(見上)→ schema 自動到位、user_version = DB_VERSION
 │
 └─ app 啟動完成後 fire-and-forget:
      backfillTableRows(store, llm)          ← 背景任務,不 await
        for doc of 版本戳 < SIDECAR_VERSION 的文件:
          md = 在 public/documents/<project>/<docId>/ 找 .md
          ├─ 找不到 .md(.docx/.pdf 單檔) → log 一行,跳過(不蓋戳)
          └─ 找到 → extractTableRows → embedBatch → 清該 doc 舊列 → addTableRows → 蓋戳
        任一步 Ollama 失敗 → log,結束本輪(已蓋戳的文件不受影響,下次啟動續跑)
```

## 關鍵決策

1. **逐文件蓋戳,不用全域戳**：FTS 用全域 `PRAGMA user_version` 是因為重建是同步、原子、秒級;回填是分鐘級背景任務,可能中斷,per-doc 戳讓進度天然冪等——重啟接著補,不重做已完成的。
2. **回填不動 chunks**：與「整份重灌」刻意區隔。重灌會矯正 title、洗牌全專案排名(測試機實測 5 題翻紅);回填只寫 table_rows,主檢索行為與回填前逐 byte 相同,注入在該文件回填完成後自然開始生效。
3. **正常進料也蓋戳**：`embedAndStore` 寫完 table_rows 後蓋 `SIDECAR_VERSION`(含「該文件沒有大表、0 列」的情況也蓋——版本戳表達「已按此版本處理過」,不是「有列」)。否則新上傳的文件每次啟動都被重掃。
4. **找 .md 的規則**：資料夾進料 → `public/documents/<project>/<docId>/` 目錄下所有 `.md`(與 `chunkFolderMarkdown` 同,含 rewriteImageLinks 以求列文字與進料一致);單檔進料 → `public/documents/<project>/<docId>`(docId 即檔名)且副檔名為 `.md` 才回填。其他(.docx/.pdf 原檔)跳過。
5. **失敗語意**：embed 失敗(Ollama 不在線/超時)→ 整輪 abort + log;不做重試迴圈、不做排程——下次重啟自然重試。錯誤絕不往上拋到 app(fire-and-forget 包 try/catch)。
6. **清舊列再寫**：回填前 `DELETE FROM table_rows WHERE doc_id=? AND project_id=?`(不動 chunks 的窄版清理,不能用 clear()——它會把 chunks 一起刪),重跑安全。
7. **唯讀模式**：read-only 是對外 HTTP 語意;啟動期系統級寫入沿用 FTS 重建前例,不加開關。

## Schema

```sql
CREATE TABLE IF NOT EXISTS doc_ingest_meta (
  project_id      TEXT NOT NULL,
  doc_id          TEXT NOT NULL,
  sidecar_version INTEGER DEFAULT 0,
  PRIMARY KEY (project_id, doc_id)
);
```

`renameDocument`/`clear` 同步維護 meta(改名跟著改、刪文件刪 meta)。

## 回退

- 純加法:回退=revert 程式碼;doc_ingest_meta 與 table_rows 留著無害(舊程式不讀)。
