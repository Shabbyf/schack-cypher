// Schackregler via chessops (samma bibliotek som Lichess använder), med stöd för
// Lichess varianter. Game håller ett parti: startställning, drag och historik.
import { normalizeMove, castlingSide } from '../../vendor/chessops/chess';
import { setupPosition, defaultPosition } from '../../vendor/chessops/variant';
import { parseFen, makeFen } from '../../vendor/chessops/fen';
import { makeSan, parseSan } from '../../vendor/chessops/san';
import { parsePgn } from '../../vendor/chessops/pgn';
import { makeSquare, parseSquare, parseUci, makeUci, squareFile, squareRank } from '../../vendor/chessops/util';

export const VARIANTS = [
  { id: 'standard', rules: 'chess', name: 'Standard', icon: '♞', desc: 'Klassiskt schack mot Stockfish-botarna.', engine: 'sf' },
  { id: 'chess960', rules: 'chess', name: 'Chess960', icon: '⚄', desc: 'Slumpad bakre rad. 960 startställningar, inga inlästa öppningar.', engine: 'sf', c960: true },
  { id: 'crazyhouse', rules: 'crazyhouse', name: 'Crazyhouse', icon: '↺', desc: 'Pjäser du slår byter sida och kan sättas in på brädet igen.', engine: 'js' },
  { id: 'kingofthehill', rules: 'kingofthehill', name: 'King of the Hill', icon: '⛰', desc: 'Vinn genom att få in kungen på någon av de fyra mittrutorna.', engine: 'js' },
  { id: 'threecheck', rules: '3check', name: 'Tre schackar', icon: '③', desc: 'Den som ger schack tre gånger vinner.', engine: 'js' },
  { id: 'atomic', rules: 'atomic', name: 'Atomic', icon: '✹', desc: 'Varje slag exploderar och tar med sig alla grannpjäser utom bönder.', engine: 'js' },
  { id: 'antichess', rules: 'antichess', name: 'Antichess', icon: '⇄', desc: 'Slag är tvång. Bli av med alla dina pjäser för att vinna.', engine: 'js' },
  { id: 'horde', rules: 'horde', name: 'Horde', icon: '♙', desc: 'Vit har 36 bönder, svart en vanlig armé. Slå alla bönder eller sätt matt.', engine: 'js' },
  { id: 'racingkings', rules: 'racingkings', name: 'Racing Kings', icon: '⚑', desc: 'Först med kungen till åttonde raden. Schack är förbjudet.', engine: 'js' },
];
export const variantOf = (id) => VARIANTS.find((v) => v.id === id) || VARIANTS[0];

export const ROLE_SV = { pawn: 'bonde', knight: 'springare', bishop: 'löpare', rook: 'torn', queen: 'dam', king: 'kung' };
export const ROLE_CHAR = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' };
export const PIECE_VAL = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };
export const other = (c) => (c === 'white' ? 'black' : 'white');

// Chess960-ställning nummer n (0-959) enligt Scharnagls numrering. 518 är vanlig schack.
export function chess960Fen(n) {
  const row = Array(8).fill(null);
  const free = () => row.map((p, i) => (p ? -1 : i)).filter((i) => i >= 0);
  row[(n % 4) * 2 + 1] = 'b'; n = Math.floor(n / 4);
  row[(n % 4) * 2] = 'b'; n = Math.floor(n / 4);
  row[free()[n % 6]] = 'q'; n = Math.floor(n / 6);
  const KN = ['11000', '10100', '10010', '10001', '01100', '01010', '01001', '00110', '00101', '00011'][n];
  const f5 = free();
  KN.split('').forEach((c, i) => { if (c === '1') row[f5[i]] = 'n'; });
  const f3 = free();
  row[f3[0]] = 'r'; row[f3[1]] = 'k'; row[f3[2]] = 'r';
  const back = row.join('');
  return `${back}/pppppppp/8/8/8/8/PPPPPPPP/${back.toUpperCase()} w KQkq - 0 1`;
}

export function positionFromFen(rules, fen) {
  const setup = parseFen(fen).unwrap();
  return setupPosition(rules, setup).unwrap();
}

export class Game {
  constructor(variantId = 'standard', startFen = null, opts = {}) {
    this.variant = variantOf(variantId);
    if (!startFen) {
      if (this.variant.c960) {
        this.sp = opts.sp ?? Math.floor(Math.random() * 960);
        startFen = chess960Fen(this.sp);
      } else {
        startFen = makeFen(defaultPosition(this.variant.rules).toSetup());
      }
    }
    this.startFen = startFen;
    this.positions = [positionFromFen(this.variant.rules, startFen)];
    this.moves = [];
  }
  static fromRecord(r) {
    const g = new Game(r.variant || 'standard', r.startFen || null);
    if (r.moves) {
      for (const u of r.moves) if (!g.playUci(u)) break;
    } else if (r.pgn) g.loadSanList(sanListFromPgn(r.pgn));
    return g;
  }
  get pos() { return this.positions[this.positions.length - 1]; }
  get ply() { return this.moves.length; }
  get turn() { return this.pos.turn; }
  get c960() { return !!this.variant.c960; }
  fen(ply = this.ply) { return makeFen(this.positions[ply].toSetup()); }
  epd(ply = this.ply) { return makeFen(this.positions[ply].toSetup(), { epd: true }); }
  posAt(ply) { return this.positions[ply]; }
  clone() {
    const g = Object.create(Game.prototype);
    g.variant = this.variant; g.startFen = this.startFen; g.sp = this.sp;
    g.positions = this.positions.slice(); g.moves = this.moves.slice();
    return g;
  }

