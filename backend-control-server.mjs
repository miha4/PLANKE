import express from 'express';
import cors from 'cors';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = join(__dirname, '.control-data');
const mediaDir = join(dataDir, 'media');
mkdirSync(dataDir, { recursive: true });
mkdirSync(mediaDir, { recursive: true });

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
app.use('/media', express.static(mediaDir, {
  maxAge: '7d',
  etag: true,
}));

function nowIso() {
  return new Date().toISOString();
}

function sanitizeFileName(name = 'file') {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function toPublicMediaUrl(_req, storedValue) {
  if (!storedValue) return null;
  if (storedValue.startsWith('http://') || storedValue.startsWith('https://') || storedValue.startsWith('data:')) {
    return storedValue;
  }
  if (storedValue.startsWith('/')) return storedValue;
  return `/media/${storedValue}`;
}

function parseDataUrl(dataUrl) {
  const match = /^data:(.+?);base64,(.+)$/.exec(String(dataUrl ?? ''));
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

function extensionFromMime(mimeType) {
  const map = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/ogg': 'ogv',
  };
  return map[mimeType] || 'bin';
}

function saveDataUrlAsMedia(dataUrl, originalName = 'upload') {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return dataUrl;
  const ext = extensionFromMime(parsed.mimeType);
  const safeName = sanitizeFileName(originalName).replace(/\.[^.]+$/, '');
  const fileName = `${Date.now()}-${crypto.randomUUID()}-${safeName}.${ext}`;
  const outputPath = join(mediaDir, fileName);
  const bytes = Buffer.from(parsed.base64, 'base64');
  writeFileSync(outputPath, bytes);
  return `/media/${fileName}`;
}

function saveBinaryAsMedia(binary, mimeType = 'application/octet-stream', originalName = 'upload') {
  const ext = extensionFromMime(mimeType);
  const safeName = sanitizeFileName(originalName).replace(/\.[^.]+$/, '');
  const fileName = `${Date.now()}-${crypto.randomUUID()}-${safeName}.${ext}`;
  const outputPath = join(mediaDir, fileName);
  writeFileSync(outputPath, binary);
  return `/media/${fileName}`;
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
    dataUrl: toPublicMediaUrl(_req, r.data_url),
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
    dataUrl: toPublicMediaUrl(_req, r.data_url),
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
  const storedMedia = body.mediaUrl || saveDataUrlAsMedia(body.dataUrl, body.name);
  db.prepare(`INSERT INTO content_items
    (id, name, type, data_url, display_duration_seconds, start_date, end_date, created_at, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id,
    body.name,
    body.type,
    storedMedia,
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
    dataUrl: toPublicMediaUrl(req, storedMedia),
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

  const nextMedia = req.body.mediaUrl
    ? req.body.mediaUrl
    : (req.body.dataUrl ? saveDataUrlAsMedia(req.body.dataUrl, req.body.name ?? row.name) : row.data_url);

  const merged = {
    name: req.body.name ?? row.name,
    type: req.body.type ?? row.type,
    data_url: nextMedia,
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
  res.json({ dataUrl: toPublicMediaUrl(_req, readSetting('defaultImage', null)) });
});

app.put('/api/default-image', (req, res) => {
  const stored = req.body?.mediaUrl || saveDataUrlAsMedia(req.body?.dataUrl, 'default-image');
  writeSetting('defaultImage', stored ?? null);
  res.json({ ok: true });
});

app.post('/api/upload', express.raw({ type: ['image/*', 'video/*', 'application/octet-stream'], limit: '200mb' }), (req, res) => {
  const contentType = req.get('content-type') || '';
  const fileName = req.get('x-file-name') || req.query.name || 'upload';

  let stored = null;
  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    stored = saveBinaryAsMedia(req.body, contentType, String(fileName));
  } else {
    const { dataUrl, name } = req.body ?? {};
    if (!dataUrl) return res.status(400).json({ error: 'file body or dataUrl is required' });
    stored = saveDataUrlAsMedia(dataUrl, name ?? String(fileName));
  }

  res.status(201).json({ mediaUrl: toPublicMediaUrl(req, stored) });
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
