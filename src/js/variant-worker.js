// Enkel alfa-beta-motor för Lichess-varianterna (och reserv för vanligt schack om
// Stockfish inte laddas). Regler och draggenerering kommer från chessops.
import { parseFen } from '../../vendor/chessops/fen';
import { setupPosition } from '../../vendor/chessops/variant';
import { makeUci } from '../../vendor/chessops/util';

const VAL = { pawn: 100, knight: 310, bishop: 325, rook: 500, queen: 900, king: 0 };
const ROLES = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
const PROMO = ['queen', 'knight', 'rook', 'bishop'];
const MATE = 100000;
let stopFlag = false;

function centerDist(sq) {
  const f = sq & 7, r = sq >> 3;
  return Math.max(Math.min(Math.abs(f - 3), Math.abs(f - 4)), Math.min(Math.abs(r - 3), Math.abs(r - 4)));
}

function genMoves(pos, ctx) {
  const out = [];
  for (const [from, set] of pos.allDests(ctx)) {
    const p = pos.board.get(from);
    for (const to of set) {
      if (p.role === 'pawn' && ((to >> 3) === 7 || (to >> 3) === 0)) {
        for (const r of pos.rules === 'antichess' ? [...PROMO, 'king'] : PROMO) out.push({ from, to, promotion: r });
      } else out.push({ from, to });
    }
  }
  if (pos.rules === 'crazyhouse' && pos.pockets) {
    const pocket = pos.pockets[pos.turn];
    const drops = pos.dropDests(ctx);
    for (const r of ['queen', 'rook', 'bishop', 'knight', 'pawn']) {
      if (!pocket[r]) continue;
      for (const to of drops) {
        if (r === 'pawn' && ((to >> 3) === 0 || (to >> 3) === 7)) continue;
        out.push({ role: r, to });
      }
    }
  }
  return out;
}

function isCapture(pos, m) {
  if ('role' in m) return false;
  const t = pos.board.get(m.to);
  if (t && t.color !== pos.turn) return true;
  const p = pos.board.get(m.from);
  return p.role === 'pawn' && (m.from & 7) !== (m.to & 7) && !t;
}
function orderScore(pos, m) {
  if ('role' in m) return 50 + VAL[m.role] / 20;
  let s = 0;
  const t = pos.board.get(m.to);
  if (t && t.color !== pos.turn) s += 1000 + VAL[t.role] - VAL[pos.board.get(m.from).role] / 10;
  if (m.promotion) s += 800 + VAL[m.promotion] / 10;
  return s;
}

// Värdering från den drag-havandes perspektiv.
function evaluate(pos) {
  const us = pos.turn, them = us === 'white' ? 'black' : 'white';
  const b = pos.board;
  let s = 0;
  const side = (c) => {
    let v = 0;
    for (const r of ROLES) v += b.pieces(c, r).size() * VAL[r];
    if (pos.pockets) for (const r of ROLES) v += (pos.pockets[c][r] || 0) * VAL[r] * 0.9;
    // lite centralisering för springare och bönder
    for (const sq of b.pieces(c, 'knight')) v += (3 - centerDist(sq)) * 8;
    for (const sq of b.pieces(c, 'pawn')) v += (c === 'white' ? sq >> 3 : 7 - (sq >> 3)) * (pos.rules === 'horde' ? 9 : 3);
    return v;
  };
  if (pos.rules === 'antichess') {
    const cnt = (c) => b[c].size();
    return (cnt(them) - cnt(us)) * 120 + (Math.random() * 6 - 3);
  }
  s = side(us) - side(them);
  if (pos.rules === 'kingofthehill') {
    const k1 = b.kingOf(us), k2 = b.kingOf(them);
    if (k1 !== undefined) s += (3 - centerDist(k1)) * 90;
    if (k2 !== undefined) s -= (3 - centerDist(k2)) * 90;
  } else if (pos.rules === '3check' && pos.remainingChecks) {
    const done = (c) => 3 - pos.remainingChecks[c];
    s += (done(us) ** 2 - done(them) ** 2) * 160;
  } else if (pos.rules === 'racingkings') {
    const k1 = b.kingOf(us), k2 = b.kingOf(them);
    if (k1 !== undefined) s += (k1 >> 3) * 140;
    if (k2 !== undefined) s -= (k2 >> 3) * 140;
  } else if (pos.rules === 'crazyhouse') {
    // kungssäkerhet: egna pjäser runt kungen
    const ks = (c) => { const k = b.kingOf(c); if (k === undefined) return 0; let n = 0; for (let d of [-9, -8, -7, -1, 1, 7, 8, 9]) { const q = k + d; if (q >= 0 && q < 64 && Math.abs((q & 7) - (k & 7)) <= 1 && b[c].has(q)) n++; } return n; };
    s += (ks(us) - ks(them)) * 25;
  }
  return s;
}

