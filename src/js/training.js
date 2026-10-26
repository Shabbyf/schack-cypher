// Träning: repetition av dina öppningsmisstag, "öva på dina misstag" från analysen,
// huvudlinjer i populära öppningar och statistik över öppningarna du spelar.
import { Game, other } from './rules.js';
import { SF, search, stopAll } from './engine.js';
import { games, profile, lessons } from './store.js';
import { sfx } from './audio.js';
import { ui, registerPage, showBoard, showPage, side, setEval, setStatus, setStrips, say, playerStrip, toast } from './ui.js';
import { allLessons, dueLessons, gradeLesson, sameMove } from './lessons.js';
import { loadOpenings, openingFamily } from './data.js';
import { winPct, h, raw, setHTML, $, ls, lsSet, sleep } from './util.js';

export const CURATED = [
  ['Italian Game: Giuoco Piano', 'white'], ['Ruy Lopez: Morphy Defense', 'white'], ['Scotch Game', 'white'],
  ['Vienna Game', 'white'], ["Queen's Pawn Game: London System", 'white'], ['Catalan Opening', 'white'],
  ["English Opening: King's English Variation", 'white'], ['Sicilian Defense: Najdorf Variation', 'black'],
  ['Sicilian Defense: Dragon Variation', 'black'], ['French Defense: Advance Variation', 'black'],
  ['Caro-Kann Defense: Classical Variation', 'black'], ["Queen's Gambit Declined", 'black'], ['Slav Defense', 'black'],
  ["King's Indian Defense: Normal Variation", 'black'], ['Nimzo-Indian Defense', 'black'], ['Scandinavian Defense: Mieses-Kotroc Variation', 'black'],
  ["Petrov's Defense", 'black'], ['Grünfeld Defense', 'black'], ['Pirc Defense', 'black'], ['Dutch Defense', 'black'],
];
const practice = ls('sc2-openprac', {});

function lineFor(op, name) {
  const m = op.list.filter((x) => x[1] === name).filter((x) => x[2].split(' ').length <= 14);
  if (!m.length) return null;
  return m.sort((a, b) => b[2].split(' ').length - a[2].split(' ').length)[0];
}

registerPage('training', async (page) => {
  const op = await loadOpenings();
  const due = dueLessons(), all = allLessons();
  // Statistik över egna öppningar
  const stats = {};
  for (const g of games) {
    if (g.variant !== 'standard' || !g.opening) continue;
    const k = openingFamily(g.opening) + '|' + g.color;
    const s = stats[k] || (stats[k] = { name: openingFamily(g.opening), color: g.color, w: 0, d: 0, l: 0 });
    s[g.result]++;
  }
  const statRows = Object.values(stats).sort((a, b) => b.w + b.d + b.l - (a.w + a.d + a.l)).slice(0, 12);
  setHTML(page, h`
    <section class="hero slim"><h1>Träning</h1><p>Repetera öppningsmisstagen du gjort mot botarna, och lär dig huvudlinjerna i populära öppningar.</p></section>
    <section class="block">
      <div class="block-head"><h2>Dina öppningsmisstag</h2><button class="btn primary" id="drillDue" ${due.length ? '' : 'disabled'}>Repetera ${due.length ? '(' + due.length + ')' : ''}</button><button class="btn" id="drillAll" ${all.length ? '' : 'disabled'}>Öva alla (${all.length})</button></div>
      ${all.length ? '' : h`<p class="muted">Inga sparade än. När du gör ett tveksamt drag i de första ${12} dragen sparas ställningen här automatiskt efter partiet. Spelar du samma drag igen säger botarna till.</p>`}
      <ul class="lessons">${all.slice(0, 30).map((l) => h`<li><span class="eco">${l.eco}</span><span class="ln"><b>${l.opening}</b><small>Du spelade <s>${l.playedSan}</s>, bättre var <em>${l.bestSan}</em>${l.repeats ? h` · upprepat ${l.repeats} gång${l.repeats > 1 ? 'er' : ''}` : ''}</small></span><span class="due ${l.due <= Date.now() ? 'now' : ''}">${l.due <= Date.now() ? 'Dags nu' : 'om ' + Math.max(1, Math.round((l.due - Date.now()) / 864e5)) + ' d'}</span></li>`)}</ul>
    </section>
    <section class="block">
      <div class="block-head"><h2>Öva huvudlinjer</h2></div>
      <p class="muted">Botten spelar motståndarens drag ur öppningsboken. Du hittar dina egna.</p>
      <div class="grid openings">${CURATED.map(([name, color], i) => { const ln = lineFor(op, name); if (!ln) return ''; const best = practice[name] || 0; return h`<button class="tile op" data-i="${i}"><span class="eco">${ln[0]}</span><b>${name.replace(':', ': ')}</b><small>${color === 'white' ? 'Du spelar vit' : 'Du spelar svart'} · ${Math.ceil(ln[2].split(' ').length / 2)} drag${best ? ' · ✓ ' + best + ' gånger' : ''}</small></button>`; })}</div>
    </section>
    <section class="block">
      <div class="block-head"><h2>Dina öppningar</h2></div>
      ${statRows.length ? h`<table class="stats"><thead><tr><th>Öppning</th><th>Färg</th><th>V</th><th>R</th><th>F</th></tr></thead><tbody>${statRows.map((s) => h`<tr><td>${s.name}</td><td>${s.color === 'white' ? 'Vit' : 'Svart'}</td><td>${s.w}</td><td>${s.d}</td><td>${s.l}</td></tr>`)}</tbody></table>` : h`<p class="muted">Spela några vanliga partier så syns vilka öppningar du hamnar i och hur det går.</p>`}
    </section>`);
  const toItems = (list) => list.map((l) => ({ fen: l.fen, variant: 'standard', color: l.color, best: l.best, bestSan: l.bestSan, played: l.played, playedSan: l.playedSan, title: l.opening, epd: l.epd, lesson: true }));
  const dd = $('drillDue'); if (dd) dd.onclick = () => startDrill(toItems(due), { title: 'Repetera öppningsmisstag' });
  const da = $('drillAll'); if (da) da.onclick = () => startDrill(toItems(all), { title: 'Alla öppningsmisstag' });
  page.querySelectorAll('.tile.op').forEach((b) => (b.onclick = () => {
    const [name, color] = CURATED[+b.dataset.i];
    const ln = lineFor(op, name);
    showBoard(new OpeningMode(name, ln, color));
  }));
});

