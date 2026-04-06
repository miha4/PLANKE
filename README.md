# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Electron Option B (control + player)

This repository also includes a unified Electron setup:

- Control mode for the main computer (dashboard + local backend + SQLite).
- Player mode for client computers (fullscreen player connected to control node).

See full setup guide: `OPTION_B_SETUP.md`.

---

## Enostavna razlaga arhitekture (Vite + React + Express + Electron)

Aplikacija ima 3 glavne dele:

1. **Frontend (React + Vite)**  
   - Teče na portu **5173**.  
   - To je uporabniški vmesnik (kar vidiš v browserju).

2. **Backend (Express + SQLite)**  
   - Teče na portu **8787**.  
   - To je API (npr. `/api/health`, `/api/content`), ki hrani in vrača podatke.
   - Če odpreš samo `/` na backend portu, lahko dobiš `Cannot GET /` — to je normalno, ker root route ni definiran.

3. **Electron**  
   - “Desktop ovitek”, ki odpre frontend kot namizno aplikacijo.
   - Za GUI potrebuje prikazovalnik (DISPLAY/X server).

### Zakaj Electron v Codespaces/Codex pogosto ne dela?

Codespaces/Codex okolje je običajno **headless** (brez grafičnega zaslona), zato se lahko pojavi napaka:

- `Missing X server`
- `Missing DISPLAY`

To je pričakovano obnašanje okolja, ne nujno napaka v tvoji aplikaciji.

---

## Priporočen način razvoja (tudi če Electron v Codespaces ne dela)

Da — app lahko normalno razvijaš in testiraš:

- Frontend testiraš v browserju na `5173`.
- Backend testiraš preko API endpointov na `8787`.
- Electron “okno” preveriš lokalno na svojem računalniku (kjer imaš GUI).

---

## Hiter “korak-po-korak” pregled (kaj dela in kaj ne)

### 0) Namesti odvisnosti

```sh
npm install
```

### 1) Zaženi frontend + backend (brez Electron)

```sh
npm run dev:control
```

Ta ukaz zažene:
- backend (`dev:backend`) in
- frontend (`dev`).

### 2) Preveri frontend

Odpri port **5173** (v browserju / Ports panelu).  
Če vidiš UI, frontend dela.

### 3) Preveri backend health endpoint

V terminalu:

```sh
curl http://127.0.0.1:8787/api/health
```

Pričakovan odgovor je JSON z `ok: true`.

### 4) Ne testiraj backenda na `/`

Če pokličeš:

```sh
curl http://127.0.0.1:8787/
```

`Cannot GET /` je normalno in pričakovano.

### 5) Če želiš vseeno zagnati Electron v Codespaces

```sh
npm run dev:electron:control
```

Možno je, da pade z napako DISPLAY/X server (to je pričakovano v headless okolju).

### 6) Electron test (pravi desktop test)

Za končni Electron test odpri projekt lokalno (na svojem računalniku) in zaženi isti ukaz:

```sh
npm run dev:electron:control
```

Tam bi se moralo odpreti Electron okno.

---

## Pojmi za neprogramerja (IP, port, localhost, Codespaces)

- **IP naslov**: “hišna številka” naprave v omrežju (npr. računalnik ali strežnik).  
- **Port**: “številka vrat” na tej napravi, kjer posluša določena aplikacija (npr. frontend 5173, backend 8787).  
- **Zakaj različna porta?** Ker frontend in backend sta 2 ločena procesa/storitvi, vsak posluša na svojih “vratih”.  
- **localhost**: pomeni “ta ista naprava”.  
  - Na tvojem laptopu `localhost` kaže na laptop.  
  - Na telefonu `localhost` kaže na telefon.  
  - V Codespaces `localhost` kaže na Codespace container.
- **Zakaj localhost na telefonu ni isti kot v Codespaces?** Ker sta to dve različni napravi/okolji.
- **Public forwarded port (GitHub Codespaces)**: GitHub naredi javni URL do izbranega porta znotraj tvojega Codespace-a, da ga lahko odpreš iz drugih naprav.

### Kako sestaviš delujoč `/player` URL

1. Vzemi **public frontend URL** za port 5173.  
2. Vzemi **public backend URL** za port 8787.  
3. Dodaj `apiBase` query parameter.

Primer:

```text
https://<frontend-5173-url>/player?apiBase=https://<backend-8787-url>/api
```

Če ta URL odpreš na telefonu, bo `/player` bral iste vsebine iz shared backenda.

---

## Najpreprostejša stabilna shared-storage rešitev (ta projekt)

Priporočen tok:

1. Uporabnik na telefonu ali računalniku izbere sliko/video v admin strani.
2. Frontend pošlje datoteko na backend (`POST /api/upload`).
3. Backend datoteko shrani v shared mapo (`.control-data/media`) in vrne javni `mediaUrl`.
4. Frontend shrani metadata v `POST /api/content` (ime, datumi, tip, `mediaUrl`).
5. `/player` bere samo `/api/content/active`, zato vse naprave vedno vidijo iste slike/videe.

To pomeni:
- **brez** localStorage kot glavnega vira,
- enoten backend vir za vse naprave,
- bolj stabilno deljenje vsebine med računalnikom in telefonom.
