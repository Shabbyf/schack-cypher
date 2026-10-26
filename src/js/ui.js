// Delade UI-delar: sidbyten, brädvyn och dess sidopanel, värderingsstapel,
// pratbubblor, modaler och notiser.
import { $, qsa, winPct, fmtEval, esc } from './util.js';
import { Board } from './board.js';
import { profile, settings } from './store.js';
import { SF } from './engine.js';
import { speak } from './audio.js';

export const ui = { board: null, mode: null, page: 'home', pages: {} };

export function registerPage(name, render) { ui.pages[name] = render; }

export function initBoard(handlers) {
  ui.board = new Board($('board'), handlers);
}

export function showPage(name, arg) {
  if (ui.mode) { const m = ui.mode; ui.mode = null; m.leave && m.leave(); }
  ui.page = name;
  $('boardView').hidden = true;
  const page = $('page');
  page.hidden = false;
  page.className = 'page page-' + name;
  qsa('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.go === name || (name === 'puzzleHub' && b.dataset.go === 'puzzles')));
  (ui.pages[name] || ui.pages.home)(page, arg);
  window.scrollTo(0, 0);
  updateChips();
}

export function showBoard(mode) {
  if (ui.mode && ui.mode !== mode) { const m = ui.mode; m.leave && m.leave(); }
  ui.mode = mode;
  $('page').hidden = true;
  $('boardView').hidden = false;
  $('boardView').className = 'bv bv-' + (mode.kind || 'play');
  qsa('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.go === mode.tab));
  ui.board.hideOverlay();
  ui.board.arrows([]);
  window.scrollTo(0, 0);
  mode.enter();
  updateChips();
}

export const side = () => $('side');

export function setEval(white) {
  const bar = $('boardView').querySelector('.bv-eval');
  if (white === null || white === undefined) { bar.classList.add('off'); return; }
  bar.classList.remove('off');
  const pct = winPct(white);
  // Stapeln visar vits andel från brädets nederkant när vit står nere.
  $('evFill').style.height = (ui.board.orientation === 'white' ? pct : 100 - pct) + '%';
  $('evFill').classList.toggle('blk', ui.board.orientation === 'black');
  $('evNum').textContent = fmtEval(white);
}

export function setStatus(t, cls = '') { const s = $('status'); s.textContent = t || ''; s.className = 'status ' + cls; }

export function setStrips(top, bottom) {
  $('stripTop').innerHTML = top && top.__raw !== undefined ? top.__raw : top || '';
  $('stripBottom').innerHTML = bottom && bottom.__raw !== undefined ? bottom.__raw : bottom || '';
}

export function say(el, text, voice) {
  if (!el) return;
  el.textContent = text;
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  if (voice) speak(text, voice);
}

let toastT = null;
export function toast(text, ms = 3200) {
  const t = $('toast');
  t.textContent = text; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), ms);
}

export function modal(html, opts = {}) {
  const m = $('modal'), card = m.querySelector('.modal-card');
  card.innerHTML = html && html.__raw !== undefined ? html.__raw : html;
  card.className = 'modal-card ' + (opts.cls || '');
  m.hidden = false;
  m.onclick = (e) => { if (e.target === m) closeModal(); };
  const f = card.querySelector('[autofocus],button');
  if (f) f.focus();
  return card;
}
export function closeModal() { const m = $('modal'); if (m.hidden) return false; m.hidden = true; m.querySelector('.modal-card').innerHTML = ''; return true; }
export const modalOpen = () => !$('modal').hidden;

export function updateChips() {
  $('chipRating').textContent = '♟ ' + profile.rating + (profile.ratedGames < 10 ? '?' : '');
  $('chipPuzzle').textContent = '✦ ' + profile.puzzleRating;
  const c = $('engChip');
  const st = SF.info.status;
  c.textContent = st === 'ok' ? 'Stockfish 17.1' : st === 'failed' ? 'Reservmotor' : 'Laddar Stockfish…';
  c.className = 'chip ' + (st === 'ok' ? 'ok' : st === 'failed' ? 'warn' : '');
  c.title = st === 'failed' ? (SF.info.error || '') + ' Klicka för detaljer.' : 'Motorstatus';
}

export function playerStrip({ name, sub, badge, color, mono, material, active, right }) {
  return `<div class="pl${active ? ' active' : ''}">${badge ? `<span class="badge sm" style="background:${esc(color)}">${esc(mono)}</span>` : ''}<span class="pl-name"><b>${esc(name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="mat">${material || ''}</span>${right ? `<span class="pl-right">${right}</span>` : ''}</div>`;
}

export function confetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = $('fx'), ctx = cv.getContext('2d');
  const W = (cv.width = innerWidth * devicePixelRatio), H = (cv.height = innerHeight * devicePixelRatio);
  const cs = getComputedStyle(document.documentElement);
  const cols = [cs.getPropertyValue('--gold'), cs.getPropertyValue('--hot'), '#5fc8e8', '#8fd16f'];
  const ps = Array.from({ length: 160 }, () => ({ x: Math.random() * W, y: -Math.random() * H * 0.5, vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 5, s: 6 + Math.random() * 10, r: Math.random() * 6, c: cols[Math.floor(Math.random() * 4)] }));
  const t0 = performance.now();
  (function f(t) {
    ctx.clearRect(0, 0, W, H);
    ps.forEach((p) => { p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.r += 0.1; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); });
    if (t - t0 < 3200) requestAnimationFrame(f); else ctx.clearRect(0, 0, W, H);
  })(t0);
}

export function banner(html, onClick) {
  const b = $('banner');
  if (!html) { b.hidden = true; b.innerHTML = ''; return; }
  b.innerHTML = html; b.hidden = false;
  b.querySelectorAll('button').forEach((x) => x.addEventListener('click', () => onClick && onClick(x.dataset.act)));
}
export { settings };
