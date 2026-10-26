// Data som laddas vid behov: öppningsnamn och pusselpaketet (båda från Lichess, CC0),
// samt pussel direkt från Lichess API när enheten är online.
import { Game } from './rules.js';
import { profile, settings, puzzleSeen } from './store.js';
import { seeded, todayKey } from './util.js';

let openingsP = null, puzzlesP = null;
export function loadOpenings() {
  return (openingsP = openingsP || fetch('data/openings.json').then((r) => r.json()).catch(() => ({ list: [], epd: {} })));
}
export function loadPuzzles() {
  return (puzzlesP = puzzlesP || fetch('data/puzzles.json').then((r) => r.json()).catch(() => null));
}

// Senaste kända öppning i partiet (letar bakifrån).
export function openingOf(op, game) {
  if (!op || game.variant.id !== 'standard') return null;
  for (let i = Math.min(game.ply, 40); i >= 1; i--) {
    const idx = op.epd[game.epd(i)];
    if (idx !== undefined) { const [eco, name, ucis] = op.list[idx]; return { eco, name, ucis, ply: i }; }
  }
  return null;
}
export const openingFamily = (name) => (name || '').split(':')[0];

export const THEME_SV = {
  mix: ['Blandat', 'Lite av allt, anpassat efter din pusselrating.'],
  mateIn1: ['Matt i 1', 'Hitta draget som sätter matt direkt.'],
  mateIn2: ['Matt i 2', 'Två drag till matt.'],
  mateIn3: ['Matt i 3', 'Tre drag till matt.'],
  fork: ['Gaffel', 'En pjäs som angriper två på en gång.'],
  pin: ['Bindning', 'En pjäs som inte kan flytta utan att något bakom faller.'],
  skewer: ['Spett', 'Som en bindning, men den värdefulla pjäsen står först.'],
  discoveredAttack: ['Avtäckt angrepp', 'Flytta en pjäs och öppna en linje för en annan.'],
  doubleCheck: ['Dubbelschack', 'Schack från två pjäser samtidigt.'],
  hangingPiece: ['Hängande pjäs', 'Ta en oskyddad pjäs.'],
  backRankMate: ['Baslinjematt', 'Matt på bakre raden när kungen är instängd.'],
  smotheredMate: ['Kvävmatt', 'Springaren sätter matt mot en kung som är omringad av egna pjäser.'],
  sacrifice: ['Offer', 'Ge bort material för något bättre.'],
  deflection: ['Avledning', 'Lura bort en försvarare från sin uppgift.'],
  attraction: ['Lockning', 'Tvinga en pjäs till en dålig ruta.'],
  trappedPiece: ['Instängd pjäs', 'Fånga en pjäs som inte kan fly.'],
  promotion: ['Förvandling', 'Gör en bonde till dam.'],
  advancedPawn: ['Framskjuten bonde', 'En bonde nära förvandling avgör.'],
  kingsideAttack: ['Kungsangrepp', 'Anfall mot den rockerade kungen.'],
  exposedKing: ['Blottad kung', 'Utnyttja en kung utan skydd.'],
  quietMove: ['Tyst drag', 'Ett drag som varken slår eller ger schack men ändå vinner.'],
  defensiveMove: ['Försvarsdrag', 'Hitta draget som räddar ställningen.'],
  zugzwang: ['Dragtvång', 'Motståndaren förlorar för att den måste flytta.'],
  xRayAttack: ['Röntgen', 'En pjäs verkar genom en annan.'],
  interference: ['Avskärning', 'Ställ en pjäs mellan två motståndarpjäser.'],
  intermezzo: ['Mellandrag', 'Ett oväntat drag innan det självklara.'],
  clearance: ['Röjning', 'Flytta undan en pjäs så att en annan får plats.'],
  capturingDefender: ['Slå försvararen', 'Ta bort pjäsen som skyddar något viktigt.'],
  enPassant: ['En passant', 'Det speciella bondeslaget.'],
  opening: ['Öppning', 'Taktik tidigt i partiet.'],
  middlegame: ['Mittspel', 'Taktik i mittspelet.'],
  endgame: ['Slutspel', 'Avgör i slutspelet.'],
  rookEndgame: ['Tornslutspel', 'Torn och bönder.'],
  pawnEndgame: ['Bondeslutspel', 'Bara kungar och bönder.'],
  queenEndgame: ['Damslutspel', 'Dam mot dam.'],
  bishopEndgame: ['Löparslutspel', 'Löpare och bönder.'],
  knightEndgame: ['Springarslutspel', 'Springare och bönder.'],
  crushing: ['Krossande', 'Vinn avgörande material.'],
  equality: ['Utjämning', 'Rädda en sämre ställning.'],
  short: ['Kort', 'Två drag eller mindre.'],
  long: ['Långt', 'Tre drag.'],
  veryLong: ['Mycket långt', 'Fyra drag eller fler.'],
};
export const THEME_GROUPS = [
  ['Matt', ['mateIn1', 'mateIn2', 'mateIn3', 'backRankMate', 'smotheredMate', 'doubleCheck']],
  ['Taktik', ['fork', 'pin', 'skewer', 'discoveredAttack', 'hangingPiece', 'sacrifice', 'deflection', 'attraction', 'trappedPiece', 'capturingDefender', 'xRayAttack', 'interference', 'intermezzo', 'clearance']],
  ['Strategi', ['quietMove', 'defensiveMove', 'zugzwang', 'kingsideAttack', 'exposedKing', 'advancedPawn', 'promotion', 'enPassant']],
  ['Fas', ['opening', 'middlegame', 'endgame', 'rookEndgame', 'pawnEndgame', 'queenEndgame', 'bishopEndgame', 'knightEndgame']],
  ['Längd och mål', ['short', 'long', 'veryLong', 'crushing', 'equality']],
];
export const openingLabel = (key) => key.replace(/_/g, ' ').replace(/s Gambit/, "'s Gambit").replace(/Queens /, "Queen's ").replace(/Kings /, "King's ").replace(/Bishops /, "Bishop's ");

