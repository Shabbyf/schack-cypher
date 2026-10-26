// Battle-recap: analyserar ett parti med Stockfish ställning för ställning,
// klassar dragen som på Lichess, visar precision och värderingsgraf.
import { Game, other } from './rules.js';
import { botById } from './bots.js';
import { SF, search, stopAll } from './engine.js';
import { profile, findGame, saveGames } from './store.js';
import { ui, showBoard, showPage, side, setEval, setStatus, setStrips, say, playerStrip } from './ui.js';
import { addLessonsFromEvals, sameMove } from './lessons.js';
import { winPct, fmtEval, h, setHTML, $ } from './util.js';
import { startDrill } from './training.js';
import { showPgn } from './pgn.js';

const CLS = { best: ['Bästa draget', '★'], excellent: ['Utmärkt', '!'], good: ['Bra', ''], inacc: ['Tveksamt', '?!'], mistake: ['Misstag', '?'], blunder: ['Blunder', '??'] };
const RECAP = [[90, '{a}% precision. Det där var ett felfritt set.'], [75, '{a}%. Tight flow, några snedsteg i refrängen.'], [55, '{a}%. Du har bars, men kolla blundrarna i listan.'], [0, '{a}%. Vi går igenom tapen tillsammans, drag för drag.']];
const classify = (drop, best) => (best ? 'best' : drop < 2 ? 'excellent' : drop < 10 ? 'good' : drop < 20 ? 'inacc' : drop < 30 ? 'mistake' : 'blunder');
const accOf = (drop) => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * Math.max(0, drop)) - 3.1669));

export function openAnalysis(rec, opts = {}) {
  const m = new AnalysisMode(rec, opts);
  showBoard(m);
}

