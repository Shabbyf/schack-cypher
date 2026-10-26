// Botarna: personligheter ovanpå riktiga motorvärderingar. Varje bot tar fram flera
// kandidatdrag (MultiPV), väljer bland dem som ligger inom sitt "fönster" och viktar
// valet efter sin stil, t.ex. gafflar, schackar eller tidig rockad.
import { search } from './engine.js';
import { attacks } from '../../vendor/chessops/attacks';
import { parseSquare } from '../../vendor/chessops/util';
import { pick } from './util.js';

export const BOTS = [
  { id: 'bonde', name: "Lil' Bonde", mono: 'LB', elo: 400, color: '#8fd16f', style: 'Spelar på känsla', voice: { pitch: 1.5, rate: 1.1 },
    mpv: 10, depth: 2, time: 150, window: 800, temp: 260, blunder: 0.28, bias: {},
    lines: { intro: ['Yo! Jag är bara en bonde, men jag drömmer om att bli dam.', 'Första dagen på brädet. Kör lugnt, eller inte.'],
      botCapture: ['Haha, tog den! Visste inte ens att jag kunde.', 'Snodde en pjäs. Det är min första hit.'],
      playerCapture: ['Aj, det var min favoritpjäs.', 'Lugnt, jag har fler. Tror jag.'],
      check: ['Schack! Sa jag det rätt?'], botWin: ['Vänta... vann JAG? Ring mamma!'],
      playerWin: ['GG, du är för fräsch för mig.', 'Du vann. Jag går och övar i källaren.'] } },
  { id: 'springare', name: 'Yung Springare', mono: 'YS', elo: 600, color: '#7fd6c2', style: 'Hoppar runt överallt', voice: { pitch: 1.35, rate: 1.2 },
    mpv: 10, depth: 3, time: 200, window: 500, temp: 160, blunder: 0.14, bias: { knight: 110 },
    lines: { intro: ['Yung Springare! Jag rör mig i L, som i Legend.', 'Hopp hopp. Försök hänga med.'],
      botCapture: ['Hopp, och borta! Ingen såg det komma.', 'L-formen slår till igen.'],
      playerCapture: ['Ey! Jag hoppade rakt in där, va?', 'Okej, okej. Nästa hopp blir bättre.'],
      check: ['Schack! Från ett hörn du inte kollade.'], botWin: ['Hoppade hela vägen till matt.'],
      playerWin: ['Du stängde alla mina rutor. Snyggt.'] } },
  { id: 'rockad', name: 'DJ Rockad', mono: 'DJ', elo: 850, color: '#5fc8e8', style: 'Kungen i säkerhet först', voice: { pitch: 0.9, rate: 1.05 },
    mpv: 8, depth: 4, time: 250, window: 320, temp: 110, blunder: 0.08, bias: { castle: 260, kingWalk: 60 },
    lines: { intro: ['DJ Rockad på decksen. Kungen i säkerhet innan beatet droppar.', 'Rockad först, frågor sen.'],
      botCapture: ['Scratchade bort den från skivan.', 'Samplad och borttagen.'],
      playerCapture: ['Okej, det där var en ren mix. Respekt.', 'Du hoppade över en takt där. Snyggt.'],
      check: ['Schack! Höj volymen.'], botWin: ['Mixen är klar. Matt på första takten.'],
      playerWin: ['Du tog över decksen. Fett set.'] } },
  { id: 'greta', name: 'Graffiti-Greta', mono: 'GG', elo: 1050, color: '#ff8fb1', style: 'Taggar allt: schack och slag', voice: { pitch: 1.25, rate: 1.1 },
    mpv: 8, depth: 5, time: 300, window: 230, temp: 80, blunder: 0.05, bias: { check: 80, capture: 55 },
    lines: { intro: ['Graffiti-Greta. Jag taggar varenda ruta på det här brädet.', 'Sprayburken är laddad. Var ska jag börja?'],
      botCapture: ['Taggad och överspreyad.', 'Den pjäsen hade min signatur på sig.'],
      playerCapture: ['Du sanerade min vägg. Inte okej.', 'Okej, du har också en burk.'],
      check: ['Schack! Står på din kung i neon.'], botWin: ['Matt. Signerat längst ner i hörnet.'],
      playerWin: ['Du målade över hela min piece. Respekt.'] } },
  { id: 'gaffel', name: 'MC Gaffel', mono: 'MC', elo: 1250, color: '#f2994a', style: 'Gafflar som bars', voice: { pitch: 0.95, rate: 1.15 },
    mpv: 8, depth: 6, time: 350, window: 170, temp: 60, blunder: 0.03, bias: { fork: 110, knight: 30 },
    lines: { intro: ['MC Gaffel i cyphern. Två hot med en pjäs, det är min flow.', 'Jag droppar gafflar som andra droppar bars.'],
      botCapture: ['Gaffel-flow. Två hot, en träff.', 'Den låg öppen som en mic på open stage.'],
      playerCapture: ['Du har bars, jag ger dig det.', 'Okej, den satt. Men versen är inte slut.'],
      check: ["Schack. Rimmar på 'du är back'."], botWin: ['Mic drop. Matt.'],
      playerWin: ['Din flow var tightare idag. Rematch?'] } },
  { id: 'bonan', name: 'Bönan Beatz', mono: 'BB', elo: 1400, color: '#c3e86b', style: 'Trycker fram bönderna', voice: { pitch: 0.8, rate: 1.0 },
    mpv: 6, depth: 7, time: 400, window: 120, temp: 45, blunder: 0.015, bias: { pawn: 50 },
    lines: { intro: ['Bönan Beatz. Bönderna är min rytmsektion.', 'Bom, tchak, bonde fram. Bom, tchak, bonde fram.'],
      botCapture: ['Bonderytmen tar allt i sin väg.', 'Ett steg i taget, som ett riktigt beat.'],
      playerCapture: ['Du bröt min takt. Irriterande.', 'Den bonden var mitt bästa sampel.'],
      check: ['Schack på offbeaten.'], botWin: ['Bönderna marscherade hela vägen. Matt.'],
      playerWin: ['Du stoppade marschen. Bra lyssnat.'] } },
  { id: 'lopare', name: 'Big Löpare', mono: 'BL', elo: 1600, color: '#b58cf0', style: 'Långa diagonaler', voice: { pitch: 0.7, rate: 0.95 },
    mpv: 6, depth: 9, time: 500, window: 90, temp: 35, blunder: 0, bias: { bishop: 45 },
    lines: { intro: ['Big Löpare. Jag går diagonalt genom hela kvarteret.', 'Löparparet och jag, vi rullar tillsammans.'],
      botCapture: ['Långa diagonaler, korta förklaringar.', 'Den stod på min linje. Synd.'],
      playerCapture: ['Den kostade dig tempo. Vi får se.', 'Fint. Men jag har längre räckvidd.'],
      check: ['Schack från andra sidan stan.'], botWin: ['Löparparet levererar. Varje gång.'],
      playerWin: ['Du läste diagonalerna bättre än jag. Stor respekt.'] } },
  { id: 'tyra', name: 'Tornet Tyra', mono: 'TT', elo: 1800, color: '#ffb86b', style: 'Byter ner och tar slutspelet', voice: { pitch: 1.1, rate: 0.95 },
    mpv: 5, depth: 11, time: 600, window: 60, temp: 25, blunder: 0, bias: { trade: 50, rook: 25 },
    lines: { intro: ['Tornet Tyra. Vi byter ner till slutspelet, där bor jag.', 'Ju färre pjäser, desto mer min låt.'],
      botCapture: ['Byte. Ett steg närmare mitt slutspel.', 'Rensat. Nu hörs basen bättre.'],
      playerCapture: ['Ta dem. Jag vill ändå ha det tomt på brädet.', 'Okej. Det förenklar för mig också.'],
      check: ['Schack längs linjen.'], botWin: ['Slutspel är matematik. Matt.'],
      playerWin: ['Du höll emot i slutspelet. Det gör inte många.'] } },
  { id: 'gabbe', name: 'Gambit-Gabbe', mono: 'G!', elo: 2000, color: '#ff6f61', style: 'Går på kungen direkt', voice: { pitch: 1.0, rate: 1.25 },
    mpv: 5, depth: 12, time: 700, window: 70, temp: 25, blunder: 0, bias: { king: 45, check: 40 },
    lines: { intro: ['Gambit-Gabbe. Material är för folk som inte vågar.', 'Jag offrar, du svettas. Deal?'],
      botCapture: ['Initiativet betalar sig alltid.', 'Tog tillbaka med ränta.'],
      playerCapture: ['Ta den. Jag tar din kung istället.', 'Offer accepterat. Nu kör vi.'],
      check: ['Schack! Kungen har inga kompisar kvar.'], botWin: ['Attacken satt. Matt.'],
      playerWin: ['Du överlevde stormen. Starkt försvar.'] } },
  { id: 'drottning', name: 'Drottning Q', mono: 'DQ', elo: 2200, color: '#e0a3ff', style: 'Damen styr showen', voice: { pitch: 1.2, rate: 0.9 },
    mpv: 4, depth: 14, time: 900, window: 35, temp: 15, blunder: 0, bias: { queen: 30 },
    lines: { intro: ['Drottning Q. Det här är min scen, du är förbandet.', 'Damen äger brädet. Alltid har gjort.'],
      botCapture: ['Damen tar vad damen vill.', 'Krona på, pjäs av.'],
      playerCapture: ['Ett pris för att få stå på samma scen som mig.', 'Kul. Fortsätt försöka.'],
      check: ['Schack. Bocka för drottningen.'], botWin: ['Showen är slut. Matt.'],
      playerWin: ['Du tog showen ifrån mig. Det glömmer jag inte.'] } },
  { id: 'kung', name: 'Kung Matt', mono: 'KM', elo: 2500, color: '#f2c94c', style: 'Full Stockfish. Försvarar titeln', voice: { pitch: 0.6, rate: 0.85 },
    mpv: 1, depth: 24, time: 1500, window: 0, temp: 0, blunder: 0, bias: {},
    lines: { intro: ['Kung Matt. Kronan har jag redan. Jag är här för att försvara den.', 'Utmanare? Sätt dig. Det här tar inte lång tid.'],
      botCapture: ['Skatten är betald. Till mig.', 'Kronan tar sin del.'],
      playerCapture: ['Du tror att det gör ont? Det är kalkylerat.', 'Ett offer. Tydligen ditt problem, inte mitt.'],
      check: ['Schack. Kronan vinkar hej.'], botWin: ['Tronen står kvar. Nästa utmanare, tack.'],
      playerWin: ['...Ingen har gjort så på länge. Kronan är din. För idag.'] } },
];
export const TIERS = [['Rookie', 999], ['Mixtape', 1499], ['Headliner', 2099], ['Legend', 99999]];
export const tierOf = (elo) => TIERS[TIERS.findIndex((t) => elo <= t[1])][0];
export const DRAW_LINES = ['Remi. Ingen tar hem bältet idag.', 'Oavgjort. Vi möts i nästa cypher.'];
export const THINK = ['Funderar på bars…', 'Letar efter beatet…', 'Räknar varianter…'];

