// Automatiska uppdateringar i TV-appen. Själva kollen och nedladdningen görs i
// Android-koden (CypherApp-bryggan); här visas frågan och förloppet.
import { banner, toast } from './ui.js';
import { settings } from './store.js';

const WEB_VERSION = '__VERSION__';
export const isAndroid = () => !!(window.CypherApp && window.CypherApp.getVersionName);
export function appVersion() {
  try { if (isAndroid()) return window.CypherApp.getVersionName(); } catch (e) {}
  return WEB_VERSION.startsWith('__') ? 'utveckling' : WEB_VERSION;
}
export function deviceInfo() {
  try { if (window.CypherApp && window.CypherApp.getDeviceInfo) return JSON.parse(window.CypherApp.getDeviceInfo()); } catch (e) {}
  return null;
}

let waiting = null;
window.__cypherUpdate = (info) => {
  const w = waiting; waiting = null;
  if (info.status === 'available') offer(info);
  else if (info.status === 'error' && info.stage === 'install') { banner(`<span>Uppdateringen misslyckades: ${info.message || 'okänt fel'}</span><button class="btn sm" data-act="close">Stäng</button>`, () => banner(null)); }
  if (w) w(info.status);
};
window.__cypherUpdateProgress = (pct) => {
  banner(`<span>Laddar ner uppdateringen… ${pct}%</span><span class="bar"><i style="width:${pct}%"></i></span>`);
};
window.__cypherInstallPermission = () => {
  banner(`<span>Tillåt Schack Cypher att installera appar i inställningarna som öppnades, gå sedan tillbaka och välj Uppdatera igen.</span><button class="btn sm" data-act="close">OK</button>`, () => banner(null));
};

function offer(info) {
  banner(`<span><b>Version ${info.version} finns.</b> ${info.notes ? info.notes.split('\n')[0].slice(0, 90) : ''}</span><button class="btn sm primary" data-act="install">Uppdatera</button><button class="btn sm" data-act="later">Senare</button>`, (act) => {
    if (act === 'install') {
      banner('<span>Startar nedladdningen…</span>');
      try { window.CypherApp.installUpdate(info.url); } catch (e) { toast('Kunde inte starta uppdateringen.'); banner(null); }
    } else banner(null);
  });
  const b = document.querySelector('#banner .primary');
  if (b && document.documentElement.classList.contains('tv')) b.focus();
}

export function checkForUpdate(manual = false) {
  if (!isAndroid() || !window.CypherApp.checkForUpdate) return Promise.resolve('none');
  if (!manual && !settings.autoUpdate) return Promise.resolve('skip');
  return new Promise((resolve) => {
    waiting = resolve;
    try { window.CypherApp.checkForUpdate(); } catch (e) { waiting = null; resolve('error'); }
    setTimeout(() => { if (waiting === resolve) { waiting = null; resolve('error'); } }, 20000);
  });
}