// Pussel i appens format: { id, fen, moves:[motståndarens drag, lösning...], rating, themes }
function fromPack(pack, i) {
  const p = pack.puzzles[i];
  return { id: p[0], fen: p[1], moves: p[2].split(' '), rating: p[3], themes: p[4].map((t) => pack.themes[t]), source: 'paket' };
}

export async function pickPuzzle(key = 'mix', opts = {}) {
  if (settings.puzzleOnline && navigator.onLine !== false && !opts.offline && !key.startsWith('op:')) {
    const p = await fetchLichessPuzzle(key, opts.target).catch(() => null);
    if (p) return p;
  }
  const pack = await loadPuzzles();
  if (!pack) return null;
  const ids = pack.index[key] || pack.index.mix;
  const target = opts.target ?? profile.puzzleRating + settings.puzzleDifficulty;
  let win = 120, cand = [];
  while (win < 2000) {
    cand = ids.filter((i) => Math.abs(pack.puzzles[i][3] - target) <= win && !puzzleSeen.has(pack.puzzles[i][0]));
    if (cand.length >= 3) break;
    win *= 1.8;
  }
  if (!cand.length) cand = ids;
  return fromPack(pack, cand[Math.floor(Math.random() * cand.length)]);
}

export async function dailyPuzzle() {
  const key = todayKey();
  if (navigator.onLine !== false) {
    const p = await fetchJson('https://lichess.org/api/puzzle/daily').then(lichessToPuzzle).catch(() => null);
    if (p) return { ...p, daily: key };
  }
  const pack = await loadPuzzles();
  if (!pack) return null;
  const rnd = seeded(key);
  const ids = pack.index.mix.filter((i) => pack.puzzles[i][3] >= 1300 && pack.puzzles[i][3] <= 2000);
  return { ...fromPack(pack, ids[Math.floor(rnd() * ids.length)]), daily: key };
}

function fetchJson(url, ms = 5000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return fetch(url, { signal: c.signal, headers: { Accept: 'application/json' } }).then((r) => { clearTimeout(t); if (!r.ok) throw new Error(r.status); return r.json(); });
}
async function fetchLichessPuzzle(theme, target) {
  const diff = settings.puzzleDifficulty <= -300 ? 'easier' : settings.puzzleDifficulty >= 300 ? 'harder' : 'normal';
  const angle = theme === 'mix' ? '' : '&angle=' + encodeURIComponent(theme);
  const p = lichessToPuzzle(await fetchJson('https://lichess.org/api/puzzle/next?difficulty=' + diff + angle));
  if (p && puzzleSeen.has(p.id)) return null;
  return p;
}
// Lichess API ger partiets drag och ply där pusslet börjar. Vi bygger samma format
// som paketet: ställningen före motståndarens sista drag.
export function lichessToPuzzle(d) {
  if (!d || !d.game || !d.puzzle) return null;
  const sans = d.game.pgn.split(/\s+/).filter(Boolean);
  const sol = d.puzzle.solution;
  for (const n of [d.puzzle.initialPly, d.puzzle.initialPly + 1, d.puzzle.initialPly - 1]) {
    if (n < 0 || n >= sans.length) continue;
    const g = new Game('standard');
    let ok = true;
    for (let i = 0; i < n; i++) if (!g.playSan(sans[i])) { ok = false; break; }
    if (!ok) continue;
    const fen = g.fen();
    const opp = g.playSan(sans[n]);
    if (!opp) continue;
    if (!g.parseUci(sol[0])) continue;
    return { id: d.puzzle.id, fen, moves: [opp.uci, ...sol], rating: d.puzzle.rating, themes: d.puzzle.themes || [], source: 'lichess', gameId: d.game.id };
  }
  return null;
}
