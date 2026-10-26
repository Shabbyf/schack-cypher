// Taktikpussel som på Lichess: teman, dagens pussel, pusselrating och streak.
import { Game, other } from './rules.js';
import { profile, settings, saveSettings, saveProfile, applyPuzzleRating, puzzleSeen, savePuzzleSeen } from './store.js';
import { sfx } from './audio.js';
import { ui, registerPage, showBoard, showPage, side, setEval, setStatus, setStrips, toast, updateChips, confetti } from './ui.js';
import { loadPuzzles, pickPuzzle, dailyPuzzle, THEME_SV, THEME_GROUPS, openingLabel } from './data.js';
import { sameMove } from './lessons.js';
import { h, setHTML, $, sleep, todayKey } from './util.js';

const DIFF = [[-400, 'Mycket lättare'], [-200, 'Lättare'], [0, 'Normal'], [200, 'Svårare'], [400, 'Mycket svårare']];

registerPage('puzzles', async (page) => {
  setHTML(page, h`<section class="hero slim"><h1>Pussel</h1><p>Laddar pusselpaketet…</p></section>`);
  const pack = await loadPuzzles();
  const count = (k) => (pack && pack.index[k] ? pack.index[k].length : 0);
  const today = profile.daily[todayKey()];
  setHTML(page, h`
    <section class="hero slim puzzle-hero">
      <div><h1>Pussel</h1><p>Hitta det bästa draget. ${pack ? pack.puzzles.length.toLocaleString('sv-SE') : 0} pussel från Lichess finns i appen${settings.puzzleOnline ? ', och fler hämtas direkt från Lichess när du är online' : ''}.</p></div>
      <div class="stat-row"><div class="stat"><b>${profile.puzzleRating}</b><small>pusselrating</small></div><div class="stat"><b>${profile.puzzleGames}</b><small>lösta och missade</small></div><div class="stat"><b>${profile.streakBest}</b><small>bästa streak</small></div></div>
    </section>
    <section class="grid modes">
      <button class="tile big" id="pzDaily"><span class="ti">☀</span><b>Dagens pussel</b><small>${today ? (today === 'ok' ? 'Löst idag ✓' : 'Missat idag, försök igen') : 'Ett nytt pussel varje dag'}</small></button>
      <button class="tile big" id="pzMix"><span class="ti">✦</span><b>Snabbstart</b><small>Blandade teman nära din rating</small></button>
      <button class="tile big" id="pzStreak"><span class="ti">🔥</span><b>Pusselstreak</b><small>Allt svårare tills du missar. Rekord: ${profile.streakBest}</small></button>
    </section>
    <section class="block">
      <div class="block-head"><h2>Svårighet</h2></div>
      <div class="seg" role="radiogroup" aria-label="Svårighet">${DIFF.map(([v, l]) => h`<button role="radio" aria-checked="${settings.puzzleDifficulty === v}" class="${settings.puzzleDifficulty === v ? 'on' : ''}" data-d="${v}">${l}</button>`)}</div>
    </section>
    ${THEME_GROUPS.map(([g, list]) => h`<section class="block"><div class="block-head"><h2>${g}</h2></div><div class="grid themes">${list.filter((t) => count(t)).map((t) => h`<button class="tile theme" data-k="${t}"><b>${THEME_SV[t][0]}</b><small>${THEME_SV[t][1]}</small></button>`)}</div></section>`)}
    ${pack && pack.openings ? h`<section class="block"><div class="block-head"><h2>Pussel från öppningar</h2></div><div class="grid themes">${pack.openings.map((o) => h`<button class="tile theme" data-k="op:${o}"><b>${openingLabel(o)}</b><small>${count('op:' + o)} pussel</small></button>`)}</div></section>` : ''}`);
  $('pzDaily').onclick = () => startPuzzles({ daily: true });
  $('pzMix').onclick = () => startPuzzles({ key: 'mix' });
  $('pzStreak').onclick = () => startPuzzles({ key: 'mix', streak: true });
  page.querySelectorAll('.seg button').forEach((b) => (b.onclick = () => { settings.puzzleDifficulty = +b.dataset.d; saveSettings(); page.querySelectorAll('.seg button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }); }));
  page.querySelectorAll('.tile.theme').forEach((b) => (b.onclick = () => startPuzzles({ key: b.dataset.k })));
});

export function startPuzzles(cfg) { showBoard(new PuzzleMode(cfg)); }

class PuzzleMode {
  constructor(cfg) { this.kind = 'puzzle'; this.tab = 'puzzles'; this.cfg = cfg; this.token = 0; this.streak = 0; }
  enter() {
    const b = ui.board;
    b.h.onMove = (f, t) => this.onMove(f, t); b.h.onDrop = null; b.h.onIdleClick = null;
    const k = this.cfg.key || 'mix';
    const title = this.cfg.daily ? 'Dagens pussel' : this.cfg.streak ? 'Pusselstreak' : k.startsWith('op:') ? openingLabel(k.slice(3)) : THEME_SV[k] ? THEME_SV[k][0] : 'Pussel';
    setHTML(side(), h`<div class="card puzzle-card">
      <div class="ana-head"><h3>${title}</h3><button class="btn sm" id="pzBack">Tillbaka</button></div>
      <div class="pz-turn" id="pzTurn"></div>
      <div class="feedback" id="pzFb" aria-live="polite"></div>
      <div class="pz-info" id="pzInfo"></div>
      <div class="controls"><button class="btn" id="pzHint">Tips <kbd class="ck g"></kbd></button><button class="btn" id="pzSol">Visa lösningen <kbd class="ck b"></kbd></button><button class="btn primary" id="pzNext">Nästa <kbd class="ck r"></kbd></button></div>
      <div class="pz-rating"><span>Pusselrating</span><b id="pzRating">${profile.puzzleRating}</b></div>
    </div>`);
    $('pzBack').onclick = () => showPage('puzzles');
    $('pzHint').onclick = () => this.hint();
    $('pzSol').onclick = () => this.solution();
    $('pzNext').onclick = () => this.next();
    this.next();
  }
  leave() { this.token++; }
  async next() {
    const my = ++this.token;
    if (this.streakBroken) { this.streak = 0; this.streakBroken = false; }
    setStatus('Hämtar pussel…');
    let p;
    if (this.cfg.daily && !this.loadedDaily) { p = await dailyPuzzle(); this.loadedDaily = true; }
    else if (this.cfg.streak) p = await pickPuzzle('mix', { target: 800 + this.streak * 70, offline: true });
    else p = await pickPuzzle(this.cfg.daily ? 'mix' : this.cfg.key || 'mix');
    if (my !== this.token) return;
    if (!p) { setStatus('Kunde inte ladda något pussel.'); return; }
    this.p = p;
    this.game = new Game('standard', p.fen);
    this.color = other(this.game.turn);
    this.idx = 0; this.state = 'intro'; this.failed = false; this.counted = false; this.hints = 0;
    ui.board.setOrientation(this.color);
    this.show();
    $('pzFb').textContent = ''; $('pzFb').className = 'feedback';
    $('pzInfo').innerHTML = '';
    $('pzNext').disabled = true; $('pzHint').disabled = false; $('pzSol').disabled = false;
    await sleep(600);
    if (my !== this.token) return;
    const rec = this.game.playUci(p.moves[0]);
    this.idx = 1; this.state = 'solve';
    sfx.move();
    this.show(rec);
    this.turnText();
    setStatus('');
    ui.board.focusDefault();
  }
  turnText() {
    setHTML($('pzTurn'), h`<span class="dot-turn ${this.color}"></span><div><b>Din tur</b><small>Hitta bästa draget för ${this.color === 'white' ? 'vit' : 'svart'}.${this.cfg.streak ? h` Streak: ${this.streak}` : ''}</small></div>`);
  }
  show(rec, marks = {}, arrows = []) {
    const g = this.game, pos = g.pos, last = g.moves[g.ply - 1];
    ui.board.set({ pos, lastMove: last ? { from: last.from, to: last.to } : null, check: pos.isCheck() ? g.kingSquare(pos.turn) : null, movable: this.state === 'solve' ? this.color : null, dests: g.dests(), dropDests: [], marks, animate: rec && rec.from ? { from: rec.from, to: rec.to } : null });
    ui.board.arrows(arrows);
    setEval(null);
    setStrips('', '');
  }
  async onMove(from, to) {
    if (this.state !== 'solve') return;
    const e = this.game.dests().get(from)?.find((x) => x.to === to);
    if (!e) return;
    let mv = e.moves[0];
    if (e.moves.length > 1) { const r = await ui.board.promote(this.color, to, e.moves.map((m) => m.promotion)); if (!r) return this.show(); mv = e.moves.find((m) => m.promotion === r); }
    const want = this.p.moves[this.idx];
    const ply = this.game.ply;
    const rec = this.game.play(mv);
    const right = sameMove(this.game, ply, want, rec.uci) || (this.game.pos.isCheckmate());
    if (!right) {
      sfx.bad();
      this.show(rec, { [rec.to]: 'bad' });
      this.fail('Inte rätt drag. Försök igen.');
      const my = this.token;
      await sleep(700);
      if (my !== this.token) return;
      this.game.undo();
      if (this.state === 'solve') this.show();
      return;
    }
    this.idx++;
    sfx.move();
    this.show(rec, { [rec.to]: 'good' });
    if (this.idx >= this.p.moves.length || this.game.pos.isCheckmate()) return this.solved();
    $('pzFb').className = 'feedback good'; $('pzFb').textContent = 'Bästa draget! Fortsätt.';
    this.state = 'reply';
    const my = this.token;
    await sleep(450);
    if (my !== this.token) return;
    const r2 = this.game.playUci(this.p.moves[this.idx]);
    this.idx++;
    this.state = 'solve';
    sfx.move();
    this.show(r2);
  }
  rate(ok) {
    if (this.counted) return null;
    this.counted = true;
    puzzleSeen.add(this.p.id); savePuzzleSeen();
    if (this.p.daily) { profile.daily[this.p.daily] = ok ? 'ok' : 'miss'; saveProfile(); }
    const d = applyPuzzleRating(this.p.rating, ok);
    $('pzRating').textContent = profile.puzzleRating;
    updateChips();
    return d;
  }
  fail(text) {
    if (!this.failed) {
      this.failed = true;
      const d = this.rate(false);
      if (d !== null) toast(`Pusselrating ${profile.puzzleRating} (${d >= 0 ? '+' : ''}${d})`);
    }
    $('pzFb').className = 'feedback bad'; $('pzFb').textContent = text;
    if (this.cfg.streak) this.endStreak();
  }
  endStreak() {
    this.state = 'failed';
    this.streakBroken = true;
    const best = this.streak > profile.streakBest;
    if (best) { profile.streakBest = this.streak; saveProfile(); }
    $('pzFb').className = 'feedback bad';
    $('pzFb').textContent = `Streaken bröts på ${this.streak}.${best ? ' Nytt rekord!' : ''} Tryck Nästa för att börja om.`;
    this.reveal();
  }
  solved() {
    this.state = 'done';
    const d = this.failed ? null : this.rate(true);
    sfx.good();
    $('pzFb').className = 'feedback good';
    if (this.cfg.streak && !this.failed) { this.streak++; $('pzFb').textContent = `Löst! Streak: ${this.streak}.`; if (this.streak > profile.streakBest) { profile.streakBest = this.streak; saveProfile(); } }
    else $('pzFb').textContent = this.failed ? 'Löst, men med fel på vägen.' : `Löst! ${d !== null ? `Pusselrating ${profile.puzzleRating} (${d >= 0 ? '+' : ''}${d}).` : ''}`;
    if (this.p.daily && !this.failed) confetti();
    this.reveal();
  }
  reveal() {
    const p = this.p;
    setHTML($('pzInfo'), h`<p><b>Pussel ${p.id}</b> · rating ${p.rating}${p.source === 'lichess' ? ' · från Lichess' : ''}</p><div class="theme-tags">${p.themes.filter((t) => THEME_SV[t]).map((t) => h`<span class="tag">${THEME_SV[t][0]}</span>`)}</div><p class="muted small">lichess.org/training/${p.id}</p>`);
    $('pzNext').disabled = false; $('pzHint').disabled = true; $('pzSol').disabled = true;
    this.show();
    $('pzNext').focus();
  }
  hint() {
    if (this.state !== 'solve') return;
    this.hints++;
    const sq = this.game.uciToSquares(this.p.moves[this.idx]);
    if (!this.failed) { this.failed = true; this.rate(false); }
    if (this.hints === 1) { this.show(null, { [sq.from]: 'hint' }); $('pzFb').className = 'feedback'; $('pzFb').textContent = 'Den markerade pjäsen ska flytta.'; }
    else this.show(null, {}, [sq]);
  }
  async solution() {
    if (this.state !== 'solve') return;
    if (!this.failed) { this.failed = true; this.rate(false); }
    if (this.cfg.streak) { this.endStreak(); }
    this.state = 'replay';
    const my = this.token;
    while (this.idx < this.p.moves.length) {
      const r = this.game.playUci(this.p.moves[this.idx]);
      this.idx++;
      sfx.move(); this.show(r);
      await sleep(650);
      if (my !== this.token) return;
    }
    this.state = 'done';
    $('pzFb').className = 'feedback'; $('pzFb').textContent = 'Så här gick lösningen.';
    this.reveal();
  }
  tvKey(k) { if (k === 'red') { if (!$('pzNext').disabled) this.next(); } else if (k === 'green') this.hint(); else if (k === 'blue') this.solution(); }
  back() { if (ui.board.deselect()) return true; showPage('puzzles'); return true; }
}