let nodes = 0, deadline = 0, aborted = false;
function terminal(pos, ply, ctx) {
  const o = pos.outcome(ctx);
  if (!o) return null;
  if (!o.winner) return 0;
  return o.winner === pos.turn ? MATE - ply : -MATE + ply;
}

function quiesce(pos, alpha, beta, ply, qd) {
  if ((++nodes & 511) === 0 && (performance.now() > deadline || stopFlag)) aborted = true;
  if (aborted) return 0;
  const ctx = pos.ctx();
  if (pos.isVariantEnd()) return terminal(pos, ply, ctx) ?? 0;
  const stand = evaluate(pos);
  if (qd <= 0) return stand;
  const moves = genMoves(pos, ctx);
  if (!moves.length) return terminal(pos, ply, ctx) ?? 0;
  if (stand >= beta && pos.rules !== 'antichess') return beta;
  if (stand > alpha) alpha = stand;
  const caps = moves.filter((m) => isCapture(pos, m) || m.promotion).sort((a, b) => orderScore(pos, b) - orderScore(pos, a));
  for (const m of caps) {
    const p = pos.clone(); p.play(m);
    const v = -quiesce(p, -beta, -alpha, ply + 1, qd - 1);
    if (aborted) return 0;
    if (v >= beta) return beta;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

function negamax(pos, depth, alpha, beta, ply) {
  if ((++nodes & 511) === 0 && (performance.now() > deadline || stopFlag)) aborted = true;
  if (aborted) return 0;
  const ctx = pos.ctx();
  if (pos.isVariantEnd()) return terminal(pos, ply, ctx) ?? 0;
  const moves = genMoves(pos, ctx);
  if (!moves.length) return terminal(pos, ply, ctx) ?? 0;
  if (depth <= 0) return quiesce(pos, alpha, beta, ply, 4);
  moves.sort((a, b) => orderScore(pos, b) - orderScore(pos, a));
  let best = -Infinity;
  for (const m of moves) {
    const p = pos.clone(); p.play(m);
    const v = -negamax(p, depth - 1, -beta, -alpha, ply + 1);
    if (aborted) return 0;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

function searchRoot(pos, maxDepth, movetime) {
  nodes = 0; aborted = false; stopFlag = false;
  deadline = performance.now() + movetime;
  const ctx = pos.ctx();
  const moves = genMoves(pos, ctx);
  if (!moves.length) return { lines: [], best: null, depth: 0 };
  let scored = moves.map((m) => ({ m, s: orderScore(pos, m) }));
  let done = null, depthDone = 0;
  for (let d = 1; d <= maxDepth; d++) {
    scored.sort((a, b) => b.s - a.s);
    const res = [];
    let bestS = -Infinity;
    for (const x of scored) {
      const p = pos.clone(); p.play(x.m);
      // Fönster under bästa hittills så att närliggande alternativ får rätt värde.
      const alpha = bestS === -Infinity ? -Infinity : bestS - 400;
      const v = -negamax(p, d - 1, -Infinity, alpha === -Infinity ? Infinity : -alpha, 1);
      if (aborted) break;
      res.push({ m: x.m, s: v });
      if (v > bestS) bestS = v;
    }
    if (aborted && res.length < scored.length) break;
    scored = res; done = res.slice(); depthDone = d;
    if (Math.abs(bestS) > MATE - 100) break;
  }
  if (!done) done = scored;
  done.sort((a, b) => b.s - a.s);
  const lines = done.map((x) => ({ uci: makeUci(x.m), score: Math.round(Math.max(-10000, Math.min(10000, Math.abs(x.s) > MATE - 1000 ? Math.sign(x.s) * (10000 - (MATE - Math.abs(x.s)) * 10) : x.s))) }));
  return { lines, best: lines[0] ? lines[0].uci : null, depth: depthDone, nodes };
}

self.onmessage = (e) => {
  const d = e.data;
  if (d.stop) { stopFlag = true; return; }
  let result;
  try {
    const pos = setupPosition(d.rules, parseFen(d.fen).unwrap()).unwrap();
    result = searchRoot(pos, d.depth, d.movetime);
  } catch (err) {
    result = { lines: [], best: null, depth: 0, error: String(err) };
  }
  self.postMessage({ id: d.id, ...result });
};
