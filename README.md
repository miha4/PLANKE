# PLANKE

PLANKE je desktop + web rešitev za prikaz vsebin (slike/video) na zaslonih:
- **Admin**: nalaganje in upravljanje vsebin.
- **Player**: celozaslonsko predvajanje aktivnih vsebin.

Aplikacija deluje kot Electron app, hkrati pa lahko Admin backend ponudi tudi web dostop za oddaljen upload/upravljanje.

---

## 1) Za koga je kateri dokument?

### Če nisi programer
- Preberi: **`docs/NAVODILA_ZA_NEPROGRAMERJE.md`**
- Namen: namestitev in osnovna uporaba na Windows/macOS.

### Če pripravljaš release (.dmg/.app/.exe)
- Preberi: **`docs/NAVODILA_BUILD_RELEASE.md`**
- Namen: build, packaging, ikone, release checklist.

---

## 2) Kratek pregled arhitekture

PLANKE ima 3 dele:

1. **Frontend (React + Vite)**
   - UI za Launcher/Admin/Player.

2. **Backend (Node + Express + SQLite)**
   - API (`/api/*`) in media storage.
   - Primer health endpoint: `/api/health`.

3. **Electron shell**
   - Za končne uporabnike (desktop app).
   - Samodejno zažene backend in odpre frontend.

---

## 3) Načina delovanja (produktni workflow)

## Način A: ločen Admin + ločeni Playerji
- En računalnik je **Admin node**.
- Player naprave se povežejo na ta Admin API.
- Ta način je primeren za več zaslonov.
- Kanali/predogledi za več playerjev so naslednja razvojna faza (dogovorjeno v roadmapu).

## Način B: Admin + Player na isti napravi
- Ena naprava upravlja vsebine in lahko tudi predvaja.
- Player lahko teče fullscreen/kiosk.
- Ob premiku miške se pokaže overlay za dostop do nastavitev (že podprto).

---

## 4) Kje se shranjujejo mediji?

- Privzeto: v **app userData** mapi (`.../control-data`).
- V Admin lahko izbereš svojo mapo za podatke (storage directory picker).
- Tja se shranjujejo media datoteke + SQLite baza.

---

## 5) Remote upload / oddaljeno upravljanje

Da, podpira se **web pristop**:
- Na tretji napravi (telefon/PC) odpreš admin URL (IP + port) in upravljaš vsebine brez namestitve Electrona.

Tipični primer:
- `http://<ADMIN-IP>:8787/admin` (backend route preusmeri na hash frontend)
- API base: `http://<ADMIN-IP>:8787/api`

---

## 6) Kako IP naslove narediti bolj "človeške"?

Namesto surovega IP lahko uporabiš:

1. **mDNS/Bonjour hostname** (najlažje v LAN)
   - npr. `http://planke-admin.local:8787`

2. **DHCP reservation + lokalni DNS zapis** (router)
   - admin vedno dobi isti IP + ime.

3. **Reverse proxy / tunnel** (za dostop izven LAN)
   - npr. Cloudflare Tunnel, Tailscale, VPN.

Priporočilo: za lokalno omrežje začni z `.local` imenom in fiksnim portom 8787.

---

## 7) Razvoj v VS Code (brez stalnega buildanja Electrona)

### Hitri razvoj frontend + backend
```bash
npm install
npm run dev:control
```
- Testiraš admin/player v browserju (Vite).

### Electron dev način
```bash
npm run electron:dev
```
ali
```bash
npm run dev:electron:control
```

Za razvoj **ne rabiš** vsakič delati `npm run dist`.

---

## 8) Produkcijski build

```bash
npm run dist
```

To pripravi release artefakte v mapi `release/`.

Podrobnosti: `docs/NAVODILA_BUILD_RELEASE.md`.

---

## 9) Ikone / branding

Trenutna naming konvencija (public folder):
- `planke-android192.png`
- `planke-android512.png`
- `planke-apple.png`

Pred release buildom preveri, da so datoteke prisotne.

---

## 10) Najpogostejše težave

- **Player najde samega sebe**: v Launcherju uporabi player mode + ročni API oddaljenega admina.
- **`Cannot GET /player`**: preveri, da backend servira `dist` in da je build uspešno narejen.
- **Prazno okno**: preveri logs in da je `dist/index.html` prisoten.
- **Port nedosegljiv**: preveri firewall (`8787/tcp`) in omrežje.

---

## 11) Tehnologije

- Electron
- React + Vite + TypeScript
- Node/Express
- SQLite

