// Små hjälpfunktioner som används överallt.
export const $ = (id) => document.getElementById(id);
export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// HTML-mall: h`<b>${x}</b>` escapar värden, raw() släpper igenom färdig HTML.
export function raw(s) { return { __raw: String(s) }; }
export function h(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => {
    if (Array.isArray(v)) out += v.map((x) => (x && x.__raw !== undefined ? x.__raw : esc(x))).join('');
    else if (v && v.__raw !== undefined) out += v.__raw;
    else if (v !== null && v !== undefined) out += esc(v);
    out += strings[i + 1];
  });
  return raw(out);
}
export function setHTML(el, tpl) { el.innerHTML = tpl && tpl.__raw !== undefined ? tpl.__raw : tpl; }

export function ls(k, d) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; }
}
export function lsSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* privat läge eller fullt */ }
}

// Vinstchans (0-100) från centibonde, samma kurva som Lichess.
export function winPct(cp) {
  cp = clamp(cp, -1500, 1500);
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}
export function fmtEval(cp) {
  if (Math.abs(cp) >= 9000) {
    const m = Math.round((10000 - Math.abs(cp)) / 10);
    return (cp > 0 ? '' : '-') + 'M' + Math.max(1, m);
  }
  return (cp > 0 ? '+' : '') + (cp / 100).toFixed(1);
}
export function fmtDate(t) {
  const d = new Date(t);
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
}
export function todayKey(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
// Deterministisk slump (för t.ex. dagens offline-pussel).
export function seeded(seed) {
  let s = 0;
  for (const c of String(seed)) s = (s * 31 + c.charCodeAt(0)) | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const isTV = () => document.documentElement.classList.contains('tv');
