# Kako uporabiti `electron-unpacked`

Ko poženeš:

```bash
npm run build:electron
```

se pripravi mapa:

```text
release/electron-unpacked
```

Ta mapa je **prenosljiv (unpacked)** paket aplikacije.

## Hitri postopek (za uporabnika)

1. Kopiraj mapo `release/electron-unpacked` na ciljni računalnik.
2. Odpri terminal v tej mapi.
3. Zaženi eno od opcij:
   - macOS/Linux: `./start-mac-linux.sh`
   - Windows: `start-windows.bat`
   - ročno: `npx electron .`

Skripte same preverijo, ali manjkajo `node_modules`, in po potrebi zaženejo `npm install --omit=dev`.

## Kje se shranjujejo podatki (slike/video/baza)

Podatki se ne zapisujejo v app mapo, ampak v Electron `userData/control-data`, zato je unpacked mapa lahko read-only.

## Omrežje / povezava player -> admin

- Privzeti port je `8787`.
- V istem LAN uporabi scanner v launcherju.
- Če je admin na drugem omrežju, potrebuješ javni endpoint (VPN / tunnel / reverse proxy).
- Firewall: odpri TCP 8787 (ne izklapljaj celega firewalla).