  // Alla lagliga mål från en ruta: [{to, moves:[chessops-drag]}]. Rockad nås både via
  // kungens slutruta och tornets ruta, som på Lichess.
  dests(pos = this.pos) {
    const out = new Map();
    const ctx = pos.ctx();
    for (const [from, set] of pos.allDests(ctx)) {
      const list = [];
      const add = (to, mv) => {
        let e = list.find((x) => x.to === to);
        if (!e) list.push((e = { to, moves: [] }));
        e.moves.push(mv);
      };
      const piece = pos.board.get(from);
      for (const to of set) {
        const target = pos.board.get(to);
        if (piece.role === 'king' && target && target.color === piece.color && target.role === 'rook') {
          // Rockad: kungen till g- eller c-linjen.
          const side = to > from ? 'h' : 'a';
          const kTo = (squareRank(from) << 3) + (side === 'h' ? 6 : 2);
          const mv = { from, to };
          add(makeSquare(to), mv);
          if (kTo !== from && !list.some((x) => x.to === makeSquare(kTo))) add(makeSquare(kTo), mv);
        } else if (piece.role === 'pawn' && (squareRank(to) === 7 || squareRank(to) === 0)) {
          for (const r of pos.rules === 'antichess' ? ['queen', 'rook', 'bishop', 'knight', 'king'] : ['queen', 'rook', 'bishop', 'knight']) add(makeSquare(to), { from, to, promotion: r });
        } else add(makeSquare(to), { from, to });
      }
      if (list.length) out.set(makeSquare(from), list);
    }
    return out;
  }
  dropDests(pos = this.pos) {
    if (pos.rules !== 'crazyhouse') return [];
    return Array.from(pos.dropDests()).map(makeSquare);
  }
  pocket(color, pos = this.pos) {
    if (!pos.pockets) return null;
    const p = pos.pockets[color];
    return ['pawn', 'knight', 'bishop', 'rook', 'queen'].map((r) => [r, p[r]]);
  }
  legalMoves(pos = this.pos) {
    const out = [];
    for (const [, list] of this.dests(pos)) for (const e of list) for (const m of e.moves) if (!out.some((x) => x.from === m.from && x.to === m.to && x.promotion === m.promotion)) out.push(m);
    if (pos.rules === 'crazyhouse') {
      const ds = this.dropDests(pos);
      for (const [r, n] of this.pocket(pos.turn, pos)) if (n) for (const s of ds) {
        if (r === 'pawn' && (s[1] === '1' || s[1] === '8')) continue;
        out.push({ role: r, to: parseSquare(s) });
      }
    }
    return out;
  }

  // Spelar ett lagligt chessops-drag och sparar ett drag-objekt med det UI:t behöver.
  play(move) {
    const pos = this.pos;
    move = normalizeMove(pos, move);
    if (!pos.isLegal(move)) return null;
    const color = pos.turn;
    const san = makeSan(pos, move);
    const before = pos.board.occupied.size();
    const next = pos.clone();
    next.play(move);
    const drop = 'role' in move;
    const castle = !drop && !!castlingSide(pos, move);
    let toVisual = makeSquare(move.to);
    if (castle) toVisual = makeSquare((squareRank(move.from) << 3) + (move.to > move.from ? 6 : 2));
    const rec = {
      uci: makeUci(move), san, color, castle, drop: drop ? move.role : null,
      from: drop ? null : makeSquare(move.from), to: toVisual, rawTo: makeSquare(move.to),
      promotion: move.promotion || null,
      captured: !drop && next.board.occupied.size() < before,
      piece: drop ? move.role : pos.board.get(move.from).role,
      check: next.isCheck(),
      move,
    };
    this.positions.push(next);
    this.moves.push(rec);
    return rec;
  }
  // UCI från motorn eller sparade partier. Tål både e1g1 och e1h1 för rockad.
  parseUci(uci, pos = this.pos) {
    const m = parseUci(uci);
    if (!m) return null;
    const n = normalizeMove(pos, m);
    return pos.isLegal(n) ? n : null;
  }
  playUci(uci) { const m = this.parseUci(uci); return m ? this.play(m) : null; }
  playSan(san) { const m = parseSan(this.pos, san); return m ? this.play(m) : null; }
  loadSanList(list) { for (const s of list) if (!this.playSan(s)) break; }
  undo() { if (!this.moves.length) return null; this.positions.pop(); return this.moves.pop(); }
  truncate(ply) { this.positions.length = ply + 1; this.moves.length = ply; }
  sanOf(uci, ply = this.ply) {
    const pos = this.positions[ply];
    const m = this.parseUci(uci, pos);
    return m ? makeSan(pos, m) : uci;
  }
  // UCI som Stockfish förstår. Utan Chess960-läge vill den ha e1g1 för rockad.
  engineUci(move, pos) {
    if (!this.c960 && !('role' in move) && castlingSide(pos, move)) {
      const kTo = (squareRank(move.from) << 3) + (move.to > move.from ? 6 : 2);
      return makeSquare(move.from) + makeSquare(kTo);
    }
    return makeUci(move);
  }
  uciToSquares(uci, ply = this.ply) {
    // Rutor att rita en pil mellan, med rockad som kungens faktiska slutruta.
    const pos = this.positions[ply];
    const m = this.parseUci(uci, pos);
    if (!m) return null;
    if ('role' in m) return { from: null, to: makeSquare(m.to) };
    let to = m.to;
    if (castlingSide(pos, m)) to = (squareRank(m.from) << 3) + (m.to > m.from ? 6 : 2);
    return { from: makeSquare(m.from), to: makeSquare(to) };
  }

