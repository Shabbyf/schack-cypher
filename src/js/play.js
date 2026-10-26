// Ett parti mot en bot: drag, botens svar, andra chansen efter blunder,
// varning vid upprepade öppningsmisstag, slutresultat, rating och karriär.
import { Game, variantOf, other } from './rules.js';
import { botById, chooseMove, BOTS, DRAW_LINES, THINK } from './bots.js';
import { SF, search, stopAll } from './engine.js';
import { profile, settings, saveProfile, addGame, applyGameRating } from './store.js';
import { sfx, beat, speak } from './audio.js';
import { ui, showBoard, showPage, side, setEval, setStatus, setStrips, say, playerStrip, confetti, toast, updateChips } from './ui.js';
import { loadOpenings, openingOf } from './data.js';
import { lessonFor, markRepeated, scanOpening, sameMove } from './lessons.js';
import { pieceHTML } from './board.js';
import { $, pick, winPct, h, setHTML, sleep } from './util.js';
import { openAnalysis } from './analysis.js';

const REASON = {
  checkmate: 'Schackmatt', stalemate: 'Patt', insufficient: 'För lite material', fifty: '50-dragsregeln',
  repetition: 'Trefaldig upprepning', resign: 'Uppgivet',
};
function variantReason(v, winner) {
  return { kingofthehill: 'Kungen nådde mitten', threecheck: 'Tredje schacken', racingkings: 'Kungen nådde åttonde raden', atomic: 'Kungen exploderade', antichess: winner ? 'Alla pjäser borta' : 'Remi', horde: 'Horden är besegrad' }[v] || 'Partiet är slut';
}

let ops = null;
loadOpenings().then((o) => (ops = o));

export function newGame(cfg) {
  const rating = profile.rating;
  const bot = botById(cfg.botId, rating);
  const color = cfg.color === 'random' || !cfg.color ? (Math.random() < 0.5 ? 'white' : 'black') : cfg.color;
  const variant = variantOf(cfg.variant || 'standard');
  const rated = !!cfg.rated && (variant.id === 'standard' || variant.id === 'chess960');
  const game = cfg.game || new Game(variant.id, cfg.startFen || null, { sp: cfg.sp });
  const mode = new PlayMode({ ...cfg, bot, color, rated, game, variant });
  showBoard(mode);
  return mode;
}

class PlayMode {
  constructor(cfg) {
    this.cfg = cfg;
    this.kind = 'play';
    this.tab = cfg.career ? 'career' : 'home';
    this.game = cfg.game; this.bot = cfg.bot; this.color = cfg.color; this.rated = cfg.rated;
    this.ended = false; this.thinking = false; this.token = 0; this.white = 0; this.hint = null;
    this.view = null; // ply som visas när man bläddrar
    this.chances = settings.secondChance && !this.rated ? 3 : 0;
    this.pre = null; this.opening = null; this.result = null;
    this.id = Date.now();
  }
  get sfOk() { return this.game.variant.engine === 'sf' && SF.ok; }
  enter() {
    const b = ui.board;
    b.h.onMove = (f, t) => this.onMove(f, t);
    b.h.onDrop = (r, t) => this.onDrop(r, t);
    b.h.onIdleClick = null;
    b.setOrientation(this.color);
    this.renderSide();
    this.sync(false);
    say($('bubble'), pick(this.bot.lines.intro), this.bot.voice);
    if (settings.music) { beat.start(); beat.setTension(1); }
    if (this.game.turn !== this.color && !this.game.outcome()) this.botTurn();
    else { this.prepareCheck(); setTimeout(() => ui.board.focusDefault(), 250); }
  }
  leave() { this.token++; stopAll(); beat.stop(); }

