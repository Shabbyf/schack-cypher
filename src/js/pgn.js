// PGN-export: kopiera, ladda ner, eller öppna partiet i Lichess via QR-kod
// (praktiskt på TV:n: skanna med mobilen).
import qrcodegen from '../../vendor/qrcodegen/qrcodegen';
import { modal, closeModal, toast } from './ui.js';
import { games } from './store.js';
import { Game } from './rules.js';
import { h, esc, $ } from './util.js';

export function qrSvg(text, cls = 'qr') {
  const qr = qrcodegen.QrCode.encodeText(text, qrcodegen.QrCode.Ecc.LOW);
  const n = qr.size, b = 2;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.getModule(x, y)) d += `M${x + b},${y + b}h1v1h-1z`;
  return `<svg class="${cls}" viewBox="0 0 ${n + b * 2} ${n + b * 2}" role="img" aria-label="QR-kod"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

function headersFor(rec) {
  if (!rec) return {};
  const me = 'Du', them = rec.botName || rec.bot || 'Bot';
  const res = rec.result ? (rec.result === 'd' ? '1/2-1/2' : (rec.result === 'w') === (rec.color === 'white') ? '1-0' : '0-1') : '*';
  return {
    Date: new Date(rec.date || Date.now()).toISOString().slice(0, 10).replace(/-/g, '.'),
    White: rec.color === 'white' ? me : them, Black: rec.color === 'white' ? them : me,
    Result: res, ...(rec.botElo ? { [rec.color === 'white' ? 'BlackElo' : 'WhiteElo']: rec.botElo } : {}),
    ...(rec.opening ? { Opening: rec.opening } : {}), ...(rec.reason ? { Termination: rec.reason } : {}),
  };
}

export function showPgn(game, rec) {
  const pgn = game.pgn(headersFor(rec));
  const std = game.variant.id === 'standard' && game.startFen.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w');
  const url = std ? 'https://lichess.org/analysis/pgn/' + encodeURIComponent(game.moves.map((m) => m.san).join(' ')).replace(/%20/g, '_') : 'https://lichess.org/paste';
  const card = modal(h`<div class="modal-head"><h2>Partiet som PGN</h2><button class="btn sm" data-a="close">Stäng</button></div>
    <div class="pgn-wrap"><div><textarea class="pgn" readonly rows="10">${pgn}</textarea>
      <div class="row"><button class="btn" data-a="copy">Kopiera</button><button class="btn" data-a="dl">Ladda ner .pgn</button><button class="btn" data-a="import">Importera till Lichess</button></div>
      <p class="muted small" id="impRes"></p></div>
      <figure class="qr-fig">${{ __raw: qrSvg(url) }}<figcaption>${std ? 'Skanna med mobilen för att öppna partiet i Lichess analysbräde.' : 'Skanna för att öppna Lichess import. Klistra in PGN där.'}</figcaption></figure></div>`, { cls: 'wide' });
  card.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => act(b.dataset.a)));
  async function act(a) {
    if (a === 'close') closeModal();
    else if (a === 'copy') { try { await navigator.clipboard.writeText(pgn); toast('PGN kopierad.'); } catch (e) { card.querySelector('textarea').select(); document.execCommand('copy'); toast('PGN kopierad.'); } }
    else if (a === 'dl') download(pgn, `schack-cypher-${new Date(rec && rec.date ? rec.date : Date.now()).toISOString().slice(0, 10)}.pgn`);
    else if (a === 'import') {
      const out = $('impRes');
      out.textContent = 'Skickar till Lichess…';
      try {
        const r = await fetch('https://lichess.org/api/import', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: 'pgn=' + encodeURIComponent(pgn) });
        const j = await r.json();
        if (!j.url) throw new Error();
        out.innerHTML = `Klart: <a href="${esc(j.url)}" target="_blank" rel="noopener">${esc(j.url)}</a>`;
        const fig = card.querySelector('.qr-fig');
        fig.innerHTML = qrSvg(j.url) + '<figcaption>Skanna för att öppna det importerade partiet.</figcaption>';
      } catch (e) { out.textContent = 'Det gick inte att nå Lichess härifrån. Kopiera PGN och klistra in på lichess.org/paste.'; }
    }
  }
}

export function download(text, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/x-chess-pgn' }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function exportAll() {
  const out = games.map((r) => { try { return Game.fromRecord(r).pgn(headersFor(r)); } catch (e) { return ''; } }).filter(Boolean).join('\n');
  download(out, 'schack-cypher-alla-partier.pgn');
}