// ---------- Drill: hitta bättre drag ----------
export function startDrill(items, opts = {}) {
  if (!items.length) { toast('Inget att öva på just nu.'); return; }
  showBoard(new DrillMode(items, opts));
}
class DrillMode {
  constructor(items, opts) { this.kind = 'drill'; this.tab = opts.from === 'analysis' ? 'history' : 'training'; this.items = items; this.opts = opts; this.i = 0; this.score = 0; this.token = 0; }
  enter() {
    const b = ui.board;
    b.h.onMove = (f, t) => this.onMove(f, t); b.h.onDrop = null; b.h.onIdleClick = null;
    setHTML(side(), h`<div class="card"><div class="ana-head"><h3>${this.opts.title || 'Övning'}</h3><button class="btn sm" id="drBack">Avsluta</button></div>
      <div class="meta" id="drCount"></div><div class="prog"><i id="drProg"></i></div>
      <div class="task" id="drTask"></div><div class="feedback" id="drFb" aria-live="polite"></div>
      <div class="controls"><button class="btn" id="drHint">Visa svaret</button><button class="btn" id="drRetry">Försök igen</button><button class="btn primary" id="drNext">Nästa</button></div></div>`);
    $('drBack').onclick = () => this.exit();
    $('drHint').onclick = () => this.reveal();
    $('drRetry').onclick = () => this.load();
    $('drNext').onclick = () => this.next();
    this.load();
  }
  leave() { this.token++; stopAll(); }
  get item() { return this.items[this.i]; }
  load() {
    const it = this.item;
    this.game = new Game(it.variant || 'standard', it.fen);
    this.state = 'ask';
    ui.board.setOrientation(it.color);
    this.show();
    $('drCount').textContent = `${this.i + 1} av ${this.items.length} · ${this.score} rätt`;
    $('drProg').style.width = (this.i / this.items.length) * 100 + '%';
    setHTML($('drTask'), h`<b>${it.title}</b><p>${it.playedSan ? h`Här spelade du <s>${it.playedSan}</s>. ` : ''}Hitta ett bättre drag för ${it.color === 'white' ? 'vit' : 'svart'}.</p>`);
    $('drFb').textContent = ''; $('drFb').className = 'feedback';
    $('drNext').disabled = true; $('drRetry').disabled = true; $('drHint').disabled = false;
    setStatus('Din tur');
    setTimeout(() => ui.board.focusDefault(), 200);
  }
  show(marks = {}, arrows = []) {
    const g = this.game, pos = g.pos, last = g.moves[g.ply - 1];
    ui.board.set({ pos, lastMove: last ? { from: last.from, to: last.to } : null, check: pos.isCheck() ? g.kingSquare(pos.turn) : null, movable: this.state === 'ask' ? this.item.color : null, dests: g.dests(), dropDests: [], marks });
    ui.board.arrows(arrows);
    setEval(null);
    setStrips('', '');
  }
  async onMove(from, to) {
    if (this.state !== 'ask') return;
    const e = this.game.dests().get(from)?.find((x) => x.to === to);
    if (!e) return;
    let mv = e.moves[0];
    if (e.moves.length > 1) { const r = await ui.board.promote(this.item.color, to, e.moves.map((m) => m.promotion)); if (!r) return this.show(); mv = e.moves.find((m) => m.promotion === r); }
    const it = this.item, startPly = 0;
    const rec = this.game.play(mv);
    this.state = 'check';
    this.show();
    let ok = sameMove(this.game, startPly, it.best, rec.uci);
    if (!ok && it.played && sameMove(this.game, startPly, it.played, rec.uci)) ok = false;
    else if (!ok && SF.ok) {
      setStatus('Kollar draget…');
      const my = ++this.token;
      const g0 = new Game(it.variant || 'standard', it.fen);
      const [r0, r1] = [await search(g0, 0, { depth: 13, movetime: 400 }), await search(this.game, 1, { depth: 13, movetime: 400 })];
      if (my !== this.token) return;
      const before = r0.lines[0] ? r0.lines[0].cp : 0, after = r1.lines[0] ? -r1.lines[0].cp : 0;
      ok = winPct(before) - winPct(after) < 4;
    }
    this.result(ok, rec);
  }
  result(ok, rec) {
    const it = this.item, fb = $('drFb');
    if (ok) {
      this.score++; sfx.good();
      fb.className = 'feedback good';
      fb.textContent = sameMove(this.game, 0, it.best, rec.uci) ? `Rätt! ${it.bestSan} är bästa draget.` : `Bra! ${rec.san} håller också. Motorns förstaval var ${it.bestSan}.`;
      this.show({ [rec.to]: 'good' });
      setStatus('Snyggt');
    } else {
      sfx.bad();
      fb.className = 'feedback bad';
      fb.textContent = `Inte riktigt. ${rec.san} tappar för mycket. Försök igen eller visa svaret.`;
      this.show({ [rec.to]: 'bad' });
      setStatus('');
    }
    if (it.lesson) gradeLesson(it.epd, ok);
    this.state = 'done';
    $('drNext').disabled = false; $('drRetry').disabled = ok; $('drHint').disabled = ok;
    $('drCount').textContent = `${this.i + 1} av ${this.items.length} · ${this.score} rätt`;
    $(ok ? 'drNext' : 'drRetry').focus();
  }
  reveal() {
    const it = this.item;
    this.game = new Game(it.variant || 'standard', it.fen);
    this.state = 'done';
    const sq = this.game.uciToSquares(it.best);
    this.show({}, sq ? [sq] : []);
    $('drFb').className = 'feedback'; $('drFb').textContent = `Svaret är ${it.bestSan} (grön pil).`;
    if (it.lesson) gradeLesson(it.epd, false);
    $('drNext').disabled = false; $('drRetry').disabled = false; $('drNext').focus();
  }
  next() {
    if (this.i + 1 >= this.items.length) {
      setHTML($('drTask'), h`<b>Klart!</b><p>${this.score} av ${this.items.length} rätt.</p>`);
      $('drFb').textContent = ''; $('drNext').disabled = true; $('drRetry').disabled = true; $('drHint').disabled = true;
      $('drProg').style.width = '100%';
      if (this.score === this.items.length) sfx.win();
      $('drBack').focus();
      return;
    }
    this.i++; this.load();
  }
  exit() { this.token++; stopAll(); if (this.opts.back) this.opts.back(); else showPage('training'); }
  tvKey(k) { if (k === 'green') this.reveal(); else if (k === 'red') this.next(); else if (k === 'yellow') this.load(); }
  back() { if (ui.board.deselect()) return true; this.exit(); return true; }
}

