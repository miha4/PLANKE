# Option B: Enotna Electron aplikacija (Control + Player)

Ta projekt je nastavljen za dva načina delovanja z **eno kodo**:

- `APP_MODE=control`: glavni računalnik (dashboard + lokalni backend + SQLite)
- `APP_MODE=player`: player računalnik (predvajanje vsebin iz glavnega računalnika)

## 1) Namestitev

```bash
npm install
```

> Skripte ne potrebujejo globalnega `concurrently`/`wait-on`/`cross-env`.

## 2) Zagon glavnega računalnika (Control)

To zažene:
- lokalni backend na `http://localhost:8787`
- Vite frontend
- Electron okno v control načinu

```bash
npm run dev:control
```

Podatki se shranjujejo v:
- `./.control-data/control.db` (SQLite)

Če želiš enako z Electron oknom:

```bash
npm run dev:electron:control
```

## 3) Zagon player računalnika

Player mora imeti dostop do glavnega računalnika prek IP-ja.

Primer (če je glavni računalnik `192.168.1.10`):

```bash
CONTROL_URL=http://192.168.1.10:8787 npm run dev:electron:player
```

Dodatno lahko nastaviš id naprave:

```bash
CONTROL_URL=http://192.168.1.10:8787 DEVICE_ID=player-hall npm run dev:electron:player
```

## 4) Production build (osnova)

```bash
npm run build
npm run electron
```

> Opomba: za installer (exe/msi) dodaj `electron-builder` ali `electron-forge`.

## 5) Omrežje

Na glavnem računalniku odpri port `8787` (LAN), da playerji dostopajo do API-ja.

## 6) API endpoints (lokalni backend)

- `GET /api/health`
- `GET /api/content`
- `GET /api/content/active`
- `POST /api/content`
- `PATCH /api/content/:id`
- `DELETE /api/content/:id`
- `GET /api/default-image`
- `PUT /api/default-image`
- `DELETE /api/default-image`
- `GET /api/ftp-config`
- `PUT /api/ftp-config`

## 7) Kako deluje fallback

Frontend najprej poskusi API (`/api/...`).
Če API ni dosegljiv, uporablja obstoječi `localStorage` način.

To omogoča postopen prehod in lažje testiranje.
