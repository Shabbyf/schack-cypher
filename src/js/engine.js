// Motorer: Stockfish 17.1 (WebAssembly) för vanligt schack och Chess960,
// och en egen sökmotor i en worker för de övriga Lichess-varianterna.
// Allt går genom search(), som returnerar drag i UCI och värdering i centibönder
// från den drag-havandes perspektiv.

const MATE = 10000;
export const cpOfLine = (l) => (l.type === 'mate' ? Math.sign(l.v || -1) * (MATE - Math.abs(l.v) * 10) : l.v);

export const SF = (() => {
  const info = {
    status: 'loading', error: null, loadMs: null, id: null, nnue: null,
    wasm: typeof WebAssembly === 'object', worker: typeof Worker === 'function',
    log: [],
  };
  let w = null, ok = false, listeners = [], queue = Promise.resolve(), c960 = null;
  const t0 = performance.now();
  const note = (s) => { info.log.push(Math.round(performance.now() - t0) + ' ms: ' + s); if (info.log.length > 40) info.log.shift(); };
  const ready = new Promise((res) => {
    if (!info.wasm) { info.status = 'failed'; info.error = 'WebAssembly saknas i den här webbläsaren.'; return res(false); }
    try { w = new Worker('stockfish.js'); } catch (e) { info.status = 'failed'; info.error = 'Kunde inte starta worker: ' + e.message; return res(false); }
    note('worker startad');
    const timer = setTimeout(() => { info.status = 'failed'; info.error = info.error || 'Stockfish svarade inte inom 25 sekunder.'; note('timeout'); res(false); }, 25000);
    w.onmessage = (e) => {
      const line = typeof e.data === 'string' ? e.data : '';
      if (line.startsWith('id name')) { info.id = line.slice(8); note(line); }
      if (/NNUE|nnue/.test(line) && line.startsWith('info string')) { info.nnue = line.slice(12); note(line); }
      if (line === 'uciok') { note('uciok'); w.postMessage('setoption name Hash value 16'); w.postMessage('isready'); }
      else if (line === 'readyok' && !ok) {
        ok = true; clearTimeout(timer); info.status = 'ok'; info.loadMs = Math.round(performance.now() - t0); note('redo'); res(true);
      }
      listeners.slice().forEach((f) => f(line));
    };
    w.onerror = (e) => {
      clearTimeout(timer);
      info.status = 'failed';
      info.error = 'Fel i Stockfish: ' + (e && e.message ? e.message : 'okänt fel (troligen WebAssembly eller minne)');
      note(info.error);
      res(false);
    };
    w.postMessage('uci');
  });

  function run(fen, o = {}) {
    const job = queue.then(() => new Promise((resolve) => {
      const lines = {};
      let nps = 0, depth = 0;
      const on = (line) => {
        if (line.startsWith('info ')) {
          const n = / nps (\d+)/.exec(line); if (n) nps = +n[1];
          const d0 = / depth (\d+)/.exec(line); if (d0) depth = Math.max(depth, +d0[1]);
          if (line.includes(' pv ') && !line.includes('bound')) {
            const d = / depth (\d+)/.exec(line), mp = / multipv (\d+)/.exec(line), sc = / score (cp|mate) (-?\d+)/.exec(line), pv = / pv (.+)$/.exec(line);
            if (!sc || !pv) return;
            lines[mp ? +mp[1] : 1] = { depth: d ? +d[1] : 0, type: sc[1], v: +sc[2], pv: pv[1].trim().split(' ') };
          }
          if (o.onInfo) o.onInfo({ nps, depth });
        } else if (line.startsWith('bestmove')) {
          listeners = listeners.filter((f) => f !== on);
          const b = line.split(' ')[1];
          resolve({ best: b && b !== '(none)' ? b : null, nps, depth, lines: Object.keys(lines).sort((a, b) => a - b).map((k) => lines[k]) });
        }
      };
      listeners.push(on);
      const want960 = !!o.chess960;
      if (c960 !== want960) { w.postMessage('setoption name UCI_Chess960 value ' + want960); c960 = want960; }
      w.postMessage('setoption name MultiPV value ' + (o.multipv || 1));
      w.postMessage('position fen ' + fen);
      let go = 'go';
      if (o.depth) go += ' depth ' + o.depth;
      if (o.movetime) go += ' movetime ' + o.movetime;
      w.postMessage(go);
    }));
    queue = job.catch(() => {});
    return job;
  }
  return {
    ready, run, info,
    stop() { if (w && ok) w.postMessage('stop'); },
    newGame() { if (w && ok) w.postMessage('ucinewgame'); },
    get ok() { return ok; },
  };
})();

// Variantmotorn körs i en egen worker så att brädet inte fryser.
export const VJS = (() => {
  let w = null, seq = 0;
  const pending = new Map();
  function worker() {
    if (w) return w;
    w = new Worker('variant-worker.js');
    w.onmessage = (e) => { const p = pending.get(e.data.id); if (p) { pending.delete(e.data.id); p(e.data); } };
    w.onerror = () => { for (const [, p] of pending) p({ lines: [], best: null }); pending.clear(); };
    return w;
  }
  return {
    run(fen, rules, o = {}) {
      return new Promise((resolve) => {
        const id = ++seq;
        pending.set(id, resolve);
        worker().postMessage({ id, fen, rules, depth: o.depth || 4, movetime: o.movetime || 1500 });
      });
    },
    stop() { if (w) w.postMessage({ stop: true }); },
  };
})();

// Gemensam sökning. Returnerar { best, engine, lines: [{uci, cp, pv}] } där cp är
// från den drag-havandes perspektiv och uci är i chessops-form (rockad som e1h1).
export async function search(game, ply, o = {}) {
  const pos = game.posAt(ply);
  const fen = game.fen(ply);
  const useSF = game.variant.engine === 'sf' && (await SF.ready);
  if (useSF) {
    const r = await SF.run(fen, { multipv: o.multipv || 1, depth: o.depth, movetime: o.movetime, chess960: game.c960 });
    const norm = (u) => { const m = u && game.parseUci(u, pos); return m && m.from !== undefined ? fromMove(m) : u; };
    return {
      engine: 'sf', depth: r.depth,
      best: r.best ? norm(r.best) : null,
      lines: r.lines.map((l) => ({ uci: norm(l.pv[0]), cp: cpOfLine(l), pv: l.pv, depth: l.depth })),
    };
  }
  const depth = o.jsDepth || (o.depth ? Math.min(5, Math.max(1, Math.round(o.depth / 4))) : 3);
  const r = await VJS.run(fen, game.variant.rules, { depth, movetime: o.movetime || 1200 });
  return { engine: 'js', depth: r.depth || 0, best: r.best, lines: (r.lines || []).map((l) => ({ uci: l.uci, cp: l.score, pv: [l.uci] })) };
}
function fromMove(m) {
  const sq = (s) => 'abcdefgh'[s & 7] + ((s >> 3) + 1);
  return sq(m.from) + sq(m.to) + (m.promotion ? { queen: 'q', rook: 'r', bishop: 'b', knight: 'n', king: 'k' }[m.promotion] : '');
}
export function stopAll() { SF.stop(); VJS.stop(); }

// Snabbtest av motorn: söker i tre sekunder från startställningen och mäter fart.
export async function bench(onProgress) {
  if (!(await SF.ready)) return null;
  const t = performance.now();
  const r = await SF.run('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', { movetime: 3000, onInfo: onProgress });
  return { nps: r.nps, depth: r.depth, ms: Math.round(performance.now() - t) };
}