// "MC Spegel" spelar alltid på din egen nivå. Parametrarna vägs mellan de två
// botar som ligger närmast din rating.
export function mirrorBot(rating) {
  const elo = Math.max(400, Math.min(2500, Math.round(rating)));
  let i = BOTS.findIndex((b) => b.elo >= elo);
  if (i <= 0) i = 1;
  const a = BOTS[i - 1], b = BOTS[i], t = (elo - a.elo) / (b.elo - a.elo || 1);
  const mix = (k) => a[k] + (b[k] - a[k]) * t;
  return {
    id: 'spegel', name: 'MC Spegel', mono: 'MS', elo, color: '#9ad0ff', style: 'Spelar alltid på din nivå', voice: { pitch: 1.0, rate: 1.05 },
    mpv: Math.round(mix('mpv')), depth: Math.round(mix('depth')), time: Math.round(mix('time')), window: mix('window'), temp: mix('temp'), blunder: mix('blunder'), bias: {},
    lines: { intro: ['MC Spegel. Jag är exakt lika bra som du. Ingen ursäkt idag.', 'Du mot dig själv. Vem vinner?'],
      botCapture: ['Spegelbild. Du hade gjort samma sak.', 'Det där lärde jag mig av dig.'],
      playerCapture: ['Okej, du är ett snäpp vassare än mig just nu.', 'Den såg jag inte. Konstigt, jag är ju du.'],
      check: ['Schack. Känner du igen dig?'], botWin: ['Spegeln vann. Nästa gång blir jag svårare, om du blir bättre.'],
      playerWin: ['Du växte ur spegeln. Din rating går upp.'] },
  };
}
export const botById = (id, rating = 1000) => (id === 'spegel' ? mirrorBot(rating) : BOTS.find((b) => b.id === id) || BOTS[4]);

