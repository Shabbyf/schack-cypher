// Öppningsmisstag. När du gör ett tveksamt drag tidigt i ett parti sparas
// ställningen, ditt drag och motorns bästa drag. De repeteras sedan med växande
// intervall i Träning, och appen säger till direkt om du gör samma misstag igen.
import { lessons, saveLessons } from './store.js';
import { search } from './engine.js';
import { winPct } from './util.js';
import { loadOpenings, openingOf } from './data.js';

const DAY = 864e5;
export const OPENING_PLIES = 24;

export function sameMove(game, ply, a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const pos = game.posAt(ply);
  const ma = game.parseUci(a, pos), mb = game.parseUci(b, pos);
  return !!ma && !!mb && ma.from === mb.from && ma.to === mb.to && (ma.promotion || null) === (mb.promotion || null);
}

// evals[i] = { white, best } för ställning i. Sparar lektioner för spelarens tveksamma drag.
export async function addLessonsFromEvals(game, evals, color) {
  if (game.variant.id !== 'standard') return 0;
  const op = await loadOpenings();
  let n = 0;
  const end = Math.min(game.ply, OPENING_PLIES);
  for (let i = 0; i < end; i++) {
    const m = game.moves[i];
    if (m.color !== color || !evals[i] || !evals[i + 1] || !evals[i].best) continue;
    const sg = color === 'white' ? 1 : -1;
    const drop = winPct(sg * evals[i].white) - winPct(sg * evals[i + 1].white);
    if (drop < 10 || sameMove(game, i, evals[i].best, m.uci)) continue;
    const key = game.epd(i);
    const sub = game.clone(); sub.truncate(i);
    const o = openingOf(op, sub) || openingOf(op, (() => { const s = game.clone(); s.truncate(i + 1); return s; })());
    const prev = lessons[key];
    lessons[key] = {
      epd: key, fen: game.fen(i), color, played: m.uci, playedSan: m.san,
      best: evals[i].best, bestSan: game.sanOf(evals[i].best, i), drop: Math.round(drop),
      opening: o ? o.name : 'Öppningen', eco: o ? o.eco : '',
      created: prev ? prev.created : Date.now(), due: Date.now(), interval: 0, reps: prev ? prev.reps : 0,
      repeats: prev ? (prev.repeats || 0) + 1 : 0,
    };
    n++;
  }
  // Håll listan rimlig: släng de äldsta som redan sitter.
  const keys = Object.keys(lessons);
  if (keys.length > 200) keys.sort((a, b) => lessons[a].created - lessons[b].created).slice(0, keys.length - 200).forEach((k) => delete lessons[k]);
  saveLessons();
  return n;
}

// Snabb genomgång av öppningsfasen efter ett parti (bara vanligt schack).
export async function scanOpening(game, color, isCurrent = () => true) {
  if (game.variant.id !== 'standard') return 0;
  const evals = [];
  const end = Math.min(game.ply, OPENING_PLIES);
  for (let i = 0; i <= end; i++) {
    if (!isCurrent()) return 0;
    const pos = game.posAt(i);
    if (pos.isEnd()) { evals[i] = { white: pos.isCheckmate() ? (pos.turn === 'white' ? -10000 : 10000) : 0, best: null }; continue; }
    const r = await search(game, i, { depth: 12, movetime: 250 });
    const cp = r.lines[0] ? r.lines[0].cp : 0;
    evals[i] = { white: pos.turn === 'white' ? cp : -cp, best: r.best };
  }
  return addLessonsFromEvals(game, evals, color);
}

export function lessonFor(epd) { return lessons[epd] || null; }
export function dueLessons(now = Date.now()) {
  return Object.values(lessons).filter((l) => l.due <= now).sort((a, b) => a.due - b.due);
}
export function allLessons() { return Object.values(lessons).sort((a, b) => a.due - b.due); }
export function gradeLesson(epd, ok) {
  const l = lessons[epd];
  if (!l) return;
  if (ok) { l.interval = l.interval ? Math.min(l.interval * 2.5, 60) : 1; l.reps++; }
  else l.interval = 0;
  l.due = Date.now() + (l.interval ? l.interval * DAY : 10 * 60 * 1000);
  saveLessons();
}
export function markRepeated(epd) {
  const l = lessons[epd];
  if (!l) return;
  l.repeats = (l.repeats || 0) + 1; l.interval = 0; l.due = Date.now();
  saveLessons();
}