class AnalysisMode {
  constructor(rec, opts) {
    this.kind = 'analysis'; this.tab = 'history';
    this.rec = rec; this.opts = opts;
    this.game = Game.fromRecord(rec);
    this.bot = botById(rec.bot || 'gaffel', rec.botElo || profile.rating);
    this.botName = rec.botName || this.bot.name;
    this.color = rec.color || 'white';
    this.evals = rec.evals ? rec.evals.slice() : [];
    this.cls = []; this.acc = { white: 0, black: 0 };
    this.ply = this.game.ply; this.token = 0; this.done = false;
  }
  enter() {
    const b = ui.board;
    b.h.onMove = null; b.h.onDrop = null; b.h.onIdleClick = null;
    b.setOrientation(this.color);
    this.renderSide();
    this.compute();
    this.show();
    this.run();
  }
  leave() { this.token++; stopAll(); }
  async run() {
    const my = ++this.token;
    if (this.game.variant.engine !== 'sf' || !(await SF.ready)) {
      say($('anaBubble'), 'Analysen kräver Stockfish, och den finns bara för vanligt schack och Chess960.');
      return;
    }
    say($('anaBubble'), 'Jag lyssnar igenom tapen. Ge mig ett ögonblick.');
    const n = this.game.ply + 1;
    for (let i = 0; i < n; i++) {
      if (this.evals[i]) continue;
      const pos = this.game.posAt(i);
      if (pos.isCheckmate()) this.evals[i] = { white: pos.turn === 'white' ? -10000 : 10000, best: null };
      else if (pos.isEnd()) this.evals[i] = { white: 0, best: null };
      else {
        const r = await search(this.game, i, { depth: 14, movetime: 650 });
        if (my !== this.token) return;
        const cp = r.lines[0] ? r.lines[0].cp : 0;
        this.evals[i] = { white: pos.turn === 'white' ? cp : -cp, best: r.best };
      }
      setStatus(`Analyserar ställning ${i + 1} av ${n}…`);
      this.compute(); this.renderPanel();
      if (i === this.ply) this.show();
    }
    if (my !== this.token) return;
    this.done = true;
    setStatus('Klart. Bläddra med ◀ ▶ eller klicka på ett drag.');
    if (this.rec.id) { const g = findGame(this.rec.id); if (g) { g.evals = this.evals; g.acc = Math.round(this.acc[this.color]); saveGames(); } }
    this.compute(); this.show();
    const a = this.acc[this.color];
    const line = RECAP.find((x) => a >= x[0])[1].replace('{a}', Math.round(a));
    const bl = this.cls.map((c, i) => ({ c, i })).filter((x) => x.c === 'blunder' && this.game.moves[x.i].color === this.color);
    say($('anaBubble'), this.botName + ': ' + line + (bl.length ? ` Värsta stunden: drag ${Math.floor(bl[0].i / 2) + 1}, ${this.game.moves[bl[0].i].san}.` : ''), this.bot.voice);
    addLessonsFromEvals(this.game, this.evals, this.color);
    this.renderPanel();
  }
  compute() {
    const sums = { white: [], black: [] };
    this.cls = [];
    this.game.moves.forEach((m, i) => {
      const e0 = this.evals[i], e1 = this.evals[i + 1];
      if (!e0 || !e1) { this.cls[i] = null; return; }
      const sg = m.color === 'white' ? 1 : -1;
      const drop = winPct(sg * e0.white) - winPct(sg * e1.white);
      this.cls[i] = classify(drop, sameMove(this.game, i, e0.best, m.uci));
      sums[m.color].push(accOf(drop));
    });
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    this.acc = { white: avg(sums.white), black: avg(sums.black) };
  }
  mistakes() {
    return this.game.moves.map((m, i) => ({ m, i, c: this.cls[i] })).filter((x) => x.m.color === this.color && ['mistake', 'blunder', 'inacc'].includes(x.c) && this.evals[x.i] && this.evals[x.i].best);
  }
  renderSide() {
    const r = this.rec;
    const res = r.result ? { w: 'Vinst', l: 'Förlust', d: 'Remi' }[r.result] : 'pågående';
    setHTML(side(), h`
      <div class="card">
        <div class="ana-head"><h3>BATTLE-RECAP</h3><button class="btn sm" id="anaBack">Tillbaka</button></div>
        <div class="meta">Du (${this.color === 'white' ? 'vit' : 'svart'}) mot ${this.botName} · ${this.game.variant.name} · ${Math.ceil(this.game.ply / 2)} drag · ${res}</div>
        <div class="acc" id="anaAcc"></div>
        <svg class="graph" id="graph" preserveAspectRatio="none" role="img" aria-label="Värderingsgraf"></svg>
        <div class="comment" id="anaComment" aria-live="polite"></div>
        <ol class="moves ana" id="anaList"></ol>
        <div class="nav-row"><button class="btn sm" data-nav="first" aria-label="Första">|◀</button><button class="btn sm" data-nav="prev" aria-label="Föregående">◀</button><button class="btn sm" data-nav="next" aria-label="Nästa">▶</button><button class="btn sm" data-nav="last" aria-label="Sista">▶|</button></div>
      </div>
      <div class="controls">
        <button class="btn primary" id="learnBtn">Öva på dina misstag</button>
        <button class="btn" id="pgnBtn">PGN och Lichess</button>
      </div>
      <div class="card"><div class="opp-head"><span class="badge" style="background:${this.bot.color}">${this.bot.mono}</span><div class="bubble" id="anaBubble">…</div></div></div>`);
    $('anaBack').onclick = () => this.exit();
    side().querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => this.nav(b.dataset.nav)));
    $('graph').onclick = (e) => { const rc = e.currentTarget.getBoundingClientRect(); this.go(Math.round(((e.clientX - rc.left) / rc.width) * this.game.ply)); };
    $('learnBtn').onclick = () => this.learn();
    $('pgnBtn').onclick = () => showPgn(this.game, this.rec);
  }
  renderPanel() {
    if (!$('anaAcc')) return;
    const me = this.color, them = other(me), total = this.game.ply + 1, have = this.evals.filter(Boolean).length;
    const cnt = (c) => [['blunder', 'Blundrar'], ['mistake', 'Misstag'], ['inacc', 'Tveksamma'], ['best', 'Bästa']].map(([k, l]) => [k, l, this.cls.filter((x, i) => x === k && this.game.moves[i].color === c).length]);
    const tile = (who, c) => `<div><div class="who">${who}</div><div class="pct">${have > 1 ? Math.round(this.acc[c]) : '–'}<small>%</small></div><ul class="counts">${cnt(c).map(([k, l, n]) => `<li><span><span class="dot" style="background:var(--${k})"></span>${l}</span><b>${n}</b></li>`).join('')}</ul></div>`;
    $('anaAcc').innerHTML = (have < total ? `<div class="prog"><i style="width:${(have / total) * 100}%"></i></div>` : '') + tile('Du · precision', me) + tile(this.botName, them);
    // graf
    const N = Math.max(1, total - 1), sv = $('graph');
    sv.setAttribute('viewBox', `0 0 ${N} 100`);
    let d = 'M0 100', last = 0;
    this.evals.forEach((e, i) => { if (e) { d += ` L${i} ${100 - winPct(e.white)}`; last = i; } });
    d += ` L${last} 100 Z`;
    let marks = '';
    this.cls.forEach((c, i) => { if (['blunder', 'mistake', 'inacc'].includes(c) && this.evals[i + 1]) { const y = 100 - winPct(this.evals[i + 1].white); marks += `<line x1="${i + 1}" y1="${y}" x2="${i + 1}" y2="${y}" stroke="var(--${c})" stroke-width="9" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`; } });
    sv.innerHTML = `<path class="area" d="${d}"/><line class="mid" x1="0" y1="50" x2="${N}" y2="50" vector-effect="non-scaling-stroke"/><line class="cur" x1="${this.ply}" y1="0" x2="${this.ply}" y2="100" vector-effect="non-scaling-stroke"/>${marks}`;
    // drag
    const L = $('anaList');
    let out = '', n = this.game.posAt(0).fullmoves;
    this.game.moves.forEach((m, i) => {
      if (m.color === 'white') out += `<li><span class="n">${n}.</span>`;
      else if (i === 0) out += `<li><span class="n">${n}.</span><button class="mv" disabled>…</button>`;
      const c = this.cls[i];
      out += `<button class="mv${this.ply === i + 1 ? ' cur' : ''}" data-i="${i + 1}">${m.san}${c && CLS[c][1] ? `<span class="sym c-${c}">${CLS[c][1]}</span>` : ''}</button>`;
      if (m.color === 'black') { out += '</li>'; n++; }
    });
    L.innerHTML = out || '<li class="empty">Inga drag att analysera.</li>';
    L.querySelectorAll('.mv[data-i]').forEach((b) => (b.onclick = () => this.go(+b.dataset.i)));
    const cur = L.querySelector('.cur');
    if (cur) L.scrollTop = Math.max(0, cur.offsetTop - L.clientHeight / 2);
    // kommentar
    const p = this.ply, cm = $('anaComment');
    if (p === 0) cm.innerHTML = 'Startställning. Bläddra framåt för att se hur partiet gick.';
    else {
      const m = this.game.moves[p - 1], c = this.cls[p - 1], e0 = this.evals[p - 1], e1 = this.evals[p];
      const num = Math.floor((p - 1) / 2) + 1 + (m.color === 'white' ? '.' : '…');
      if (!c) cm.innerHTML = `${num} ${m.san}: analyseras…`;
      else {
        let t = `<b>${num} ${m.san}</b> · <span class="cl c-${c}">${CLS[c][0]}</span>. `;
        if (!['best', 'excellent'].includes(c) && e0 && e0.best) t += `${m.color === this.color ? 'Bästa var' : this.botName + ' missade'} <b>${this.game.sanOf(e0.best, p - 1)}</b> (grön pil). `;
        if (e1) t += `Ställning: <span class="mono">${fmtEval(e1.white)}</span>`;
        cm.innerHTML = t;
      }
    }
    const lb = $('learnBtn');
    if (lb) { const n2 = this.mistakes().length; lb.disabled = !this.done || !n2; lb.textContent = this.done ? (n2 ? `Öva på dina misstag (${n2})` : 'Inga misstag att öva på') : 'Öva på dina misstag'; }
  }
  show() {
    const g = this.game, p = this.ply, pos = g.posAt(p), last = p > 0 ? g.moves[p - 1] : null;
    const c = this.cls[p - 1];
    const marks = {};
    if (last && c) marks[last.to] = c === 'good' ? null : c;
    ui.board.set({ pos, lastMove: last ? { from: last.from || last.to, to: last.to } : null, check: pos.isCheck() ? g.kingSquare(pos.turn, pos) : null, movable: null, dests: new Map(), dropDests: [], marks });
    const e0 = this.evals[p - 1];
    ui.board.arrows(last && c && !['best', 'excellent'].includes(c) && e0 && e0.best ? [g.uciToSquares(e0.best, p - 1)] : []);
    const ev = this.evals[p];
    setEval(ev ? ev.white : null);
    const { diff } = (() => { const x = g.clone(); x.truncate(p); return x.material(); })();
    const oc = other(this.color);
    setStrips(playerStrip({ name: this.botName, sub: this.rec.botElo ? '≈' + this.rec.botElo : '', badge: true, color: this.bot.color, mono: this.bot.mono, material: '' }), playerStrip({ name: 'Du', sub: this.color === 'white' ? 'vit' : 'svart', material: '' }));
    this.renderPanel();
  }
  go(p) { this.ply = Math.max(0, Math.min(this.game.ply, p)); this.show(); }
  nav(d) { this.go({ first: 0, prev: this.ply - 1, next: this.ply + 1, last: this.game.ply }[d]); }
  learn() {
    const items = this.mistakes().map((x) => ({
      fen: this.game.fen(x.i), variant: this.game.variant.id, color: this.color, best: this.evals[x.i].best,
      bestSan: this.game.sanOf(this.evals[x.i].best, x.i), played: x.m.uci, playedSan: x.m.san,
      title: `Drag ${Math.floor(x.i / 2) + 1}: du spelade ${x.m.san}`, epd: this.game.epd(x.i),
    }));
    startDrill(items, { title: 'Öva på dina misstag', from: 'analysis', back: () => showBoard(this) });
  }
  exit() { this.token++; stopAll(); if (this.opts.back) this.opts.back(); else showPage('history'); }
  tvKey(k) { if (k === 'blue' || k === 'red') this.exit(); else if (k === 'green') this.learn(); }
  // Pilar vänster/höger bläddrar i analysen.
  arrowKey(k) { if (k === 'ArrowLeft') { this.nav('prev'); return true; } if (k === 'ArrowRight') { this.nav('next'); return true; } return false; }
  back() { this.exit(); return true; }
}
