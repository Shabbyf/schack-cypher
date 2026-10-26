// Sidorna utanför brädet: Spela (lobby), Karriär, Partier och Inställningar.
import { VARIANTS, variantOf, Game } from './rules.js';
import { BOTS, TIERS, tierOf, mirrorBot } from './bots.js';
import { SF, bench } from './engine.js';
import { profile, settings, saveSettings, games, saveGames, resetProgress } from './store.js';
import { beat, speak, sfx } from './audio.js';
import { ui, registerPage, showPage, modal, closeModal, toast, updateChips } from './ui.js';
import { BOARD_THEMES, PIECE_SETS, applyPieceSet, pieceHTML } from './board.js';
import { newGame } from './play.js';
import { openAnalysis } from './analysis.js';
import { startPuzzles } from './puzzles.js';
import { startDrill } from './training.js';
import { dueLessons } from './lessons.js';
import { showPgn, exportAll } from './pgn.js';
import { appVersion, checkForUpdate, isAndroid, deviceInfo } from './update.js';
import { h, setHTML, $, fmtDate, ls, lsSet, todayKey } from './util.js';

const lobby = Object.assign({ variant: 'standard', bot: 'spegel', color: 'random', rated: true }, ls('sc2-lobby', {}));
const saveLobby = () => lsSet('sc2-lobby', lobby);

function nextCareerBot() { return BOTS.find((b) => !profile.career.beaten[b.id]) || null; }

