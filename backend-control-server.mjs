import express from 'express';
import cors from 'cors';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = join(__dirname, '.control-data');
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(join(dataDir, 'control.db'));
db.exec(`
CREATE TABLE IF NOT EXISTS content_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('image','video')),
  data_url TEXT NOT NULL,
  display_duration_seconds INTEGER NOT NULL DEFAULT 10,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

function nowIso() {
  return new Date().toISOString();
}

function readSetting(key, fallback = null) {
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const row = stmt.get(key);
  return row ? JSON.parse(row.value) : fallback;
}

function writeSetting(key, value) {
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(key, JSON.stringify(value));
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, at: nowIso() });
});

app.get('/api/content', (_req, res) => {
  const rows = db.prepare('SELECT * FROM content_items ORDER BY sort_order ASC').all();
  res.json(rows.map(r => ({
    id: r.id,
    name: r.name,
    type: r.type,
    dataUrl: r.data_url,
    displayDurationSeconds: r.display_duration_seconds,
    startDate: r.start_date,
    endDate: r.end_date,
    createdAt: r.created_at,
    order: r.sort_order,
  })));
});

app.get('/api/content/active', (_req, res) => {
  const now = nowIso();
  const rows = db.prepare('SELECT * FROM content_items WHERE start_date <= ? AND end_date > ? ORDER BY sort_order ASC').all(now, now);
  res.json(rows.map(r => ({
    id: r.id,
    name: r.name,
    type: r.type,
    dataUrl: r.data_url,
    displayDurationSeconds: r.display_duration_seconds,
    startDate: r.start_date,
    endDate: r.end_date,
    createdAt: r.created_at,
    order: r.sort_order,
  })));
});

app.post('/api/content', (req, res) => {
  const body = req.body ?? {};
  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const countRow = db.prepare('SELECT COUNT(*) as count FROM content_items').get();
  const sortOrder = Number(countRow?.count ?? 0);
  db.prepare(`INSERT INTO content_items
    (id, name, type, data_url, display_duration_seconds, start_date, end_date, created_at, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id,
    body.name,
    body.type,
    body.dataUrl,
    body.displayDurationSeconds ?? 10,
    body.startDate,
    body.endDate,
    createdAt,
    sortOrder,
  );
  res.status(201).json({
    id,
    name: body.name,
    type: body.type,
    dataUrl: body.dataUrl,
    displayDurationSeconds: body.displayDurationSeconds ?? 10,
    startDate: body.startDate,
    endDate: body.endDate,
    createdAt,
    order: sortOrder,
  });
});

app.patch('/api/content/:id', (req, res) => {
  const id = req.params.id;
  const row = db.prepare('SELECT * FROM content_items WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const merged = {
    name: req.body.name ?? row.name,
    type: req.body.type ?? row.type,
    data_url: req.body.dataUrl ?? row.data_url,
    display_duration_seconds: req.body.displayDurationSeconds ?? row.display_duration_seconds,
    start_date: req.body.startDate ?? row.start_date,
    end_date: req.body.endDate ?? row.end_date,
    sort_order: req.body.order ?? row.sort_order,
  };

  db.prepare(`UPDATE content_items
    SET name=?, type=?, data_url=?, display_duration_seconds=?, start_date=?, end_date=?, sort_order=?
    WHERE id=?`).run(
    merged.name,
    merged.type,
    merged.data_url,
    merged.display_duration_seconds,
    merged.start_date,
    merged.end_date,
    merged.sort_order,
    id,
  );

  res.json({ ok: true });
});

app.delete('/api/content/:id', (req, res) => {
  db.prepare('DELETE FROM content_items WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

app.get('/api/default-image', (_req, res) => {
  res.json({ dataUrl: readSetting('defaultImage', null) });
});

app.put('/api/default-image', (req, res) => {
  writeSetting('defaultImage', req.body?.dataUrl ?? null);
  res.json({ ok: true });
});

app.delete('/api/default-image', (_req, res) => {
  db.prepare('DELETE FROM settings WHERE key = ?').run('defaultImage');
  res.status(204).end();
});

app.get('/api/ftp-config', (_req, res) => {
  res.json(readSetting('ftpConfig', { host: '', port: 21, username: '', password: '', remotePath: '/ads', enabled: false }));
});

app.put('/api/ftp-config', (req, res) => {
  writeSetting('ftpConfig', req.body ?? { host: '', port: 21, username: '', password: '', remotePath: '/ads', enabled: false });
  res.json({ ok: true });
});

const port = Number(process.env.CONTROL_PORT ?? 8787);
app.listen(port, () => {
  console.log(`Control backend running on http://0.0.0.0:${port}`);
});
