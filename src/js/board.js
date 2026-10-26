// Schackbrädet: ritar ställningen, låter spelaren flytta med klick, dra-och-släpp
// eller TV-fjärrens pilar, animerar drag och ritar pilar. Fickor för Crazyhouse.
import { settings } from './store.js';
import { ROLE_SV } from './rules.js';

const GLYPH = { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' };
const ROLE_L = { king: 'K', queen: 'Q', rook: 'R', bishop: 'B', knight: 'N', pawn: 'P' };
const FILES = 'abcdefgh';

export const BOARD_THEMES = [
  ['cypher', 'Cypher'], ['brown', 'Lichess brun'], ['blue', 'Blå'], ['green', 'Grön'],
  ['graffiti', 'Graffitivägg'], ['vinyl', 'Vinylskiva'], ['gold', 'Guldkedja'], ['neon', 'Neon'],
];
export const PIECE_SETS = [
  ['cburnett', 'Klassisk'], ['merida', 'Merida'], ['chessnut', 'Chessnut'], ['fantasy', 'Fantasy'],
  ['celtic', 'Celtic'], ['spatial', 'Spatial'], ['mpchess', 'MPChess'], ['rhosgfx', 'Pixel'],
  ['guld', 'Guldkedjor'], ['graffiti', 'Graffiti'], ['cypher', 'Cypher (symboler)'],
];

let pieceCss = null;
export function applyPieceSet(set) {
  if (!pieceCss) { pieceCss = document.createElement('style'); document.head.appendChild(pieceCss); }
  if (set === 'cypher') { pieceCss.textContent = ''; return; }
  let css = '';
  for (const c of ['w', 'b']) for (const r of Object.values(ROLE_L)) css += `.pset-img .pc.${c}${r}{background-image:url(pieces/${set}/${c}${r}.svg)}`;
  pieceCss.textContent = css;
}
export function pieceHTML(color, role, set = settings.pieces) {
  const c = color === 'white' ? 'w' : 'b';
  if (set === 'cypher') return `<i class="pc glyph ${c}">${GLYPH[role]}&#xFE0E;</i>`;
  return `<i class="pc ${c}${ROLE_L[role]}"></i>`;
}

export class Board {
  constructor(root, handlers = {}) {
    this.root = root;
    this.h = handlers; // onMove(from,to) -> void, onDrop(role,to), onSelect
    this.orientation = 'white';
    this.state = { pos: null, lastMove: null, check: null, movable: null, dests: new Map(), dropDests: [], marks: {} };
    this.selected = null;
    this.arrowList = [];
    root.classList.add('cg');
    root.innerHTML = `<div class="pocket top"></div><div class="cg-board-wrap"><div class="cg-board" role="grid" aria-label="Schackbräde"></div><svg class="cg-arrows" viewBox="0 0 800 800" aria-hidden="true"></svg><div class="cg-overlay" hidden></div></div><div class="pocket bottom"></div>`;
    this.boardEl = root.querySelector('.cg-board');
    this.arrowsEl = root.querySelector('.cg-arrows');
    this.overlay = root.querySelector('.cg-overlay');
    this.pocketTop = root.querySelector('.pocket.top');
    this.pocketBottom = root.querySelector('.pocket.bottom');
    this.build();
    this.bindPointer();
  }
  applyTheme() {
    this.root.className = this.root.className.replace(/\b(bt|pset)-[\w-]+/g, '').trim();
    this.root.classList.add('bt-' + settings.board, settings.pieces === 'cypher' ? 'pset-glyph' : 'pset-img');
    this.root.classList.toggle('no-coords', !settings.coords);
  }
  build() {
    this.applyTheme();
    this.boardEl.innerHTML = '';
    this.sqEls = {};
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const name = this.sqName(r, c);
      const fi = FILES.indexOf(name[0]), rk = +name[1];
      const el = document.createElement('div');
      el.className = 'sq ' + ((fi + rk) % 2 === 1 ? 'l' : 'd');
      el.dataset.sq = name; el.dataset.r = r; el.dataset.c = c;
      el.tabIndex = -1; el.setAttribute('role', 'gridcell');
      let co = '';
      if (c === 0) co += `<span class="co r">${name[1]}</span>`;
      if (r === 7) co += `<span class="co f">${name[0]}</span>`;
      el.innerHTML = co + '<span class="pcw"></span>';
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.click(name); } });
      this.boardEl.appendChild(el);
      this.sqEls[name] = el;
    }
    this.lastPieces = {};
    if (this.state.pos) this.render(true);
  }
  sqName(r, c) {
    const w = this.orientation === 'white';
    return FILES[w ? c : 7 - c] + (w ? 8 - r : r + 1);
  }
  sqXY(s) {
    const f = FILES.indexOf(s[0]), r = +s[1], w = this.orientation === 'white';
    return [(w ? f : 7 - f) * 100 + 50, (w ? 8 - r : r - 1) * 100 + 50];
  }
  setOrientation(o) { if (o !== this.orientation) { this.orientation = o; this.build(); } }

  // pos: chessops-position. movable: färg som får flyttas (eller null).
  set(s) {
    const posChanged = s.pos && s.pos !== this.state.pos;
    Object.assign(this.state, s);
    if (posChanged || s.movable !== undefined) { this.selected = null; }
    this.render(false, posChanged ? s.animate : null);
  }
  render(instant, anim) {
    const st = this.state, pos = st.pos;
    if (!pos) return;
    const sel = this.selected;
    const targets = sel ? this.targetsOf(sel) : [];
    const pieces = {};
    for (const name in this.sqEls) {
      const el = this.sqEls[name];
      const idx = FILES.indexOf(name[0]) + (name[1] - 1) * 8;
      const p = pos.board.get(idx);
      const key = p ? p.color + p.role : '';
      pieces[name] = key;
      const wrap = el.querySelector('.pcw');
      if (this.lastPieces[name] !== key || instant) wrap.innerHTML = p ? pieceHTML(p.color, p.role) : '';
      el.classList.toggle('last', !!st.lastMove && (name === st.lastMove.from || name === st.lastMove.to));
      el.classList.toggle('check', name === st.check);
      el.classList.toggle('sel', name === sel);
      const t = targets.includes(name);
      el.classList.toggle('tgt', t);
      el.classList.toggle('cap', t && !!p);
      el.classList.toggle('movable', !!p && st.movable === p.color);
      for (const k of ['good', 'bad', 'hint', 'blunder', 'mistake', 'inacc', 'best']) el.classList.toggle('m-' + k, st.marks[name] === k);
      el.setAttribute('aria-label', name + (p ? ' ' + (p.color === 'white' ? 'vit ' : 'svart ') + ROLE_SV[p.role] : ''));
    }
    this.lastPieces = pieces;
    if (anim && anim.from && settings.animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) this.animate(anim.from, anim.to);
    this.renderPockets();
    this.drawArrows();
  }
  animate(from, to) {
    const el = this.sqEls[to] && this.sqEls[to].querySelector('.pc');
    if (!el) return;
    const [x1, y1] = this.sqXY(from), [x2, y2] = this.sqXY(to);
    el.style.transition = 'none';
    el.style.transform = `translate(${(x1 - x2)}%, ${(y1 - y2)}%)`;
    el.style.zIndex = 4;
    void el.offsetWidth;
    el.style.transition = 'transform .18s ease-out';
    el.style.transform = '';
    setTimeout(() => { el.style.zIndex = ''; }, 200);
  }
  targetsOf(sel) {
    if (sel.startsWith('drop:')) {
      const role = sel.slice(5);
      return this.state.dropDests.filter((s) => !(role === 'pawn' && (s[1] === '1' || s[1] === '8')));
    }
    const list = this.state.dests.get(sel);
    return list ? list.map((x) => x.to) : [];
  }
  renderPockets() {
    const st = this.state, pos = st.pos;
    const show = !!(pos && pos.pockets);
    this.root.classList.toggle('has-pockets', show);
    if (!show) { this.pocketTop.innerHTML = ''; this.pocketBottom.innerHTML = ''; return; }
    const draw = (el, color) => {
      const p = pos.pockets[color];
      el.innerHTML = ['pawn', 'knight', 'bishop', 'rook', 'queen'].map((r) => {
        const n = p[r], can = n > 0 && st.movable === color && pos.turn === color;
        return `<button class="pk${this.selected === 'drop:' + r && can ? ' sel' : ''}" data-role="${r}" ${can ? '' : 'disabled'} aria-label="Sätt in ${ROLE_SV[r]}, ${n} kvar">${pieceHTML(color, r)}<b>${n || ''}</b></button>`;
      }).join('');
      el.querySelectorAll('.pk').forEach((b) => b.addEventListener('click', () => {
        const key = 'drop:' + b.dataset.role;
        this.selected = this.selected === key ? null : key;
        this.render();
        if (this.selected) this.focusSquare(this.targetsOf(this.selected)[0]);
      }));
    };
    const bottom = this.orientation, top = bottom === 'white' ? 'black' : 'white';
    draw(this.pocketTop, top); draw(this.pocketBottom, bottom);
  }

  click(name) {
    const st = this.state;
    if (!st.pos || !st.movable || st.pos.turn !== st.movable) {
      if (this.h.onIdleClick) this.h.onIdleClick(name);
      return;
    }
    const sel = this.selected;
    if (sel && this.targetsOf(sel).includes(name)) {
      this.selected = null;
      if (sel.startsWith('drop:')) this.h.onDrop && this.h.onDrop(sel.slice(5), name);
      else this.h.onMove && this.h.onMove(sel, name);
      return;
    }
    const idx = FILES.indexOf(name[0]) + (name[1] - 1) * 8;
    const p = st.pos.board.get(idx);
    if (p && p.color === st.movable) this.selected = sel === name ? null : name;
    else this.selected = null;
    this.render();
  }
  bindPointer() {
    let drag = null;
    const sqAt = (x, y) => {
      const r = this.boardEl.getBoundingClientRect();
      if (x < r.left || y < r.top || x >= r.right || y >= r.bottom) return null;
      const c = Math.floor((x - r.left) / (r.width / 8)), rr = Math.floor((y - r.top) / (r.height / 8));
      return this.sqName(rr, c);
    };
    this.boardEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const name = sqAt(e.clientX, e.clientY);
      if (!name) return;
      const st = this.state;
      const pcEl = this.sqEls[name].querySelector('.pc');
      const canDrag = pcEl && st.movable && st.pos && st.pos.turn === st.movable && this.sqEls[name].classList.contains('movable');
      if (!canDrag) { this.click(name); return; }
      e.preventDefault();
      drag = { from: name, x: e.clientX, y: e.clientY, moved: false, pcEl, ghost: null, wasSel: this.selected === name };
      if (!drag.wasSel) { this.selected = name; this.render(); }
      this.boardEl.setPointerCapture(e.pointerId);
    });
    this.boardEl.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      const size = this.boardEl.getBoundingClientRect().width / 8;
      if (!drag.moved) {
        drag.moved = true;
        drag.ghost = drag.pcEl.cloneNode(true);
        drag.ghost.classList.add('ghost');
        drag.ghost.style.width = drag.ghost.style.height = size + 'px';
        drag.ghost.style.fontSize = size * 0.8 + 'px';
        document.body.appendChild(drag.ghost);
        drag.pcEl.style.opacity = '.25';
      }
      drag.ghost.style.left = e.clientX - size / 2 + 'px';
      drag.ghost.style.top = e.clientY - size / 2 + 'px';
    });
    const end = (e) => {
      if (!drag) return;
      const d = drag; drag = null;
      if (d.ghost) d.ghost.remove();
      d.pcEl.style.opacity = '';
      if (!d.moved) { if (d.wasSel) { this.selected = null; this.render(); } return; }
      const to = e.type === 'pointerup' ? sqAt(e.clientX, e.clientY) : null;
      if (to && to !== d.from && this.targetsOf(d.from).includes(to)) {
        this.selected = null;
        this.h.onMove && this.h.onMove(d.from, to, true);
      } else this.render();
    };
    this.boardEl.addEventListener('pointerup', end);
    this.boardEl.addEventListener('pointercancel', end);
  }

  arrows(list) { this.arrowList = list || []; this.drawArrows(); }
  drawArrows() {
    this.arrowsEl.innerHTML = this.arrowList.filter((a) => a && a.to).map(({ from, to, color = 'var(--arrow)', op = 0.82 }) => {
      if (!from) { const [x, y] = this.sqXY(to); return `<circle cx="${x}" cy="${y}" r="40" fill="none" stroke="${color}" stroke-width="10" opacity="${op}"/>`; }
      const [x1, y1] = this.sqXY(from), [x2, y2] = this.sqXY(to);
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
      const hx = x2 - ux * 34, hy = y2 - uy * 34, px = -uy * 24, py = ux * 24;
      return `<g fill="${color}" stroke="${color}" opacity="${op}"><line x1="${x1 + ux * 18}" y1="${y1 + uy * 18}" x2="${hx}" y2="${hy}" stroke-width="16" stroke-linecap="round"/><polygon points="${x2},${y2} ${hx + px},${hy + py} ${hx - px},${hy - py}" stroke="none"/></g>`;
    }).join('');
  }

  // Väljer pjäs vid förvandling. Returnerar roll eller null.
  promote(color, to, roles = ['queen', 'knight', 'rook', 'bishop']) {
    return new Promise((resolve) => {
      const o = this.overlay;
      o.hidden = false;
      o.innerHTML = `<div class="promo" role="dialog" aria-label="Välj pjäs">${roles.map((r) => `<button data-r="${r}" aria-label="${ROLE_SV[r]}">${pieceHTML(color, r)}</button>`).join('')}<button class="x" data-r="" aria-label="Avbryt">✕</button></div>`;
      o.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { o.hidden = true; o.innerHTML = ''; resolve(b.dataset.r || null); }));
      o.querySelector('button').focus();
      this.cancelPromo = () => { o.hidden = true; o.innerHTML = ''; resolve(null); };
    });
  }
  showOverlay(html) { this.overlay.hidden = false; this.overlay.innerHTML = html; return this.overlay; }
  hideOverlay() { this.overlay.hidden = true; this.overlay.innerHTML = ''; }
  get overlayOpen() { return !this.overlay.hidden; }

  // Fjärrkontroll / tangentbord
  focusSquare(name) {
    const el = name && this.sqEls[name];
    if (!el) return;
    Object.values(this.sqEls).forEach((x) => (x.tabIndex = -1));
    el.tabIndex = 0; el.focus({ preventScroll: true });
  }
  focusDefault() {
    const st = this.state;
    let s = this.selected && !this.selected.startsWith('drop:') ? this.selected : null;
    if (!s && st.lastMove) s = st.lastMove.to;
    this.focusSquare(s || (this.orientation === 'white' ? 'e2' : 'e7'));
  }
  moveFocus(dr, dc) {
    const a = document.activeElement;
    if (!a || !a.dataset || !a.dataset.sq) { this.focusDefault(); return true; }
    const r = +a.dataset.r + dr, c = +a.dataset.c + dc;
    if (r < 0 || r > 7 || c < 0 || c > 7) return false;
    this.focusSquare(this.sqName(r, c));
    return true;
  }
  deselect() { if (this.selected) { this.selected = null; this.render(); return true; } return false; }
}