// ---------- Spela ----------
registerPage('home', (page) => {
  const nb = nextCareerBot();
  const due = dueLessons().length;
  const daily = profile.daily[todayKey()];
  const v = variantOf(lobby.variant);
  const canRate = v.id === 'standard' || v.id === 'chess960';
  setHTML(page, h`
    <section class="hero">
      <div><h1>Välkommen till cyphern</h1><p>Spela mot elva botar med egen stil, lös pussel från Lichess och träna dina öppningar. Din rating är <b>${profile.rating}${profile.ratedGames < 10 ? '?' : ''}</b>.</p></div>
    </section>
    <section class="grid modes">
      <button class="tile big" id="qMirror"><span class="ti">◐</span><b>Snabbmatch</b><small>MC Spegel, ≈${mirrorBot(profile.rating).elo}. Rankad, du och din nivå.</small></button>
      <button class="tile big" id="qCareer"><span class="ti">♛</span><b>Karriär</b><small>${nb ? h`Nästa: ${nb.name} (≈${nb.elo})` : 'Du är Legend. Försvara titeln.'}</small></button>
      <button class="tile big" id="qDaily"><span class="ti">☀</span><b>Dagens pussel</b><small>${daily === 'ok' ? 'Löst idag ✓' : 'Ett nytt varje dag'}</small></button>
      <button class="tile big" id="qLessons" ${due ? '' : 'disabled'}><span class="ti">↻</span><b>Repetera misstag</b><small>${due ? due + ' öppningsställningar väntar' : 'Inget att repetera just nu'}</small></button>
    </section>
    <section class="block">
      <div class="block-head"><h2>Variant</h2></div>
      <div class="grid variants" role="radiogroup" aria-label="Variant">${VARIANTS.map((x) => h`<button class="tile var ${x.id === lobby.variant ? 'on' : ''}" role="radio" aria-checked="${x.id === lobby.variant}" data-v="${x.id}"><span class="ti">${x.icon}</span><b>${x.name}</b><small>${x.desc}</small></button>`)}</div>
    </section>
    <section class="block">
      <div class="block-head"><h2>Motståndare</h2></div>
      <div class="roster">
        <button class="bot ${lobby.bot === 'spegel' ? 'on' : ''}" data-b="spegel"><span class="badge sm" style="background:#9ad0ff">MS</span><span><b>MC Spegel</b><small>≈${mirrorBot(profile.rating).elo} · följer din rating</small></span><span class="rec"></span></button>
        ${TIERS.map(([t]) => h`<div class="tier">${t}</div>${BOTS.filter((b) => tierOf(b.elo) === t).map((b) => { const r = profile.rec[b.id] || { w: 0, l: 0, d: 0 }; return h`<button class="bot ${lobby.bot === b.id ? 'on' : ''}" data-b="${b.id}"><span class="badge sm" style="background:${b.color}">${b.mono}</span><span><b>${b.name}</b><small>≈${b.elo} · ${b.style}</small></span><span class="rec"><em>${r.w}</em>V ${r.l}F ${r.d}R</span></button>`; })}`)}
      </div>
    </section>
    <section class="block start-row">
      <div><h2>Färg</h2><div class="seg" id="segColor">${[['white', 'Vit'], ['random', 'Slumpa'], ['black', 'Svart']].map(([k, l]) => h`<button class="${lobby.color === k ? 'on' : ''}" data-c="${k}">${l}</button>`)}</div></div>
      <div><h2>Läge</h2><div class="seg" id="segRated">${[[true, 'Rankad'], [false, 'Vänskap']].map(([k, l]) => h`<button class="${lobby.rated === k && (canRate || !k) ? 'on' : ''}" data-r="${k}" ${!canRate && k ? 'disabled' : ''}>${l}</button>`)}</div><small class="muted">${canRate ? 'Rankade partier ger rating men inga tips eller ångra.' : 'Varianter spelas alltid som vänskapsmatch.'}</small></div>
      <button class="btn primary huge" id="startBtn">Spela</button>
    </section>`);
  $('qMirror').onclick = () => newGame({ variant: 'standard', botId: 'spegel', color: 'random', rated: true });
  $('qCareer').onclick = () => showPage('career');
  $('qDaily').onclick = () => startPuzzles({ daily: true });
  $('qLessons').onclick = () => { const l = dueLessons(); startDrill(l.map((x) => ({ fen: x.fen, variant: 'standard', color: x.color, best: x.best, bestSan: x.bestSan, played: x.played, playedSan: x.playedSan, title: x.opening, epd: x.epd, lesson: true })), { title: 'Repetera öppningsmisstag' }); };
  page.querySelectorAll('.tile.var').forEach((b) => (b.onclick = () => { lobby.variant = b.dataset.v; if (!['standard', 'chess960'].includes(lobby.variant)) lobby.rated = false; saveLobby(); showPage('home'); page.querySelector(`[data-v="${lobby.variant}"]`)?.focus(); }));
  page.querySelectorAll('.bot').forEach((b) => (b.onclick = () => { lobby.bot = b.dataset.b; saveLobby(); page.querySelectorAll('.bot').forEach((x) => x.classList.toggle('on', x === b)); }));
  page.querySelectorAll('#segColor button').forEach((b) => (b.onclick = () => { lobby.color = b.dataset.c; saveLobby(); page.querySelectorAll('#segColor button').forEach((x) => x.classList.toggle('on', x === b)); }));
  page.querySelectorAll('#segRated button').forEach((b) => (b.onclick = () => { lobby.rated = b.dataset.r === 'true'; saveLobby(); page.querySelectorAll('#segRated button').forEach((x) => x.classList.toggle('on', x === b)); }));
  $('startBtn').onclick = () => newGame({ variant: lobby.variant, botId: lobby.bot, color: lobby.color, rated: lobby.rated && canRate });
});