  kingSquare(color, pos = this.pos) {
    const k = pos.board.kingOf(color);
    return k === undefined ? null : makeSquare(k);
  }
  pieceAt(sq, pos = this.pos) { return pos.board.get(parseSquare(sq)) || null; }
  // Spelets slut, med skäl. Remi via upprepning och 50-dragsregeln räknas också.
  outcome() {
    const pos = this.pos;
    const o = pos.outcome();
    if (o) {
      let reason = 'variant';
      if (pos.isCheckmate()) reason = 'checkmate';
      else if (pos.isVariantEnd()) reason = 'variant';
      else if (pos.isStalemate()) reason = 'stalemate';
      else if (pos.isInsufficientMaterial()) reason = 'insufficient';
      return { winner: o.winner || null, reason };
    }
    if (pos.halfmoves >= 100) return { winner: null, reason: 'fifty' };
    const key = this.epd();
    let n = 0;
    for (let i = this.ply; i >= 0; i -= 2) if (this.epd(i) === key) n++;
    if (n >= 3) return { winner: null, reason: 'repetition' };
    return null;
  }
  material() {
    // Materialskillnad som Lichess: vilka pjäser som "saknas" hos motståndaren, och poäng.
    const b = this.pos.board;
    const cnt = (c, r) => b.pieces(c, r).size();
    const diff = { white: [], black: [] };
    let score = 0;
    for (const r of ['queen', 'rook', 'bishop', 'knight', 'pawn']) {
      const d = cnt('white', r) - cnt('black', r);
      score += d * PIECE_VAL[r];
      if (d > 0) for (let i = 0; i < d; i++) diff.white.push(r);
      if (d < 0) for (let i = 0; i < -d; i++) diff.black.push(r);
    }
    return { diff, score };
  }
  pgn(headers = {}) {
    const h = { Event: 'Schack Cypher', Site: 'Schack Cypher', Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'), ...headers };
    if (this.variant.id !== 'standard') h.Variant = { chess960: 'Chess960', crazyhouse: 'Crazyhouse', kingofthehill: 'King of the Hill', threecheck: 'Three-check', atomic: 'Atomic', antichess: 'Antichess', horde: 'Horde', racingkings: 'Racing Kings' }[this.variant.id];
    const std = makeFen(defaultPosition(this.variant.rules).toSetup());
    if (this.startFen !== std) { h.FEN = this.startFen; h.SetUp = '1'; }
    let s = Object.entries(h).map(([k, v]) => `[${k} "${String(v).replace(/"/g, "'")}"]`).join('\n') + '\n\n';
    s += this.movetext() + ' ' + (h.Result || '*');
    return s + '\n';
  }
  movetext() {
    const start = this.positions[0];
    let n = start.fullmoves, out = [];
    this.moves.forEach((m, i) => {
      if (m.color === 'white') out.push(n + '. ' + m.san);
      else { out.push((i === 0 ? n + '... ' : '') + m.san); n++; }
    });
    return out.join(' ');
  }
}

export function sanListFromPgn(pgn) {
  try {
    const games = parsePgn(pgn);
    if (!games.length) return [];
    return Array.from(games[0].moves.mainline()).map((n) => n.san);
  } catch (e) {
    return pgn.replace(/\{[^}]*\}/g, '').replace(/\d+\.(\.\.)?/g, ' ').split(/\s+/).filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
  }
}

export const squareName = makeSquare;
export const squareIndex = parseSquare;
export { makeUci, squareFile, squareRank };
