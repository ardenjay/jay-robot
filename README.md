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

Example systemd unit for a shared, read-only instance:

```ini
[Service]
WorkingDirectory=/data/extra/jay/jay-robot
Environment=PATH=/home/jay/miniconda3/bin:/usr/bin:/usr/local/bin
Environment=READ_ONLY=true
EnvironmentFile=/data/extra/jay/jay-robot/.env
ExecStart=/usr/bin/node src/app.js
Restart=always
```

Run your own admin instance without `READ_ONLY` to keep full upload/edit access.
