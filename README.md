# Schack Cypher

Schack mot elva hiphop-botar, drivna av Stockfish 17.1. Varje parti kan analyseras i efterhand
(precision, klassning av varje drag, värderingsgraf och bättre drag som pilar).

Byggd för att spelas på TV via en Google TV-box (Strong LEAP-S3+ V2), men fungerar i alla webbläsare.

## Installera på TV-boxen

1. Installera **Downloader** från Play Butik.
2. Inställningar → Appar → Säkerhet och begränsningar → Okända källor → slå på för Downloader.
3. Öppna Downloader och skriv in:
   `https://github.com/Shabbyf/schack-cypher/releases/latest/download/schack-cypher.apk`
4. Installera. Appen heter **Schack Cypher** och ligger bland dina appar.

Uppdatera genom att göra om steg 3. Ditt facit och tidigare partier finns kvar.

## Fjärrkontrollen

| Knapp | Gör |
|---|---|
| Pilar | Flytta markören på brädet och mellan knapparna |
| OK | Välj pjäs / ruta / knapp |
| Tillbaka | Avmarkera, stäng analysen. Två tryck avslutar appen |
| 🔴 Röd | Ny match |
| 🟢 Grön | Tips |
| 🟡 Gul | Nästa motståndare |
| 🔵 Blå | Analysera partiet |

## Struktur

| Sökväg | Innehåll |
|---|---|
| `src/app.html` | Själva appen (en fil, samma som Claude-artifacten) |
| `tools/make_www.py` | Bygger `www/index.html` från `src/app.html` |
| `www/` | Webbappen med Stockfish (WASM) och chess.js, fungerar offline |
| `android/` | Android TV-skal: en WebView som serverar `www/` |
| `.github/workflows/build.yml` | Bygger APK:n och publicerar en release vid varje push till `main` |

Signeringsnyckeln i `android/keystore/` ligger i repot med flit, så att nya versioner kan
installeras ovanpå gamla. Den är bara till för den här hobbyappen.

## Licens

Stockfish och stockfish.js är GPLv3, därför är hela projektet GPLv3 (se `LICENSE`).
chess.js är BSD-licensierat.
