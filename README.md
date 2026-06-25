# Jay Robot

A personal Markdown knowledge base RAG chatbot. Upload `.md` files and ask questions in natural language — answers are generated from your documents with source citations.

## Features

- Upload Markdown files via click or drag-and-drop
- Auto-chunks documents by heading structure
- Vector similarity search + Gemini-powered answers
- Streaming response output
- Source citations shown under each answer
- Swappable LLM and Vector Store via environment variables

## Requirements

- Node.js v18+
- Gemini API Key ([get one free](https://aistudio.google.com/app/apikey))

## Setup

```bash
git clone https://github.com/your-username/jay-robot.git
cd jay-robot
npm install
cp .env.example .env
```

Edit `.env` and fill in your API key:

```
GEMINI_API_KEY=your_api_key_here
```

## Start

```bash
npm start
```

Open your browser at `http://localhost:3000`

## Usage

1. Upload a `.md` file using the left panel
2. Type a question in the input box and press Enter
3. The answer streams in real time with source sections listed below

## Folder ingestion (pre-processed on your PC)

For PDFs whose extracted **images** you want to keep, run MinerU on your PC,
then copy the resulting folder (`*.md` + `images/`) to the server and ingest it
via CLI — the server doesn't need MinerU for this path, and images are preserved.

**Folder convention** — one folder = one `docId` (the folder name):

```
incoming/C560/            # folder name = docId "C560"
  ├── overview.md         # one or more .md (all grouped under this docId)
  ├── detail.md
  └── images/             # shared image base
      └── fig1.jpg
```

**Ingest:**

```bash
cd /data/extra/jay/jay-robot
node scripts/ingest-folder.js incoming/C560 --project <projectId> --phase C5
# --phase optional: inferred from an NPDS code in the folder name (C560 → C5);
#   if the name has no code, --phase is required (it is never guessed).
# omit the folder arg to ingest every subfolder under incoming/.
```

What it does: chunks every `.md` (chunk titles record their source md filename),
rewrites relative image links `![](images/x.jpg)` → absolute
`![](/documents/<projectId>/<docId>/images/x.jpg)`, and copies `images/` (and the
md files) to `public/documents/<projectId>/<docId>/`. Re-ingesting the same docId
replaces both chunks and the asset folder. Any folder name is accepted (NPDS
naming is only a convenience). This CLI bypasses HTTP, so it works regardless of
`READ_ONLY`.

## Project Structure

```
src/
├── adapters/
│   ├── llm/          # LLM interface (default: Gemini)
│   └── vector/       # Vector store interface (default: SQLite)
├── services/
│   ├── ingestion.js  # Parse, chunk, embed, store
│   └── retrieval.js  # Search, generate, stream
├── routes/
│   ├── upload.js     # POST /api/upload
│   └── chat.js       # POST /api/chat (SSE)
└── app.js
public/
└── index.html        # Frontend UI
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | — | Gemini API key (required) |
| `VECTOR_ADAPTER` | `sqlite` | Vector store implementation |
| `LLM_ADAPTER` | `gemini` | LLM implementation |
| `PORT` | `3000` | Server port |
| `READ_ONLY` | _(unset)_ | Set to `true` to run the site in read-only mode |

## Read-only mode

Set `READ_ONLY=true` to share the site with others without letting them upload,
delete, move, or create projects — only browsing and asking questions remain available.

- **Backend (the real guard):** all write routes return `403`
  (`POST /api/upload`, `POST /api/projects`,
  `DELETE /api/projects/:id/documents/:docId`,
  `PATCH /api/projects/:id/documents/:docId/phase`). This cannot be bypassed by
  calling the API directly. `POST /api/chat` and all `GET` routes keep working.
- **Frontend:** the upload panel, per-file delete/move buttons, and the
  "new project" form are hidden (the UI reads `GET /api/config`).

When unset (the default), behavior is identical to before — full read/write.

## Deploy with systemd

`npm start` is fine for development, but it dies when your terminal/SSH session
closes, won't restart on crash, and won't come back after a reboot. For a real,
shared (read-only) instance, run it as a systemd service. A version-controlled
unit file lives at [`deploy/jay-robot.service`](deploy/jay-robot.service).

> The unit sets an explicit `PATH` that includes conda
> (`/home/jay/miniconda3/...`). This is required: systemd's default environment
> does **not** include conda, so without it `spawn('conda', …)` (MinerU /
> markitdown) fails with `ENOENT`. It also reads secrets such as
> `GEMINI_API_KEY` from `.env` via `EnvironmentFile`, and sets `READ_ONLY=true`
> for the shared instance.

### Install

```bash
sudo cp /data/extra/jay/jay-robot/deploy/jay-robot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now jay-robot      # start now + on every boot
sudo systemctl status jay-robot            # should be active (running)
```

### Verify

```bash
journalctl -u jay-robot -n 30 --no-pager   # expect "Jay Robot running" + "[Gemini] key 載入"
curl -s localhost:3000/api/config          # → {"readOnly":true}
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3000/api/upload   # → 403
```

### Day-to-day

| Task | Command |
|------|---------|
| Apply code or `.env` changes | `sudo systemctl restart jay-robot` |
| Tail logs | `journalctl -u jay-robot -f` |
| Stop / disable | `sudo systemctl stop jay-robot` / `sudo systemctl disable jay-robot` |

### Notes

- **Restart is required** after editing files under `src/` or `.env` — env and
  code are read at startup, not hot-reloaded.
- **Admin (write) access:** the systemd instance is read-only. To upload/manage,
  run your own instance **from the same working directory** on a **different
  port** so it shares the same database:
  ```bash
  cd /data/extra/jay/jay-robot && PORT=3001 npm start
  ```
  The DB lives at `<WorkingDirectory>/data/rag.db`; running from another
  directory would point at a different (empty) database.
- **Never run two writing instances at once.** SQLite (better-sqlite3 + WAL)
  safely allows many readers + one writer, so one read-only service plus one
  admin instance is fine — but two writers can conflict.
