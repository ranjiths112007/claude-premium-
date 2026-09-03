import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
const port = Number(process.env.PORT || 3001);
const upstreamBaseUrl = (process.env.UPSTREAM_BASE_URL || 'http://localhost:20128/v1').replace(/\/$/, '');
const upstreamApiKey = process.env.UPSTREAM_API_KEY;
const upstreamModel = process.env.UPSTREAM_MODEL || 'auto/best-coding';

app.use(cors());
app.use(express.json({ limit: '25mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, model: upstreamModel, upstream: upstreamBaseUrl }));

function validContent(content) {
  if (typeof content === 'string') return true;
  if (!Array.isArray(content)) return false;
  return content.every((part) => {
    if (!part || typeof part !== 'object') return false;
    if (part.type === 'text') return typeof part.text === 'string';
    if (part.type === 'image_url') return typeof part.image_url?.url === 'string';
    return false;
  });
}

app.post('/api/chat', async (req, res) => {
  if (!upstreamApiKey) return res.status(500).json({ error: 'UPSTREAM_API_KEY is not configured.' });
  const { messages, model, temperature, max_tokens } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: 'messages must be a non-empty array.' });
  if (messages.some((m) => !['system', 'user', 'assistant'].includes(m?.role))) return res.status(400).json({ error: 'Unsupported message role.' });
  if (messages.some((m) => !validContent(m?.content))) return res.status(400).json({ error: 'Message content must be text or image content parts.' });

  try {
    const upstream = await fetch(`${upstreamBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${upstreamApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || upstreamModel,
        messages: messages.map(({ role, content }) => ({ role, content })),
        stream: true,
        ...(Number.isFinite(temperature) ? { temperature } : {}),
        ...(Number.isFinite(max_tokens) ? { max_tokens } : {})
      })
    });
    if (!upstream.ok) {
      const text = await upstream.text();
      return res.status(upstream.status).json({ error: 'Upstream model request failed.', details: text.slice(0, 4000) });
    }
    res.status(200).setHeader('Content-Type', 'text/event-stream; charset=utf-8').setHeader('Cache-Control', 'no-cache, no-transform').setHeader('Connection', 'keep-alive');
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
    if (!res.headersSent) return res.status(502).json({ error: error instanceof Error ? error.message : 'Unable to reach upstream API.' });
    res.write(`data: ${JSON.stringify({ error: 'Upstream connection failed.' })}\n\n`);
    res.end();
  }
});

app.listen(port, () => console.log(`Claude-style app API listening on http://localhost:${port}`));
