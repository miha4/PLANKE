# PLANKE – navodila za build release paketov (.dmg, .app, .exe)

Ta dokument je zate kot vzdrževalca projekta: kako iz trenutne kode pripraviš release artefakte za uporabnike.

## 1) Predpogoji

- Node.js 20+ in npm.
- Git checkout projekta.
- Čist build (`git status` naj bo brez nenamernih sprememb).

Namesti odvisnosti:

```bash
npm install
```

## 2) Pomembno glede platform

- **macOS build (`.dmg` + `.app`)**: naredi na **macOS** stroju.
- **Windows build (`.exe`)**: naredi na **Windows** stroju.

`electron-builder` sicer podpira določene cross-build scenarije, ampak za stabilen release je najbolje graditi na ciljnem OS.

## 3) Hiter “all-in-one” ukaz

Projekt že vsebuje skripto:

```bash
npm run dist
```

Ta izvede:
1. čiščenje stare mape `release/`,
2. `vite build` (frontend v `dist/`),
3. sintaktični check `electron/main.mjs`,
4. `electron-builder --mac dmg --win nsis`.

Output gre v mapo:

```text
release/
```

## 4) Priporočen način po korakih


### 4.0 Pred ponovnim buildom po napaki

Če si prej zgradil pokvarjen `.app`/`.dmg`, ga najprej izbriši in naredi nov build, da ne testiraš starega artefakta.

### 4.1 Preveri build frontenda

```bash
npm run build
```

### 4.2 Build samo za macOS

Na macOS stroju:

```bash
npx electron-builder --mac dmg
```

Tipični artefakti v `release/`:
- `PLANKE-<verzija>.dmg`
- `mac/PLANKE.app`

### 4.3 Build samo za Windows

Na Windows stroju:

```bash
npx electron-builder --win nsis
```

Tipični artefakti v `release/`:
- `PLANKE Setup <verzija>.exe` (NSIS installer)

## 5) Kje se nastavljajo targeti in ime aplikacije

Glavne nastavitve so v `package.json` pod ključem `build`:
- `productName` (ime aplikacije),
- `directories.output` (izhodna mapa, trenutno `release`),
- `mac.target`,
- `win.target`.

Če želiš spremeniti format installerja (npr. dodaš `msi` ali `zip`), to uredi tam.

## 6) Podpisovanje (code signing)

Za interno testiranje podpis ni nujen, za javno distribucijo pa je priporočljiv:
- macOS: Apple Developer certifikat + notarization.
- Windows: Code Signing certifikat (zmanjša SmartScreen opozorila).

Ta repo trenutno vsebuje osnovni packaging, brez prisiljene podpisne konfiguracije.

## 7) Pred objavo preveri

1. Da se aplikacija odpre brez terminala.
2. Da backend v aplikaciji štarta samodejno.
3. Da delujejo osnovni flowi (`launcher`, `admin`, `player`).
4. Da v `release/` dejansko obstajajo `.dmg`/`.app` ali `.exe` artefakti.

## 8) Najpogostejše napake

- `electron-builder: command not found`  
  Rešitev: `npm install` (devDependency vsebuje `electron-builder`).

- Build pade na napačnem OS za ciljni format  
  Rešitev: gradi na ciljnem operacijskem sistemu.

- Prazno okno po instalaciji  
  Rešitev: preveri, da je `npm run build` uspešen in da packaging vključuje `dist/**`.