// ---------- Öva en öppnings huvudlinje ----------
class OpeningMode {
  constructor(name, line, color) { this.kind = 'drill'; this.tab = 'training'; this.name = name; this.line = line; this.ucis = line[2].split(' '); this.color = color; this.token = 0; }
  enter() {
    const b = ui.board;
    b.h.onMove = (f, t) => this.onMove(f, t); b.h.onDrop = null; b.h.onIdleClick = null;
    b.setOrientation(this.color);
    setHTML(side(), h`<div class="card"><div class="ana-head"><h3>Öppningsträning</h3><button class="btn sm" id="opBack">Tillbaka</button></div>
      <div class="opening"><span class="eco">${this.line[0]}</span> ${this.name}</div>
      <p class="muted">Du spelar ${this.color === 'white' ? 'vit' : 'svart'}. Spela huvudlinjens drag. Motståndaren svarar ur boken.</p>
      <ol class="moves" id="opMoves"></ol><div class="feedback" id="opFb" aria-live="polite"></div>
      <div class="controls"><button class="btn" id="opHint">Visa draget</button><button class="btn primary" id="opRestart">Börja om</button></div></div>`);
    $('opBack').onclick = () => showPage('training');
    $('opHint').onclick = () => this.hint();
    $('opRestart').onclick = () => this.restart();
    this.restart();
  }
  leave() { this.token++; }
  async restart() {
    this.game = new Game('standard'); this.mistakes = 0; this.done = false;
    $('opFb').textContent = ''; $('opFb').className = 'feedback';
    this.show();
    await this.autoplay();
  }
  async autoplay() {
    const my = ++this.token;
    while (this.game.ply < this.ucis.length && this.game.turn !== this.color) {
      await sleep(450);
      if (my !== this.token) return;
      const rec = this.game.playUci(this.ucis[this.game.ply]);
      sfx.move(); this.show(rec);
    }
    if (this.game.ply >= this.ucis.length) this.finish();
    else { setStatus('Din tur'); ui.board.focusDefault(); }
  }
  show(rec, marks = {}, arrows = []) {
    const g = this.game, last = g.moves[g.ply - 1];
    ui.board.set({ pos: g.pos, lastMove: last ? { from: last.from, to: last.to } : null, check: null, movable: !this.done && g.turn === this.color ? this.color : null, dests: g.dests(), dropDests: [], marks, animate: rec && rec.from ? { from: rec.from, to: rec.to } : null });
    ui.board.arrows(arrows);
    setEval(null); setStrips('', '');
    const el = $('opMoves');
    if (el) { let o = '', n = 1; g.moves.forEach((m, i) => { if (m.color === 'white') o += `<li><span class="n">${n}.</span>`; o += `<button class="mv" disabled>${m.san}</button>`; if (m.color === 'black') { o += '</li>'; n++; } }); el.innerHTML = o; }
  }
  async onMove(from, to) {
    const e = this.game.dests().get(from)?.find((x) => x.to === to);
    if (!e) return;
    const want = this.ucis[this.game.ply];
    const mv = e.moves.find((m) => !m.promotion || m.promotion === 'queen');
    const g2 = this.game.clone();
    const rec = g2.play(mv);
    if (rec && sameMove(this.game, this.game.ply, want, rec.uci)) {
      const r = this.game.play(mv);
      sfx.move(); $('opFb').textContent = ''; this.show(r, { [r.to]: 'good' });
      await this.autoplay();
    } else {
      this.mistakes++; sfx.bad();
      $('opFb').className = 'feedback bad';
      $('opFb').textContent = `${rec ? rec.san : 'Det draget'} är inte huvudlinjen här. Försök igen.`;
      this.show(null, { [to]: 'bad' });
    }
  }
  hint() {
    if (this.done) return;
    const want = this.ucis[this.game.ply];
    const sq = this.game.uciToSquares(want);
    this.mistakes++;
    $('opFb').className = 'feedback'; $('opFb').textContent = 'Huvudlinjen fortsätter med ' + this.game.sanOf(want) + '.';
    this.show(null, {}, sq ? [sq] : []);
  }
  finish() {
    this.done = true;
    this.show();
    const fb = $('opFb');
    if (!this.mistakes) { practice[this.name] = (practice[this.name] || 0) + 1; lsSet('sc2-openprac', practice); sfx.win(); fb.className = 'feedback good'; fb.textContent = 'Felfritt! Hela huvudlinjen sitter.'; }
    else { sfx.good(); fb.className = 'feedback'; fb.textContent = `Klart, med ${this.mistakes} miss${this.mistakes > 1 ? 'ar' : ''}. Kör en gång till utan fel.`; }
    setStatus('Linjen är slut');
    $('opRestart').focus();
  }
  tvKey(k) { if (k === 'green') this.hint(); else if (k === 'red') this.restart(); }
  back() { if (ui.board.deselect()) return true; showPage('training'); return true; }
}
