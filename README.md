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
