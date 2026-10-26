// Bygger data/openings.json från lichess-org/chess-openings (CC0).
//   bun tools/build_openings.ts /sökväg/till/chess-openings
// Varje öppning blir [eco, namn, uci-drag], och "epd" pekar från ställningens
// EPD (bräde, tur, rockad, en passant) till öppningens index.
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Chess } from '../vendor/chessops/chess';
import { makeFen } from '../vendor/chessops/fen';
import { parseSan } from '../vendor/chessops/san';
import { makeUci } from '../vendor/chessops/util';

const dir = process.argv[2];
const list: [string, string, string][] = [];
const epd: Record<string, number> = {};
for (const f of ['a', 'b', 'c', 'd', 'e']) {
  const rows = readFileSync(join(dir, f + '.tsv'), 'utf8').trim().split('\n').slice(1);
  for (const row of rows) {
    const [eco, name, pgn] = row.split('\t');
    const pos = Chess.default();
    const ucis: string[] = [];
    let ok = true;
    for (const tok of pgn.split(/\s+/)) {
      if (/^\d+\.$/.test(tok) || !tok) continue;
      const m = parseSan(pos, tok);
      if (!m) { ok = false; break; }
      ucis.push(makeUci(m));
      pos.play(m);
    }
    if (!ok) { console.warn('hoppar över', eco, name); continue; }
    const key = makeFen(pos.toSetup()).split(' ').slice(0, 4).join(' ');
    epd[key] = list.length;
    list.push([eco, name, ucis.join(' ')]);
  }
}
writeFileSync(join(import.meta.dir, '..', 'data', 'openings.json'), JSON.stringify({ source: 'lichess-org/chess-openings (CC0)', list, epd }));
console.log(list.length, 'öppningar');