// ---------- Karriär ----------
registerPage('career', (page) => {
  const nb = nextCareerBot();
  const beaten = Object.keys(profile.career.beaten).length;
  setHTML(page, h`
    <section class="hero slim"><div><h1>Karriär</h1><p>Slå dig uppåt från Rookie till Legend. Nästa bot låses upp först när du har vunnit mot den förra. Karriärpartier är rankade.</p></div>
      <div class="stat-row"><div class="stat"><b>${beaten}/${BOTS.length}</b><small>slagna</small></div><div class="stat"><b>${profile.career.title || (nb ? tierOf(nb.elo) : 'Legend')}</b><small>nivå</small></div><div class="stat"><b>${profile.rating}</b><small>rating</small></div></div></section>
    <ol class="ladder">${BOTS.map((b, i) => {
      const done = !!profile.career.beaten[b.id];
      const open = done || b === nb;
      return h`<li class="${done ? 'done' : open ? 'next' : 'locked'}"><span class="badge" style="background:${open ? b.color : 'var(--line)'}">${open ? b.mono : '🔒'}</span>
        <div class="lad-txt"><small>${tierOf(b.elo)} · steg ${i + 1}</small><b>${b.name}</b><span>≈${b.elo} · ${b.style}</span></div>
        <span class="lad-state">${done ? 'Slagen ✓' : open ? 'Nästa motståndare' : 'Låst'}</span>
        ${open ? h`<button class="btn ${done ? '' : 'primary'}" data-b="${b.id}">${done ? 'Spela igen' : 'Utmana'}</button>` : ''}</li>`;
    })}</ol>`);
  page.querySelectorAll('[data-b]').forEach((x) => (x.onclick = () => newGame({ variant: 'standard', botId: x.dataset.b, color: 'random', rated: true, career: true })));
});

// ---------- Partier ----------
registerPage('history', (page) => {
  const res = { w: ['Vinst', 'win'], l: ['Förlust', 'loss'], d: ['Remi', 'draw'] };
  setHTML(page, h`
    <section class="hero slim"><div><h1>Partier</h1><p>Dina senaste ${games.length} partier. Analysera dem, öva på misstagen eller skicka dem till Lichess som PGN.</p></div>
      <div class="hero-actions"><button class="btn" id="expAll" ${games.length ? '' : 'disabled'}>Exportera alla som PGN</button></div></section>
    ${games.length ? h`<ul class="games">${games.map((g) => {
      const r = res[g.result] || ['?', ''];
      const v = variantOf(g.variant);
      return h`<li><span class="res ${r[1]}">${r[0]}</span>
        <span class="g-txt"><b>vs ${g.botName || g.bot}</b><small>${fmtDate(g.date)} · ${v.name}${g.rated ? ' · rankad' : ''}${g.delta !== null && g.delta !== undefined ? ` (${g.delta >= 0 ? '+' : ''}${g.delta})` : ''} · ${Math.ceil((g.plies || 0) / 2)} drag${g.opening ? ' · ' + g.opening : ''}${g.acc !== undefined ? ` · ${g.acc}% precision` : ''}</small></span>
        <span class="g-act">${v.engine === 'sf' ? h`<button class="btn sm" data-ana="${g.id}">Analysera</button>` : ''}<button class="btn sm" data-pgn="${g.id}">PGN</button></span></li>`;
    })}</ul>` : h`<p class="muted block">Inga partier än. Färdiga partier hamnar här.</p>`}`);
  const ex = $('expAll'); if (ex) ex.onclick = exportAll;
  page.querySelectorAll('[data-ana]').forEach((b) => (b.onclick = () => openAnalysis(games.find((g) => String(g.id) === b.dataset.ana))));
  page.querySelectorAll('[data-pgn]').forEach((b) => (b.onclick = () => { const r = games.find((g) => String(g.id) === b.dataset.pgn); showPgn(Game.fromRecord(r), r); }));
});