// Egenskaper hos ett drag som stilarna bryr sig om.
function feats(game, uci) {
  const g = game.clone();
  const rec = g.playUci(uci);
  if (!rec) return null;
  const pos = g.pos;
  const f = { piece: rec.piece, capture: rec.captured, check: rec.check, castle: rec.castle, forks: 0, nearKing: false, trade: false };
  if (rec.captured && rec.from) {
    const before = game.pos.board.get(parseSquare(rec.rawTo));
    if (before) f.trade = before.role !== 'pawn' && valOf(before.role) >= valOf(rec.piece) - 0.4;
  }
  const to = parseSquare(rec.to);
  const piece = pos.board.get(to);
  if (piece) {
    const enemy = pos.board[piece.color === 'white' ? 'black' : 'white'];
    const targets = attacks(piece, to, pos.board.occupied).intersect(enemy).diff(pos.board.pawn);
    f.forks = targets.size();
    const ek = pos.board.kingOf(piece.color === 'white' ? 'black' : 'white');
    if (ek !== undefined && rec.piece !== 'king') f.nearKing = Math.max(Math.abs((ek & 7) - (to & 7)), Math.abs((ek >> 3) - (to >> 3))) <= 2;
  }
  return f;
}
const valOf = (r) => ({ pawn: 1, knight: 3.2, bishop: 3.3, rook: 5, queen: 9, king: 0 }[r]);
function styleBonus(b, f) {
  const x = b.bias || {};
  let s = 0;
  if (x.knight && f.piece === 'knight') s += x.knight;
  if (x.bishop && f.piece === 'bishop') s += x.bishop;
  if (x.queen && f.piece === 'queen') s += x.queen;
  if (x.rook && f.piece === 'rook') s += x.rook;
  if (x.pawn && f.piece === 'pawn') s += x.pawn;
  if (x.castle && f.castle) s += x.castle;
  if (x.kingWalk && f.piece === 'king' && !f.castle) s -= x.kingWalk;
  if (x.check && f.check) s += x.check;
  if (x.capture && f.capture) s += x.capture;
  if (x.fork && f.forks >= 2) s += x.fork * (f.forks - 1);
  if (x.trade && f.trade) s += x.trade;
  if (x.king && f.nearKing) s += x.king;
  return s;
}

