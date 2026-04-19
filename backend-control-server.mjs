// uvozi modulov
import express from 'express'; // glavni web streznik
import cors from 'cors'; // dovoli klice iz frontenda na drugem naslovu/portu
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'; // ustvarjanje map in zapis datotek
import { dirname, join } from 'node:path'; // delo s potmi do map/datotek
import { fileURLToPath } from 'node:url'; // pretvori import.meta.url v pravo datotecno pot
import { DatabaseSync } from 'node:sqlite'; // SQLite baza
import { networkInterfaces } from 'node:os';
import { createHash } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url); // polna pot do .js datoteke
const __dirname = dirname(__filename); // mapa, kjer ta datoteka je
const dataDir = process.env.CONTROL_DATA_DIR
  ? join(process.env.CONTROL_DATA_DIR)
  : join(__dirname, '.control-data'); // mapa za podatke
const mediaDir = join(dataDir, 'media'); // fizične slike in videi
mkdirSync(dataDir, { recursive: true }); // ce mape ne obstajajo, jih ustvari
mkdirSync(mediaDir, { recursive: true });

//ustvarimo SQLite bazo, ki vsebuje podatke od slik/videjev. Definiramo 2 tabeli:
// content_items: glavna tabela za vsebino, settings: tabela s ključi-vrednostmi
// ne delamo posebne tabele za vsako nastavitev ampak vse hranimo kot key-value, value je JSON niz
const db = new DatabaseSync(join(dataDir, 'control.db'));
db.exec(`
CREATE TABLE IF NOT EXISTS content_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('image','video')),
  channel_id TEXT NOT NULL DEFAULT 'A',
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

const contentTableColumns = db.prepare('PRAGMA table_info(content_items)').all();
if (!contentTableColumns.some(col => col.name === 'channel_id')) {
  db.exec("ALTER TABLE content_items ADD COLUMN channel_id TEXT NOT NULL DEFAULT 'A';");
}

// ustvarjanje express appa:  
const app = express();
app.use(cors()); // omogoči, da frontend in backend komunicirata, tudi če sta na različnih URL-jih ali portih
app.use(express.json({ limit: '50mb' })); // Če frontend pošlje JSON body, ga Express prebere, dovoljeno je do 50mb; ko npr pošiljamo slike kot base64
// pomembno: vse, kar je v mapi mediaDir, bo javno dostopno pod /media/...
//Če imaš v mapi datoteko: .control-data/media/test.jpg, bo dostopna na /media/test.jpg
app.use('/media', express.static(mediaDir, {
  maxAge: '7d', //browser lahko cache-a datoteko 7 dni
  etag: true, // preverjamo ali se je datoteka spremenila
}));

// vrne datum/ čas v ISO formatu
//2026-04-06T10:15:30.123Z
function nowIso() {
  return new Date().toISOString();
}

function normalizeChannelId(raw) {
  return raw === 'A' || raw === 'B' || raw === 'C' ? raw : 'A';
}

//počisti ime datoteke
function sanitizeFileName(name = 'file') {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '_');
}

//normalizira pot do medija
function toPublicMediaUrl(_req, storedValue) {
  if (!storedValue) return null;
  if (storedValue.startsWith('http://') || storedValue.startsWith('https://') || storedValue.startsWith('data:')) {
    return storedValue;
  }
  if (storedValue.startsWith('/')) return storedValue;
  return `/media/${storedValue}`;
}

//razbije base64 data URL na dele
//data:image/png;base64,iVBORw0KGgoAAA...
// vrne {
// mimeType: 'image/png',
//  base64: 'iVBORw0KGgoAAA...'}
function parseDataUrl(dataUrl) {
  const match = /^data:(.+?);base64,(.+)$/.exec(String(dataUrl ?? ''));
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

// določi končnico
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

//če frontend pošlje sliko kot data:image/...;base64, jo ta funkcija:
// razbije, določi pravo končnico, naredi varno ime, shrani binarno datoteko v media mapo,
// vrne javno pot /media/...
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

// podobno kot prejšnja funkcija le da tu dobimo surove binarne podatke
// to uporabljamo pri /api/upload, ko pošiljamo recimo
//curl -X POST http://localhost:8787/api/upload \
//  --data-binary @test.jpg \
//  -H "Content-Type: image/jpeg"
//takrat backend ne dobi base 64 pač pa bytes datoteke
function saveBinaryAsMedia(binary, mimeType = 'application/octet-stream', originalName = 'upload') {
  const ext = extensionFromMime(mimeType);
  const safeName = sanitizeFileName(originalName).replace(/\.[^.]+$/, '');
  const fileName = `${Date.now()}-${crypto.randomUUID()}-${safeName}.${ext}`;
  const outputPath = join(mediaDir, fileName);
  writeFileSync(outputPath, binary);
  return `/media/${fileName}`;
}

// prebere nastavitev iz base; če ključ obstaja vrne JSON.parse(row.value)
function readSetting(key, fallback = null) {
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const row = stmt.get(key);
  return row ? JSON.parse(row.value) : fallback;
}

// zapiše  nastavitev v bazo, če kljul že obstaja, ga posodobi, če ne ga vstavi
function writeSetting(key, value) {
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(key, JSON.stringify(value));
}

function normalizePlayerToken(token) {
  return String(token ?? '').trim();
}

function hashPlayerToken(token) {
  return createHash('sha256').update(normalizePlayerToken(token), 'utf8').digest('hex');
}

function readPlayerTokenHashes() {
  const list = readSetting('playerTokenHashes', []);
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter(item => typeof item === 'string' && item.length > 0))];
}

function writePlayerTokenHashes(hashes) {
  writeSetting('playerTokenHashes', [...new Set(hashes)]);
}

function getIncomingPlayerToken(req) {
  const headerValue = req.get('x-planke-token');
  if (headerValue?.trim()) return headerValue.trim();
  if (typeof req.query.token === 'string' && req.query.token.trim()) return req.query.token.trim();
  return '';
}

function requirePlayerToken(req, res, next) {
  const allowedHashes = readPlayerTokenHashes();
  if (allowedHashes.length === 0) return next();

  const provided = getIncomingPlayerToken(req);
  if (!provided) return res.status(401).json({ error: 'Player token is required' });
  const providedHash = hashPlayerToken(provided);
  if (!allowedHashes.includes(providedHash)) return res.status(403).json({ error: 'Invalid player token' });
  return next();
}

//API ENDPOINTI

//testni endpoint, da preverimo delovanje backenda
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, at: nowIso() });
});

app.get('/api/network-info', (_req, res) => {
  const nets = networkInterfaces();
  const addresses = [];
  for (const list of Object.values(nets)) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }
  const port = Number(process.env.CONTROL_PORT ?? 8787);
  res.json({
    port,
    addresses: [...new Set(addresses)],
    apiPath: '/api',
    healthPath: '/api/health',
  });
});
// vrne vsebino iz baze sortirano po sort order
app.get('/api/content', (_req, res) => {
  const rows = db.prepare('SELECT * FROM content_items ORDER BY sort_order ASC').all();
  res.json(rows.map(r => ({
    id: r.id,
    name: r.name,
    type: r.type,
    channelId: normalizeChannelId(r.channel_id),
    dataUrl: toPublicMediaUrl(_req, r.data_url),
    displayDurationSeconds: r.display_duration_seconds,
    startDate: r.start_date,
    endDate: r.end_date,
    createdAt: r.created_at,
    order: r.sort_order,
  })));
});

//endpoint, ki ga uporablja player: vrne samo aktivne vsebine
app.get('/api/content/active', requirePlayerToken, (_req, res) => {
  const now = nowIso();
  const channelId = _req.query.channel ? normalizeChannelId(_req.query.channel) : null;
  const rows = channelId
    ? db.prepare('SELECT * FROM content_items WHERE channel_id = ? AND start_date <= ? AND end_date > ? ORDER BY sort_order ASC').all(channelId, now, now)
    : db.prepare('SELECT * FROM content_items WHERE start_date <= ? AND end_date > ? ORDER BY sort_order ASC').all(now, now);
  res.json(rows.map(r => ({
    id: r.id,
    name: r.name,
    type: r.type,
    channelId: normalizeChannelId(r.channel_id),
    dataUrl: toPublicMediaUrl(_req, r.data_url),
    displayDurationSeconds: r.display_duration_seconds,
    startDate: r.start_date,
    endDate: r.end_date,
    createdAt: r.created_at,
    order: r.sort_order,
  })));
});

app.get('/api/player-tokens', (_req, res) => {
  const hashes = readPlayerTokenHashes();
  res.json(hashes.map(hash => ({
    id: hash,
    masked: `${hash.slice(0, 6)}...${hash.slice(-4)}`,
  })));
});

app.post('/api/player-tokens', (req, res) => {
  const token = normalizePlayerToken(req.body?.token);
  if (token.length < 12) {
    return res.status(400).json({ error: 'Token must be at least 12 characters long' });
  }

  const tokenHash = hashPlayerToken(token);
  const hashes = readPlayerTokenHashes();
  if (!hashes.includes(tokenHash)) {
    hashes.push(tokenHash);
    writePlayerTokenHashes(hashes);
  }

  return res.status(201).json({ ok: true, id: tokenHash });
});

app.delete('/api/player-tokens/:id', (req, res) => {
  const tokenId = String(req.params.id ?? '').trim();
  if (!tokenId) return res.status(400).json({ error: 'Token id is required' });

  const filtered = readPlayerTokenHashes().filter(hash => hash !== tokenId);
  writePlayerTokenHashes(filtered);
  return res.status(204).end();
});

//endpoint ustvari nov content idem: prebere body, ustvari nov ID, zapiše čas kreiranja,
// ...
app.post('/api/content', (req, res) => {
  const body = req.body ?? {};
  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const countRow = db.prepare('SELECT COUNT(*) as count FROM content_items').get();
  const sortOrder = Number(countRow?.count ?? 0);
  const storedMedia = body.mediaUrl || saveDataUrlAsMedia(body.dataUrl, body.name);
  db.prepare(`INSERT INTO content_items
    (id, name, type, channel_id, data_url, display_duration_seconds, start_date, end_date, created_at, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id,
    body.name,
    body.type,
    normalizeChannelId(body.channelId),
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
    channelId: normalizeChannelId(body.channelId),
    dataUrl: toPublicMediaUrl(req, storedMedia),
    displayDurationSeconds: body.displayDurationSeconds ?? 10,
    startDate: body.startDate,
    endDate: body.endDate,
    createdAt,
    order: sortOrder,
  });
});

