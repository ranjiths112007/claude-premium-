# Claude Premium Clone

A Claude-style AI chat interface powered by an OpenAI-compatible local gateway.

## Requirements

- Node.js 20+
- A local OpenAI-compatible API at `http://localhost:20128/v1`
- A valid API key stored in `.env`

## Setup

```bash
npm install
copy .env.example .env
npm run dev
```

Open `http://localhost:5173`.

The browser never receives the API key. The Express server proxies requests to the local model gateway.