// ---------- Inställningar ----------
function toggle(key, label, desc) {
  return h`<label class="switch"><input type="checkbox" data-set="${key}" ${settings[key] ? 'checked' : ''}><span class="sw"></span><span class="sw-txt"><b>${label}</b>${desc ? h`<small>${desc}</small>` : ''}</span></label>`;
}
function miniBoard(theme) {
  let s = '';
  for (let i = 0; i < 16; i++) s += `<i class="${(Math.floor(i / 4) + i) % 2 ? 'd' : 'l'}"></i>`;
  return `<span class="mini cg bt-${theme}"><span class="mini-b">${s}</span></span>`;
}
registerPage('settings', (page, anchor) => {
  const info = SF.info;
  setHTML(page, h`
    <section class="hero slim"><div><h1>Inställningar</h1><p>Utseende, ljud och teknik. Allt sparas på den här enheten.</p></div></section>
    <section class="block"><div class="block-head"><h2>Bräde</h2></div>
      <div class="grid swatches">${BOARD_THEMES.map(([k, l]) => h`<button class="swatch ${settings.board === k ? 'on' : ''}" data-board="${k}">${{ __raw: miniBoard(k) }}<span>${l}</span></button>`)}</div></section>
    <section class="block"><div class="block-head"><h2>Pjäser</h2></div>
      <div class="grid swatches">${PIECE_SETS.map(([k, l]) => h`<button class="swatch pset ${settings.pieces === k ? 'on' : ''}" data-pieces="${k}"><span class="pset-prev ${k === 'cypher' ? 'pset-glyph' : 'pset-img'}">${{ __raw: k === 'cypher' ? pieceHTML('white', 'knight', 'cypher') + pieceHTML('black', 'king', 'cypher') : `<i class="pc" style="background-image:url(pieces/${k}/wN.svg)"></i><i class="pc" style="background-image:url(pieces/${k}/bK.svg)"></i>` }}</span><span>${l}</span></button>`)}</div>
      <p class="muted small">Pjässet från Lichess (cburnett, merida m.fl.), se licenser i appens källkod.</p></section>
    <section class="block"><div class="block-head"><h2>Ljud</h2></div>
      <div class="switches">${toggle('sfx', 'Ljudeffekter', 'Kick och snare när pjäserna flyttas.')}${toggle('music', 'Beat i bakgrunden', 'En loop som går upp i tempo när partiet är jämnt.')}${toggle('voice', 'Röster', 'Botarna läser upp sina repliker.')}</div>
      <button class="btn sm" id="testVoice">Testa rösten</button></section>
    <section class="block"><div class="block-head"><h2>Spel</h2></div>
      <div class="switches">${toggle('secondChance', 'Andra chans', 'Efter ett blunder i vänskapsmatcher får du ta tillbaka draget (tre gånger per parti).')}${toggle('showOpening', 'Visa öppningens namn', 'Namnet från Lichess öppningsbok under partiet.')}${toggle('coords', 'Koordinater', 'Bokstäver och siffror längs kanten.')}${toggle('animate', 'Animera dragen')}${toggle('puzzleOnline', 'Hämta pussel från Lichess', 'När enheten är online. Annars används pusselpaketet i appen.')}</div></section>
    <section class="block" id="motor"><div class="block-head"><h2>Motor</h2></div>
      <div class="engine-box ${info.status}">
        <p class="eng-state"><b>${info.status === 'ok' ? 'Stockfish körs' : info.status === 'failed' ? 'Stockfish laddades inte' : 'Stockfish laddas…'}</b>${info.status === 'failed' ? h` Botarna använder reservmotorn, som är betydligt svagare, och analysen är avstängd.` : ''}</p>
        <dl class="kv">
          <dt>Motor</dt><dd>${info.id || '–'}</dd>
          <dt>Nätverk (NNUE)</dt><dd>${info.nnue || '–'}</dd>
          <dt>Laddtid</dt><dd>${info.loadMs ? info.loadMs + ' ms' : '–'}</dd>
          <dt>WebAssembly</dt><dd>${info.wasm ? 'ja' : 'nej'}</dd>
          <dt>Web Worker</dt><dd>${info.worker ? 'ja' : 'nej'}</dd>
          ${info.error ? h`<dt>Fel</dt><dd>${info.error}</dd>` : ''}
          <dt>Fart</dt><dd id="benchRes">Inte testad</dd>
        </dl>
        <div id="devInfo"></div>
        <button class="btn" id="benchBtn" ${info.status === 'ok' ? '' : 'disabled'}>Testa motorn (3 sekunder)</button>
        <details><summary>Logg</summary><pre class="log">${info.log.join('\n')}</pre></details>
      </div></section>
    <section class="block"><div class="block-head"><h2>App</h2></div>
      <p>Version <b>${appVersion()}</b>${isAndroid() ? ' · Android TV' : ' · webbläsare'}</p>
      ${isAndroid() ? h`<div class="switches">${toggle('autoUpdate', 'Sök efter uppdateringar automatiskt', 'Kollar GitHub när appen startar.')}</div><button class="btn" id="updBtn">Sök efter uppdatering nu</button> <span id="updRes" class="muted"></span>` : h`<p class="muted">Uppdateringar sköts automatiskt i TV-appen. Här i webbläsaren har du alltid senaste versionen.</p>`}
    </section>
    <section class="block"><div class="block-head"><h2>Data</h2></div>
      <button class="btn" id="expAll2">Exportera alla partier (PGN)</button> <button class="btn danger" id="resetBtn">Nollställ rating och karriär</button></section>`);
  page.querySelectorAll('[data-board]').forEach((b) => (b.onclick = () => { settings.board = b.dataset.board; saveSettings(); ui.board.applyTheme(); page.querySelectorAll('[data-board]').forEach((x) => x.classList.toggle('on', x === b)); }));
  page.querySelectorAll('[data-pieces]').forEach((b) => (b.onclick = () => { settings.pieces = b.dataset.pieces; saveSettings(); applyPieceSet(settings.pieces); ui.board.build(); page.querySelectorAll('[data-pieces]').forEach((x) => x.classList.toggle('on', x === b)); }));
  page.querySelectorAll('[data-set]').forEach((i) => (i.onchange = () => {
    settings[i.dataset.set] = i.checked; saveSettings();
    if (i.dataset.set === 'coords') ui.board.applyTheme();
    if (i.dataset.set === 'music' && !i.checked) beat.stop();
    if (i.dataset.set === 'sfx' && i.checked) sfx.move();
  }));
  $('testVoice').onclick = () => { const was = settings.voice; settings.voice = true; speak('Yo, det här är MC Gaffel. Hör du mig?', { pitch: 0.95, rate: 1.15 }); settings.voice = was; };
  $('benchBtn').onclick = async () => {
    const r = $('benchRes'); r.textContent = 'Testar…'; $('benchBtn').disabled = true;
    const res = await bench((x) => { r.textContent = `djup ${x.depth}, ${Math.round(x.nps / 1000)} tusen ställningar/s…`; });
    $('benchBtn').disabled = false;
    if (!res) { r.textContent = 'Kunde inte testa.'; return; }
    const verdict = res.nps > 400000 ? 'snabb' : res.nps > 120000 ? 'helt okej' : 'långsam, botarna tänker kortare än tänkt';
    r.textContent = `${Math.round(res.nps / 1000)} tusen ställningar/s, djup ${res.depth} på 3 s (${verdict})`;
  };
  const di = deviceInfo();
  if (di) $('devInfo').innerHTML = `<dl class="kv"><dt>Enhet</dt><dd>${di.model}</dd><dt>Android</dt><dd>${di.android}</dd><dt>WebView</dt><dd>${di.webview}</dd><dt>Minne</dt><dd>${di.ram}</dd></dl>`;
  const ub = $('updBtn');
  if (ub) ub.onclick = async () => { $('updRes').textContent = 'Kollar…'; const r = await checkForUpdate(true); $('updRes').textContent = r === 'none' ? 'Du har senaste versionen.' : r === 'error' ? 'Kunde inte nå GitHub.' : ''; };
  $('expAll2').onclick = exportAll;
  $('resetBtn').onclick = () => {
    const c = modal(h`<h2>Nollställ?</h2><p>Rating, pusselrating och karriären börjar om från början. Partierna och öppningsmisstagen finns kvar.</p><div class="row"><button class="btn danger" data-a="yes">Nollställ</button><button class="btn" data-a="no">Avbryt</button></div>`);
    c.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => { if (b.dataset.a === 'yes') { resetProgress(); updateChips(); toast('Nollställt.'); showPage('settings'); } closeModal(); }));
  };
  if (anchor === 'motor') setTimeout(() => $('motor').scrollIntoView({ block: 'start' }), 50);
});
