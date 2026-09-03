import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
const port = Number(process.env.PORT || 3001);
const upstreamBaseUrl = (process.env.UPSTREAM_BASE_URL || 'http://localhost:20128/v1').replace(/\/$/, '');
const upstreamApiKey = process.env.UPSTREAM_API_KEY;
const upstreamModel = process.env.UPSTREAM_MODEL || 'auto/best-coding';

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: upstreamModel, upstream: upstreamBaseUrl });
});

app.get('/api/models', async (_req, res) => {
  if (!upstreamApiKey) return res.status(500).json({ error: 'UPSTREAM_API_KEY is not configured.' });
  try {
    const response = await fetch(`${upstreamBaseUrl}/models`, {
      headers: { Authorization: `Bearer ${upstreamApiKey}` }
    });
    const text = await response.text();
    res.status(response.status).type(response.headers.get('content-type') || 'application/json').send(text);
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : 'Unable to reach upstream API.' });
  }
});

app.post('/api/chat', async (req, res) => {
  if (!upstreamApiKey) return res.status(500).json({ error: 'UPSTREAM_API_KEY is not configured.' });

  const { messages, model, temperature, max_tokens } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages must be a non-empty array.' });
  }

  const safeMessages = messages.map((message) => ({
    role: message?.role,
    content: typeof message?.content === 'string' ? message.content : ''
  }));

  if (safeMessages.some((message) => !['system', 'user', 'assistant'].includes(message.role))) {
    return res.status(400).json({ error: 'Unsupported message role.' });
  }

  try {
    const upstream = await fetch(`${upstreamBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${upstreamApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model || upstreamModel,
        messages: safeMessages,
        stream: true,
        ...(Number.isFinite(temperature) ? { temperature } : {}),
        ...(Number.isFinite(max_tokens) ? { max_tokens } : {})
      })
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return res.status(upstream.status).json({
        error: 'Upstream model request failed.',
        details: text.slice(0, 4000)
      });
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const reader = upstream.body?.getReader();
    if (!reader) return res.end();

    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
      res.write(decoder.decode());
    } finally {
      reader.releaseLock();
      res.end();
    }
  } catch (error) {
    if (!res.headersSent) {
      return res.status(502).json({ error: error instanceof Error ? error.message : 'Unable to reach upstream API.' });
    }
    res.write(`data: ${JSON.stringify({ error: 'Upstream connection failed.' })}\n\n`);
    res.end();
  }
});

app.listen(port, () => {
  console.log(`Claude-style app API listening on http://localhost:${port}`);
  console.log(`Upstream: ${upstreamBaseUrl}`);
  console.log(`Model: ${upstreamModel}`);
});