// Väljer ett drag. Returnerar { uci, white } där white är värderingen från vits sida.
export async function chooseMove(game, bot) {
  const ply = game.ply;
  const jsDepth = bot.elo < 700 ? 1 : bot.elo < 1100 ? 2 : bot.elo < 1700 ? 3 : 4;
  const res = await search(game, ply, { multipv: bot.mpv, depth: bot.depth, movetime: bot.time, jsDepth });
  const legal = game.legalMoves();
  const sign = game.turn === 'white' ? 1 : -1;
  if (!res.lines.length) return { uci: res.best || null, white: null, engine: res.engine };
  // JS-motorn returnerar alla drag; begränsa till lika många kandidater som Stockfish skulle ge.
  const lines = res.engine === 'js' ? res.lines.slice(0, Math.max(bot.mpv, 1)) : res.lines;
  const best = lines[0].cp;
  const white = sign * best;
  if (Math.random() < bot.blunder) {
    const m = pick(legal);
    return { uci: null, move: m, white, engine: res.engine };
  }
  let c = lines.filter((l) => l.uci && l.cp >= best - bot.window).map((l) => ({ ...l }));
  for (const x of c) { const f = feats(game, x.uci); x.ok = !!f; x.adj = x.cp + (f ? styleBonus(bot, f) : 0); }
  c = c.filter((x) => x.ok);
  if (!c.length) return { uci: res.best, white, engine: res.engine };
  const mx = Math.max(...c.map((x) => x.adj));
  if (!bot.temp) return { uci: c.find((x) => x.adj === mx).uci, white, engine: res.engine };
  const ws = c.map((x) => Math.exp((x.adj - mx) / bot.temp));
  let r = Math.random() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < c.length; i++) { r -= ws[i]; if (r <= 0) return { uci: c[i].uci, white, engine: res.engine }; }
  return { uci: c[0].uci, white, engine: res.engine };
}
