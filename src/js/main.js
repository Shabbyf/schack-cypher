// Startpunkt: kopplar ihop menyer, sidor, brädet, TV-fjärren och uppdateringar.
import { ui, initBoard, showPage, updateChips, closeModal, modalOpen, banner } from './ui.js';
import { SF } from './engine.js';
import { settings } from './store.js';
import { applyPieceSet } from './board.js';
import { unlockAudio } from './audio.js';
import { checkForUpdate } from './update.js';
import { $, qsa, isTV } from './util.js';
import './pages.js';
import { newGame } from './play.js';
import './puzzles.js';
import './training.js';

applyPieceSet(settings.pieces);
initBoard({});

document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (!go) return;
  const [page, anchor] = go.dataset.go.split('#');
  showPage(page, anchor);
});
document.addEventListener('pointerdown', unlockAudio, { once: true });
document.addEventListener('keydown', unlockAudio, { once: true });

SF.ready.then(updateChips);
window.__cypher = { newGame };
showPage('home');
setTimeout(() => checkForUpdate(false), 4000);

// ---------- TV-fjärr och tangentbord ----------
// Flyttar fokus till närmaste knapp i pilens riktning.
function spatial(dir) {
  const a = document.activeElement;
  if (!a || a === document.body) return false;
  const r0 = a.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
  let best = null, bs = Infinity;
  const scope = modalOpen() ? $('modal') : document;
  scope.querySelectorAll('button:not([disabled]), input, select, textarea, summary, a[href], .sq').forEach((el) => {
    if (el === a || !el.offsetParent) return;
    if (el.closest('[hidden]')) return;
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    let d, o;
    if (dir === 'right') { if (r.left < r0.right - 4) return; d = r.left - r0.right; o = Math.abs(y - cy); }
    else if (dir === 'left') { if (r.right > r0.left + 4) return; d = r0.left - r.right; o = Math.abs(y - cy); }
    else if (dir === 'down') { if (r.top < r0.bottom - 4) return; d = r.top - r0.bottom; o = Math.abs(x - cx); }
    else { if (r.bottom > r0.top + 4) return; d = r0.top - r.bottom; o = Math.abs(x - cx); }
    const s = d + o * 2.2;
    if (s < bs) { bs = s; best = el; }
  });
  if (!best) return false;
  if (best.classList.contains('sq')) ui.board.focusSquare(best.dataset.sq);
  else { best.focus({ preventScroll: true }); best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  return true;
}

function goBack() {
  if (modalOpen()) { closeModal(); return true; }
  if (ui.mode) {
    if (ui.mode.back && ui.mode.back()) return true;
    showPage(ui.mode.returnTo || ui.mode.tab || 'home');
    return true;
  }
  if (ui.page !== 'home') { showPage('home'); return true; }
  return false;
}

window.tvKey = (k) => { if (ui.mode && ui.mode.tvKey) ui.mode.tvKey(k); else if (k === 'red') showPage('home'); };
window.tvBack = () => goBack();

const DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
const MOVE = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
document.addEventListener('keydown', (e) => {
  const k = e.key, a = document.activeElement;
  const color = { ColorF0Red: 'red', ColorF1Green: 'green', ColorF2Yellow: 'yellow', ColorF3Blue: 'blue' }[k];
  if (color) { window.tvKey(color); e.preventDefault(); return; }
  if (k === 'GoBack' || k === 'BrowserBack' || (k === 'Escape' && !(a && a.tagName === 'TEXTAREA'))) { if (goBack()) e.preventDefault(); return; }
  if (!DIRS[k]) return;
  if (a && (a.tagName === 'INPUT' && a.type === 'text' || a.tagName === 'TEXTAREA')) return;
  const onSq = a && a.classList && a.classList.contains('sq');
  // Analysen bläddrar med vänster/höger när fokus inte är på brädet.
  if (ui.mode && ui.mode.arrowKey && !onSq && (k === 'ArrowLeft' || k === 'ArrowRight') && !(a && a.closest && a.closest('.bv-side, #page'))) { if (ui.mode.arrowKey(k)) { e.preventDefault(); return; } }
  if (onSq) {
    e.preventDefault();
    const [dr, dc] = MOVE[k];
    if (!ui.board.moveFocus(dr, dc)) spatial(DIRS[k]);
    return;
  }
  if (!a || a === document.body || a === $('page')) {
    e.preventDefault();
    if (ui.mode) ui.board.focusDefault();
    else { const f = $('page').querySelector('button:not([disabled])'); if (f) f.focus(); }
    return;
  }
  if (spatial(DIRS[k])) e.preventDefault();
});

if (isTV()) setTimeout(() => { const f = $('page').querySelector('.tile, button'); if (f) f.focus(); }, 400);
