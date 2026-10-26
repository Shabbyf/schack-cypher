# Schack Cypher

Schack med hiphop-tema, byggt som Lichess: elva botar med egen stil plus MC Spegel
som alltid spelar på din nivå, Lichess-varianterna, taktikpussel, öppningsträning
och analys med Stockfish 17.1. Körs i webbläsaren och som Android TV-app.

## Funktioner

- **Spela**: Standard, Chess960, Crazyhouse, King of the Hill, Tre schackar, Atomic,
  Antichess, Horde och Racing Kings. Rankade eller vänskapsmatcher.
- **Karriär**: slå dig uppåt från Rookie till Legend, en bot i taget.
- **Rating**: eget Elo mot botarna och en separat pusselrating.
- **Pussel**: 8 000+ pussel från Lichess databas i appen (per tema, svårighet och
  öppning), dagens pussel och streak. Online hämtas fler direkt från Lichess.
- **Träning**: tveksamma öppningsdrag sparas efter partiet och repeteras med växande
  intervall. Spelar du samma drag igen säger boten till. Öva huvudlinjer i 20 öppningar.
- **Andra chans**: efter ett blunder i vänskapsmatcher får du ta tillbaka draget.
- **Analys**: precision, värderingsgraf, klassade drag och "Öva på dina misstag".
- **PGN**: kopiera, ladda ner, eller skanna en QR-kod för att öppna partiet i Lichess.
- **Utseende**: åtta brädteman (bl.a. graffitivägg, vinyl, guldkedja) och elva pjässet.
- **Ljud**: dragljud, en beat som ökar tempot när partiet är jämnt och upplästa repliker.
- **TV-appen** hittar nya versioner själv och visar motorstatus under Inställningar.

## Installera på TV:n (första gången)

1. Installera **Downloader** från Play Butik.
2. Inställningar → Appar → Säkerhet och begränsningar → Okända källor → slå på för Downloader.
3. Öppna Downloader och skriv in:
   `https://github.com/Shabbyf/schack-cypher/releases/latest/download/schack-cypher.apk`

Därefter frågar appen själv när en ny version finns. Första uppdateringen ber Android
om lov att låta Schack Cypher installera appar; slå på det och välj Uppdatera igen.

## Fjärrkontrollen

| Knapp | I partiet | I pussel |
|---|---|---|
| Pilar | Flytta markören | Flytta markören |
| OK | Välj pjäs / ruta / knapp | Välj |
| Tillbaka | Avmarkera, sedan till menyn | Till pusselmenyn |
| 🔴 Röd | Ny match / rematch | Nästa pussel |
| 🟢 Grön | Tips | Tips |
| 🟡 Gul | Vänd brädet | |
| 🔵 Blå | Analysera | Visa lösningen |

## Utveckling

```
npm install
node tools/build.mjs        # bygger www/
python3 -m http.server -d www
```

| Sökväg | Innehåll |
|---|---|
| `src/` | Webbappen (`index.html`, `styles.css`, `js/`) |
| `vendor/` | chessops (Lichess regelbibliotek), Stockfish 17.1, QR-kod |
| `data/` | Öppningsnamn och pusselpaket från Lichess (CC0) |
| `assets/pieces/` | Pjässet från Lichess, se `LICENSES.md` |
| `tools/` | Byggskript och skript som tar fram data |
| `android/` | Android TV-skal: WebView, uppläsning och uppdateringar |
| `.github/workflows/` | Bygger APK vid varje push; uppdaterar pusselpaketet var tredje månad |

Signeringsnyckeln i `android/keystore/` ligger i repot med flit, så att nya versioner kan
installeras ovanpå gamla. Den är bara till för den här hobbyappen.

## Licens

GPLv3 (se `LICENSE`), eftersom Stockfish och chessops är GPL. Öppningar och pussel från
Lichess är CC0. Pjässetens licenser står i `assets/pieces/LICENSES.md`.
