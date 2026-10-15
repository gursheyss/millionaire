'use strict';

const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');
const { WebSocketServer } = require('ws');
const { Game, initialState, normalizeQuestion } = require('./game');
const { parseCsv, rowsToQuestions, sheetCsvUrl } = require('./csv');

const PORT = Number(process.env.PORT) || 3000;
const CONTROL_KEY = process.env.CONTROL_KEY || '';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const DEFAULT_QUESTIONS = path.join(__dirname, 'data', 'questions.default.json');

function loadState() {
  try {
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (saved && Array.isArray(saved.questions)) return saved;
  } catch {}
  const questions = JSON.parse(fs.readFileSync(DEFAULT_QUESTIONS, 'utf8')).map(normalizeQuestion);
  return initialState(questions);
}

function saveState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}

const game = new Game(loadState());
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_req, res) => res.redirect('/control'));
app.get('/show', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'show.html')));
app.get('/control', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'control.html')));

app.post('/api/import-sheet', async (req, res) => {
  if (CONTROL_KEY && req.get('x-control-key') !== CONTROL_KEY) return res.status(401).json({ error: 'Bad control key' });
  const url = sheetCsvUrl(req.body && req.body.url);
  if (!url) return res.status(400).json({ error: 'Not a Google Sheets URL' });
  try {
    const r = await fetch(url, { redirect: 'follow' });
    if (!r.ok) throw new Error('Sheet fetch failed (' + r.status + '). Is it shared as "anyone with the link"?');
    const questions = rowsToQuestions(parseCsv(await r.text()));
    res.json({ questions });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.post('/api/parse-csv', (req, res) => {
  const questions = rowsToQuestions(parseCsv(String((req.body && req.body.csv) || '')));
  res.json({ questions });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcast() {
  const msg = JSON.stringify({ type: 'state', state: game.state, clients: wss.clients.size });
  for (const client of wss.clients) if (client.readyState === 1) client.send(msg);
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'state', state: game.state, clients: wss.clients.size, needsKey: Boolean(CONTROL_KEY) }));
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (msg.type !== 'action') return;
    if (CONTROL_KEY && msg.key !== CONTROL_KEY) {
      ws.send(JSON.stringify({ type: 'error', error: 'Bad control key', id: msg.id }));
      return;
    }
    try {
      game.dispatch(msg.name, msg.payload || {});
      saveState(game.state);
      broadcast();
      ws.send(JSON.stringify({ type: 'ok', id: msg.id }));
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', error: e.message, id: msg.id }));
    }
  });
  ws.on('close', broadcast);
});

setInterval(() => {
  for (const client of wss.clients) if (client.readyState === 1) client.ping();
}, 25000);

server.listen(PORT, () => {
  console.log('Millionaire running on http://localhost:' + PORT + '  (show: /show, control: /control)');
  if (!CONTROL_KEY) console.log('WARNING: CONTROL_KEY is not set; anyone with the URL can drive the game.');
});