  // ---------- rendering ----------
  sync(animate = true) {
    const g = this.game, ply = this.view ?? g.ply;
    const pos = g.posAt(ply);
    const last = ply > 0 ? g.moves[ply - 1] : null;
    const live = this.view === null;
    ui.board.set({
      pos, lastMove: last ? { from: last.from || last.to, to: last.to } : null,
      check: pos.isCheck() ? g.kingSquare(pos.turn, pos) : null,
      movable: live && !this.ended && !this.thinking && pos.turn === this.color ? this.color : null,
      dests: live ? g.dests(pos) : new Map(), dropDests: live ? g.dropDests(pos) : [], marks: {},
      animate: animate && last && last.from ? { from: last.from, to: last.to } : null,
    });
    ui.board.arrows(live && this.hint ? [{ from: this.hint.from, to: this.hint.to }] : []);
    this.renderStrips(pos);
    setEval(this.sfOk || this.game.variant.engine === 'js' ? (live ? this.white : null) : null);
    if (settings.music) beat.setTension(1 - Math.abs(winPct(this.white) - 50) / 50);
    this.renderMoves();
    this.renderControls();
    if (this.ended) setStatus(this.result ? this.result.title : 'Partiet är slut');
    else if (!live) setStatus('Du tittar på drag ' + Math.ceil(ply / 2) + '. Tryck ▶| för att gå tillbaka till partiet.');
    else if (this.thinking) setStatus(this.bot.name + ' tänker…');
    else setStatus(g.turn === this.color ? 'Din tur' + (pos.isCheck() ? ', du står i schack!' : '') : '', 'turn');
  }
  renderStrips(pos) {
    const { diff, score } = this.game.material();
    const mat = (c) => diff[c].map((r) => pieceHTML(other(c), r)).join('') + ((c === 'white' ? score : -score) > 0 ? `<em>+${Math.abs(score)}</em>` : '');
    const pocketVariant = !!pos.pockets;
    const checks = pos.remainingChecks ? (c) => ` · ${3 - pos.remainingChecks[c]} schack` : () => '';
    const oc = other(this.color);
    setStrips(
      playerStrip({ name: this.bot.name, sub: `≈${this.bot.elo}${checks(oc)}`, badge: true, color: this.bot.color, mono: this.bot.mono, material: pocketVariant ? '' : mat(oc), active: pos.turn === oc && !this.ended }),
      playerStrip({ name: 'Du', sub: `${this.rated ? 'Rankad · ' : ''}${profile.rating}${profile.ratedGames < 10 ? '?' : ''}${checks(this.color)}`, material: pocketVariant ? '' : mat(this.color), active: pos.turn === this.color && !this.ended }),
    );
  }
  renderSide() {
    const v = this.game.variant;
    setHTML(side(), h`
      <div class="card opp">
        <div class="opp-head"><span class="badge" style="background:${this.bot.color}">${this.bot.mono}</span>
          <div><h3>${this.bot.name}</h3><div class="meta">≈<span class="mono">${this.bot.elo}</span> · ${this.bot.style}</div></div></div>
        <div class="bubble" id="bubble" aria-live="polite">…</div>
      </div>
      <div class="card">
        <div class="game-meta"><span class="tag">${v.name}</span><span class="tag ${this.rated ? 'rated' : ''}">${this.rated ? 'Rankad' : 'Vänskap'}</span>${this.cfg.career ? h`<span class="tag gold">Karriär</span>` : ''}${this.game.sp !== undefined ? h`<span class="tag">Nr ${this.game.sp}</span>` : ''}${this.chances ? h`<span class="tag" id="chanceTag">Andra chans: ${this.chances}</span>` : ''}</div>
        <div class="opening" id="openingName"></div>
        <ol class="moves" id="moves"></ol>
        <div class="nav-row" id="navRow">
          <button class="btn sm" data-nav="first" aria-label="Första draget">|◀</button><button class="btn sm" data-nav="prev" aria-label="Föregående">◀</button><button class="btn sm" data-nav="next" aria-label="Nästa">▶</button><button class="btn sm" data-nav="last" aria-label="Tillbaka till partiet">▶|</button>
        </div>
      </div>
      <div class="controls" id="controls">
        <button class="btn" id="hintBtn">Tips <kbd class="ck g"></kbd></button>
        <button class="btn" id="undoBtn">Ångra</button>
        <button class="btn" id="flipBtn">Vänd brädet</button>
        <button class="btn" id="resignBtn">Ge upp</button>
        <button class="btn" id="anaBtn">Analysera <kbd class="ck b"></kbd></button>
        <button class="btn primary" id="newBtn">Ny match <kbd class="ck r"></kbd></button>
      </div>`);
    $('hintBtn').onclick = () => this.showHint();
    $('undoBtn').onclick = () => this.undo();
    $('flipBtn').onclick = () => { ui.board.setOrientation(other(ui.board.orientation)); this.sync(false); };
    $('resignBtn').onclick = () => this.resign();
    $('anaBtn').onclick = () => this.analyse();
    $('newBtn').onclick = () => this.rematch();
    side().querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => this.nav(b.dataset.nav)));
  }
  renderMoves() {
    const el = $('moves'); if (!el) return;
    const ms = this.game.moves, cur = this.view ?? ms.length;
    if (!ms.length) { el.innerHTML = '<li class="empty">Inga drag än. Första baren är din.</li>'; }
    else {
      let out = '', start = ms[0].color === 'black' ? 1 : 0, n = this.game.posAt(0).fullmoves;
      if (start) out += `<li><span class="n">${n}.</span><button class="mv" disabled>…</button>`;
      ms.forEach((m, i) => {
        if (m.color === 'white') out += `<li><span class="n">${n}.</span>`;
        out += `<button class="mv${cur === i + 1 ? ' cur' : ''}" data-i="${i + 1}">${m.san}</button>`;
        if (m.color === 'black') { out += '</li>'; n++; }
      });
      el.innerHTML = out;
      el.querySelectorAll('.mv[data-i]').forEach((b) => (b.onclick = () => { this.view = +b.dataset.i === this.game.ply ? null : +b.dataset.i; this.sync(false); }));
      const c = el.querySelector('.cur');
      if (c) el.scrollTop = Math.max(0, c.offsetTop - el.clientHeight / 2);
    }
    const on = $('openingName');
    if (on) {
      this.opening = settings.showOpening ? openingOf(ops, this.game) : null;
      on.innerHTML = this.opening ? `<span class="eco">${this.opening.eco}</span> ${this.opening.name}` : '';
    }
  }
  renderControls() {
    const c = $('controls'); if (!c) return;
    const myTurn = this.game.turn === this.color && !this.thinking && !this.ended && this.view === null;
    $('hintBtn').disabled = this.rated || !myTurn;
    $('hintBtn').title = this.rated ? 'Inga tips i rankade partier' : '';
    $('undoBtn').disabled = this.rated || this.thinking || this.game.ply < 1 || (this.ended && this.rated);
    $('resignBtn').disabled = this.ended || this.game.ply < 2;
    $('anaBtn').disabled = this.thinking || this.game.ply < 1 || !(this.game.variant.engine === 'sf');
    $('newBtn').textContent = this.ended ? 'Rematch' : 'Ny match';
    const ct = $('chanceTag'); if (ct) ct.textContent = 'Andra chans: ' + this.chances;
  }
  nav(d) {
    const max = this.game.ply, cur = this.view ?? max;
    const to = { first: 0, prev: cur - 1, next: cur + 1, last: max }[d];
    this.view = Math.max(0, Math.min(max, to));
    if (this.view === max) this.view = null;
    this.sync(false);
  }

  // ---------- drag ----------
  async onMove(from, to) {
    if (this.view !== null || this.thinking || this.ended) return;
    const list = this.game.dests().get(from);
    const e = list && list.find((x) => x.to === to);
    if (!e) return;
    let mv = e.moves[0];
    if (e.moves.length > 1 && e.moves[0].promotion) {
      const role = await ui.board.promote(this.color, to, e.moves.map((m) => m.promotion));
      if (!role) { this.sync(false); return; }
      mv = e.moves.find((m) => m.promotion === role);
    }
    this.playerMove(mv);
  }
  onDrop(role, to) {
    if (this.view !== null || this.thinking || this.ended) return;
    const mv = this.game.parseUci({ pawn: 'P', knight: 'N', bishop: 'B', rook: 'R', queen: 'Q' }[role] + '@' + to);
    if (mv) this.playerMove(mv);
  }
  async playerMove(mv) {
    const before = this.game.ply;
    const rec = this.game.play(mv);
    if (!rec) return;
    this.hint = null;
    this.feedback(rec, false);
    if (await this.checkEnd()) return;
    this.sync(true);
    const my = ++this.token;
    // Upprepat öppningsmisstag?
    const lesson = this.game.variant.id === 'standard' ? lessonFor(this.game.epd(before)) : null;
    if (lesson && sameMove(this.game, before, lesson.played, rec.uci)) {
      markRepeated(lesson.epd);
      say($('bubble'), `Samma misstag som sist i ${lesson.opening}! Bättre var ${lesson.bestSan}.`, this.bot.voice);
      if (this.chances > 0) {
        const take = await this.offerChance(`Det här draget har du spelat förut, och då var ${lesson.bestSan} bättre.`, my);
        if (take === null) return;
        if (take) return;
      }
    } else if (this.chances > 0 && this.sfOk) {
      // Andra chansen: jämför med värderingen innan draget.
      const pre = this.pre && this.pre.ply === before ? this.pre : null;
      if (pre) {
        setStatus('Kollar draget…');
        const r = await search(this.game, this.game.ply, { depth: 12, movetime: 350 });
        if (my !== this.token) return;
        const after = r.lines[0] ? -r.lines[0].cp : 0; // från spelarens sida
        const drop = winPct(pre.cp) - winPct(after);
        if (drop >= 30 && !sameMove(this.game, before, pre.best, rec.uci)) {
          const take = await this.offerChance('Det där var ett blunder. Vill du ta tillbaka draget och hitta något bättre?', my);
          if (take === null || take) return;
        }
      }
    }
    if (my !== this.token) return;
    this.botTurn();
  }
  // Visar frågan om andra chans. true = tog tillbaka, false = spela vidare, null = avbrutet.
  offerChance(text, my) {
    return new Promise((resolve) => {
      const o = ui.board.showOverlay(`<div class="result chance"><h2>Aj!</h2><p>${text}</p><div class="row"><button class="btn primary" data-a="take">Ta tillbaka (${this.chances} kvar)</button><button class="btn" data-a="go">Spela vidare</button></div></div>`);
      sfx.bad();
      o.querySelector('button').focus();
      o.querySelectorAll('button').forEach((b) => (b.onclick = () => {
        ui.board.hideOverlay();
        if (my !== this.token) return resolve(null);
        if (b.dataset.a === 'take') {
          this.chances--;
          this.game.undo();
          this.white = this.pre ? (this.color === 'white' ? this.pre.cp : -this.pre.cp) : this.white;
          say($('bubble'), pick(['Okej, ta om. Jag väntar.', 'Ingen såg det. Kör igen.', 'Spola tillbaka tapen.']), this.bot.voice);
          this.sync(false);
          ui.board.focusDefault();
          resolve(true);
        } else resolve(false);
      }));
    });
  }
  // Snabb värdering medan spelaren tänker, så att andra chansen kan jämföra.
  async prepareCheck() {
    if (!this.chances || !this.sfOk || this.ended) return;
    const ply = this.game.ply, my = this.token;
    const r = await search(this.game, ply, { depth: 12, movetime: 350 });
    if (my !== this.token || this.game.ply !== ply) return;
    this.pre = { ply, cp: r.lines[0] ? r.lines[0].cp : 0, best: r.best };
  }
  feedback(rec, byBot) {
    if (rec.check) sfx.check(); else if (rec.captured) sfx.capture(); else sfx.move();
    if (byBot) {
      if (rec.check && Math.random() < 0.8) say($('bubble'), pick(this.bot.lines.check), this.bot.voice);
      else if (rec.captured && Math.random() < 0.6) say($('bubble'), pick(this.bot.lines.botCapture), this.bot.voice);
    } else if (rec.captured && Math.random() < 0.6) say($('bubble'), pick(this.bot.lines.playerCapture), this.bot.voice);
  }
  async botTurn() {
    this.thinking = true; this.view = null;
    this.sync(false);
    if (Math.random() < 0.15) say($('bubble'), pick(THINK));
    const my = ++this.token, t0 = performance.now();
    await SF.ready;
    if (my !== this.token) return;
    let ch = null;
    try { ch = await chooseMove(this.game, this.bot); } catch (e) { console.error(e); }
    if (my !== this.token) return;
    await sleep(Math.max(0, 450 - (performance.now() - t0)));
    if (my !== this.token) return;
    this.thinking = false;
    let rec = null;
    if (ch) {
      if (ch.white !== null && ch.white !== undefined) this.white = ch.white;
      rec = ch.move ? this.game.play(ch.move) : ch.uci ? this.game.playUci(ch.uci) : null;
    }
    if (!rec) { const lm = this.game.legalMoves(); if (lm.length) rec = this.game.play(lm[Math.floor(Math.random() * lm.length)]); }
    if (!rec) { this.sync(false); return; }
    this.feedback(rec, true);
    if (await this.checkEnd()) return;
    this.sync(true);
    this.prepareCheck();
    if (document.documentElement.classList.contains('tv')) ui.board.focusDefault();
  }

  // ---------- slut ----------
  async checkEnd() {
    const o = this.game.outcome();
    if (!o) return false;
    this.finish(o.winner, o.reason === 'variant' ? variantReason(this.game.variant.id, o.winner) : REASON[o.reason]);
    return true;
  }
  resign() {
    if (this.ended) return;
    this.token++; stopAll();
    this.thinking = false;
    this.finish(other(this.color), REASON.resign);
  }
  finish(winner, reason) {
    this.ended = true; this.thinking = false; this.token++;
    const res = winner === this.color ? 'w' : winner ? 'l' : 'd';
    if (winner) this.white = winner === 'white' ? 10000 : -10000; else this.white = 0;
    const b = this.bot;
    const rec = profile.rec[b.id] || (profile.rec[b.id] = { w: 0, l: 0, d: 0 });
    rec[res]++;
    let delta = null, unlocked = null;
    if (this.rated) delta = applyGameRating(b.elo, res === 'w' ? 1 : res === 'd' ? 0.5 : 0);
    if (this.cfg.career && res === 'w' && !profile.career.beaten[b.id]) {
      profile.career.beaten[b.id] = Date.now();
      const i = BOTS.findIndex((x) => x.id === b.id);
      unlocked = BOTS[i + 1] || null;
      if (!unlocked) profile.career.title = 'Legend';
    }
    saveProfile(); updateChips();
    const title = res === 'w' ? 'Du vann battlet!' : res === 'l' ? b.name + ' tar bältet' : 'Remi';
    const line = res === 'w' ? pick(b.lines.playerWin) : res === 'l' ? pick(b.lines.botWin) : pick(DRAW_LINES);
    this.result = { title: title + ' · ' + reason };
    const g = this.game;
    const record = {
      id: this.id, date: Date.now(), variant: g.variant.id, startFen: g.startFen, sp: g.sp, moves: g.moves.map((m) => m.uci),
      bot: b.id, botName: b.name, botElo: b.elo, color: this.color, result: res, reason, rated: this.rated, delta,
      career: !!this.cfg.career, plies: g.ply, opening: this.opening ? this.opening.name : null, eco: this.opening ? this.opening.eco : null,
    };
    addGame(record);
    this.record = record;
    say($('bubble'), line, b.voice);
    if (res === 'w') { sfx.win(); confetti(); }
    this.sync(false);
    const dTxt = delta === null ? '' : `<p class="delta ${delta >= 0 ? 'up' : 'down'}">Rating ${profile.rating} (${delta >= 0 ? '+' : ''}${delta})</p>`;
    const uTxt = unlocked ? `<p class="unlock">Ny motståndare upplåst: <b>${unlocked.name}</b></p>` : this.cfg.career && res === 'w' && !unlocked ? '<p class="unlock">Du har slagit hela listan. Du är Legend!</p>' : '';
    const o = ui.board.showOverlay(`<div class="result"><h2>${title}</h2><p>${reason}. ${res === 'd' ? '' : `Facit mot ${b.name}: ${rec.w} vinster, ${rec.l} förluster, ${rec.d} remi.`}</p>${dTxt}${uTxt}<div class="row">${unlocked ? '<button class="btn primary" data-a="next">Nästa i karriären</button>' : ''}<button class="btn ${unlocked ? '' : 'primary'}" data-a="again">Rematch</button>${g.variant.engine === 'sf' ? '<button class="btn" data-a="ana">Analysera</button>' : ''}<button class="btn" data-a="close">Visa brädet</button></div></div>`);
    o.querySelector('button').focus();
    o.querySelectorAll('button').forEach((x) => (x.onclick = () => {
      const a = x.dataset.a;
      ui.board.hideOverlay();
      if (a === 'next') newGame({ ...this.cfg, botId: unlocked.id, color: 'random', game: null });
      else if (a === 'again') this.rematch();
      else if (a === 'ana') this.analyse();
    }));
    // Spara öppningsmisstag i bakgrunden.
    if (g.variant.id === 'standard') {
      const id = this.id;
      scanOpening(g, this.color, () => ui.mode === this || (ui.mode && ui.mode.kind !== 'analysis')).then((n) => { if (n && ui.mode === this && this.id === id) toast(n === 1 ? 'Ett öppningsmisstag sparat i Träning.' : n + ' öppningsmisstag sparade i Träning.'); });
    }
  }
  rematch() {
    this.token++; stopAll();
    newGame({ ...this.cfg, color: other(this.color), game: null });
  }
  analyse() {
    this.token++; stopAll();
    const g = this.game;
    const rec = this.record || { id: null, variant: g.variant.id, startFen: g.startFen, moves: g.moves.map((m) => m.uci), bot: this.bot.id, botName: this.bot.name, color: this.color, result: null };
    openAnalysis(rec, { back: () => showBoard(this) });
  }
  undo() {
    if (this.rated || this.thinking) return;
    this.token++; stopAll();
    if (this.ended) { this.ended = false; this.result = null; ui.board.hideOverlay(); }
    this.game.undo();
    if (this.game.turn !== this.color && this.game.ply) this.game.undo();
    this.hint = null; this.view = null;
    this.sync(false);
    if (this.game.turn !== this.color) this.botTurn(); else this.prepareCheck();
  }
  async showHint() {
    if (this.rated || this.thinking || this.ended || this.game.turn !== this.color) return;
    const my = this.token;
    setStatus('Letar efter bästa draget…');
    const r = await search(this.game, this.game.ply, { depth: 16, movetime: 900, jsDepth: 4 });
    if (my !== this.token || !r.best) return this.sync(false);
    const sq = this.game.uciToSquares(r.best);
    this.hint = sq;
    if (r.lines[0]) this.white = this.game.turn === 'white' ? r.lines[0].cp : -r.lines[0].cp;
    say($('bubble'), 'Kolla ' + this.game.sanOf(r.best) + '. Men säg inte att du fick det av mig.', this.bot.voice);
    this.sync(false);
  }
  // ---------- TV ----------
  tvKey(k) {
    if (k === 'red') { if (this.ended) this.rematch(); else newGame({ ...this.cfg, game: null }); }
    else if (k === 'green') this.showHint();
    else if (k === 'yellow') { ui.board.setOrientation(other(ui.board.orientation)); this.sync(false); }
    else if (k === 'blue') this.analyse();
  }
  back() {
    if (ui.board.overlayOpen) { if (ui.board.cancelPromo) ui.board.cancelPromo(); ui.board.hideOverlay(); return true; }
    if (ui.board.deselect()) return true;
    if (this.view !== null) { this.view = null; this.sync(false); return true; }
    return false;
  }
  get returnTo() { return this.cfg.career ? 'career' : 'home'; }
}
