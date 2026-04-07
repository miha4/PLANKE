# PLANKE – navodila za nalaganje aplikacije (za neprogramerje)

Ta navodila so namenjena uporabnikom, ki **ne uporabljajo terminala** in želijo aplikacijo namestiti kot običajen program.

## 1) Kaj potrebujete
- Računalnik z **Windows** ali **macOS**.
- Datoteko namestitve, ki jo dobite od razvijalca:
  - Windows: `PLANKE-Setup-...exe`
  - macOS: `PLANKE-...dmg`

> Pomembno: ne potrebujete Node.js, npm, Vite ali ročnega zaganjanja skript.

---

## 2) Namestitev na Windows
1. Dvoklik na datoteko `PLANKE-Setup-...exe`.
2. Če se pojavi opozorilo SmartScreen:
   - kliknite **More info**,
   - nato **Run anyway**.
3. Sledite korakom čarovnika (Next → Install → Finish).
4. Aplikacijo odprete iz **Start menija** kot normalen program.

---

## 3) Namestitev na macOS
1. Dvoklik na datoteko `PLANKE-...dmg`.
2. V oknu povlecite ikono **PLANKE** v mapo **Applications**.
3. Odprite **Applications** in zaženite PLANKE.
4. Če macOS prikaže opozorilo za neznanega razvijalca:
   - odprite **System Settings → Privacy & Security**,
   - kliknite **Open Anyway** pri PLANKE,
   - ponovno zaženite aplikacijo.

---

## 4) Prvi zagon (kaj pričakovati)
- Aplikacija sama zažene lokalne storitve v ozadju.
- Uporabnik ne rabi odpirati terminala.
- Po zagonu izberete način:
  - **Admin** (upravljanje vsebin),
  - **Player** (predvajanje vsebin).

---

## 5) Povezava med napravami (Admin ↔ Player)
Če sta napravi v istem omrežju (isti Wi‑Fi/LAN):
1. Na Admin napravi odprite PLANKE in preverite lokalni IP.
2. Na Player napravi v PLANKE uporabite samodejno iskanje ali ročno vnesite API naslov.
3. Če povezava ne deluje, preverite:
   - da sta napravi v istem omrežju,
   - da požarni zid ne blokira porta `8787`.

---

## 6) Posodobitev aplikacije
Ko dobite novo verzijo:
1. Zaprite PLANKE.
2. Zaženite nov installer (`.exe` ali `.dmg`).
3. Dokončajte namestitev (prepiše staro verzijo).

---

## 7) Najpogostejše težave
### A) Belo okno / aplikacija se ne odpre pravilno
- Zaprite aplikacijo in jo ponovno odprite.
- Če se ponavlja, pošljite podpori:
  - operacijski sistem,
  - točen čas težave,
  - kaj ste kliknili pred napako.

### B) Player ne vidi Admina
- Preverite, da je Admin aplikacija zagnana.
- Preverite, da sta napravi v istem omrežju.
- Preverite pravila požarnega zidu (port `8787`).

### C) Antivirus blokira installer
- Dovolite namestitev (Allow/Run anyway).
- Če imate službeni računalnik, kontaktirajte IT skrbnika.

---

## 8) Kratka navodila za podporo (copy/paste)
Ko pišete podpori, pošljite:
- verzijo aplikacije,
- operacijski sistem (Windows/macOS in verzija),
- ali gre za Admin ali Player napravo,
- sliko zaslona napake.

