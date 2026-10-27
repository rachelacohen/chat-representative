import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createAppChatService } from './chat/setup.js';
import { runWithActor } from './context.js';
import * as store from './store.js';

// Not plain PORT: tools that launch the dev stack often set PORT for the Vite client.
const PORT = process.env.API_PORT || 3001;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

const app = express();
app.use(express.json());

// No real auth yet: the client identifies itself with x-user-id.
app.use((req, _res, next) => runWithActor(req.get('x-user-id') || 'anonymous', next));

const requireAdmin = (req, res, next) =>
  ADMIN_TOKEN && req.get('x-admin-token') === ADMIN_TOKEN
    ? next()
    : res.status(403).json({ error: 'forbidden' });

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/audit', requireAdmin, (req, res) => {
  const { entityType, entityId, limit } = req.query;
  res.json(store.listAudit({ entityType, entityId, limit: Number(limit) || 100 }));
});

const chat = createAppChatService();

app.post('/api/chat', async (req, res) => {
  const question = String(req.body?.question ?? '').trim();
  if (!question) return res.status(400).json({ error: 'question is required' });
  if (question.length > 2000) return res.status(400).json({ error: 'question is too long' });
  try {
    res.json(await chat.answer(question));
  } catch (err) {
    console.error('[chat] failed to answer', err);
    res.status(500).json({ error: 'chat failed' });
  }
});

app.get('/api/chat/log', requireAdmin, (req, res) => res.json(store.listChatLog({ limit: Number(req.query.limit) || 100 })));

// In production, serve the built React app from the same server.
const clientDist = path.resolve(import.meta.dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res, next) =>
    req.method === 'GET' && !req.path.startsWith('/api') ? res.sendFile(path.join(clientDist, 'index.html')) : next(),
  );
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(chat.model ? `Chat model: ${chat.model}` : 'Chat: no GEMINI_API_KEY, answering with safe templates only');
});