// poišče obstoječi zapis, če ne obstaja: 404
app.patch('/api/content/:id', (req, res) => {
  const id = req.params.id;
  const row = db.prepare('SELECT * FROM content_items WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  // posodobitev medija: če pride mediaUrl, uporabi njega, če pride dataUrl, shrani novo datoteko, sicer obdrži staro vrednost
  const nextMedia = req.body.mediaUrl
    ? req.body.mediaUrl
    : (req.body.dataUrl ? saveDataUrlAsMedia(req.body.dataUrl, req.body.name ?? row.name) : row.data_url);

    // združevanje novih in starih vrednosti
  const merged = {
    name: req.body.name ?? row.name,
    type: req.body.type ?? row.type,
    channel_id: normalizeChannelId(req.body.channelId ?? row.channel_id),
    data_url: nextMedia,
    display_duration_seconds: req.body.displayDurationSeconds ?? row.display_duration_seconds,
    start_date: req.body.startDate ?? row.start_date,
    end_date: req.body.endDate ?? row.end_date,
    sort_order: req.body.order ?? row.sort_order,
  };

  //update v bazi
  db.prepare(`UPDATE content_items
    SET name=?, type=?, channel_id=?, data_url=?, display_duration_seconds=?, start_date=?, end_date=?, sort_order=?
    WHERE id=?`).run(
    merged.name,
    merged.type,
    merged.channel_id,
    merged.data_url,
    merged.display_duration_seconds,
    merged.start_date,
    merged.end_date,
    merged.sort_order,
    id,
  );

  //
  res.json({ ok: true });
});

// izbriše zapis iz baze; ne izbriše fizične datoteke iz media mape, ampak samo referenco iz baze
app.delete('/api/content/:id', (req, res) => {
  db.prepare('DELETE FROM content_items WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// vrne privzeto sliko
app.get('/api/default-image', (_req, res) => {
  res.json({ dataUrl: toPublicMediaUrl(_req, readSetting('defaultImage', null)) });
});

// nastavi priveto sliko. Logika je enaka:
// če dobiš mediaUrl ga shraniš, sicer shraniš dataUrl kot datoteko, potem to zapišeš v settings pod ključ defaultImage
app.put('/api/default-image', (req, res) => {
  const stored = req.body?.mediaUrl || saveDataUrlAsMedia(req.body?.dataUrl, 'default-image');
  writeSetting('defaultImage', stored ?? null);
  res.json({ ok: true });
});

//poseben upload endpoint, ki je namenjen uploadu ? 
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

// FTP endpointi so odstranjeni, ker aplikacija uporablja lokalni upload in media storage.


const frontendDistDir = join(__dirname, 'dist');
const frontendIndexFile = join(frontendDistDir, 'index.html');

function extractSearchFromOriginalUrl(originalUrl = '') {
  const idx = originalUrl.indexOf('?');
  return idx >= 0 ? originalUrl.slice(idx) : '';
}

function setupFrontendRoutes() {
  if (!existsSync(frontendIndexFile)) {
    console.warn('[backend] dist/index.html not found. Frontend routes (/player, /admin, /launcher) will return 404 until you run npm run build.');
    return;
  }

  // 1) statični frontend build (dist/assets, favicon, ...)
  app.use(express.static(frontendDistDir, { index: false }));

  // 2) lepši URL-ji za HashRouter: /player -> /#/player
  app.get(['/player', '/admin', '/launcher'], (req, res) => {
    const search = extractSearchFromOriginalUrl(req.originalUrl);
    res.redirect(`/#${req.path}${search}`);
  });

  // 3) catch-all fallback za vse ne-API poti
  app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(frontendIndexFile);
  });
}

setupFrontendRoutes();

// zagon strežnika
const port = Number(process.env.CONTROL_PORT ?? 8787);
app.listen(port, () => {
  console.log(`Control backend running on http://0.0.0.0:${port}`);
});

//na kratko:
//content_items = seznam oglasov/slik/video vsebin
//settings = splošne nastavitve
//media static = javni dostop do fizičnih datotek
//toPublicMediaUrl() = poskrbi, da frontend vedno dobi uporaben URL
//saveDataUrlAsMedia() = base64 pretvori v pravo datoteko
//saveBinaryAsMedia() = binary upload shrani kot datoteko
//api/content/active = glavni endpoint za player
///api/upload = glavni endpoint za upload datotek
