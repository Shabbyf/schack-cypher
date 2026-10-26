// Ljud: dragljud, en syntad hiphop-loop som ökar tempot när partiet är jämnt,
// och uppläsning av botarnas repliker (Android TTS i TV-appen, annars webbläsarens).
import { settings } from './store.js';

let ac = null;
function ctx() {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
  } catch (e) { ac = null; }
  return ac;
}
export function unlockAudio() { if (settings.sfx || settings.music) ctx(); }

function kickAt(a, t, gain = 0.7, dest = a.destination) {
  const o = a.createOscillator(), g = a.createGain();
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.14);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  o.connect(g).connect(dest); o.start(t); o.stop(t + 0.2);
}
let noiseBuf = null;
function noise(a) {
  if (noiseBuf) return noiseBuf;
  noiseBuf = a.createBuffer(1, a.sampleRate * 0.3, a.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
function snareAt(a, t, gain = 0.35, dest = a.destination, len = 0.15) {
  const n = a.createBufferSource(); n.buffer = noise(a);
  const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1500;
  const g = a.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
  n.connect(f).connect(g).connect(dest); n.start(t); n.stop(t + len + 0.02);
}
function hatAt(a, t, gain, dest) {
  const n = a.createBufferSource(); n.buffer = noise(a);
  const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
  const g = a.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  n.connect(f).connect(g).connect(dest); n.start(t); n.stop(t + 0.06);
}
function bassAt(a, t, freq, len, dest) {
  const o = a.createOscillator(), g = a.createGain(), f = a.createBiquadFilter();
  o.type = 'sawtooth'; o.frequency.setValueAtTime(freq, t);
  f.type = 'lowpass'; f.frequency.value = 380;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + len);
  o.connect(f).connect(g).connect(dest); o.start(t); o.stop(t + len + 0.05);
}

export const sfx = {
  move() { if (!settings.sfx) return; const a = ctx(); if (a) kickAt(a, a.currentTime); },
  capture() { if (!settings.sfx) return; const a = ctx(); if (a) { kickAt(a, a.currentTime); snareAt(a, a.currentTime); } },
  check() {
    if (!settings.sfx) return; const a = ctx(); if (!a) return;
    const t = a.currentTime;
    [0, 0.12].forEach((off) => {
      const o = a.createOscillator(), g = a.createGain(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(520, t + off); o.frequency.linearRampToValueAtTime(470, t + off + 0.1);
      g.gain.setValueAtTime(0.12, t + off); g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.11);
      o.connect(g).connect(a.destination); o.start(t + off); o.stop(t + off + 0.12);
    });
  },
  good() { if (!settings.sfx) return; const a = ctx(); if (!a) return; const t = a.currentTime; [523, 659, 784].forEach((f, i) => tone(a, f, t + i * 0.08, 0.18)); },
  bad() { if (!settings.sfx) return; const a = ctx(); if (!a) return; const t = a.currentTime; [330, 247].forEach((f, i) => tone(a, f, t + i * 0.12, 0.22)); },
  win() { if (!settings.sfx) return; const a = ctx(); if (!a) return; const t = a.currentTime; [523, 659, 784, 1047].forEach((f, i) => tone(a, f, t + i * 0.1, 0.3)); },
};
function tone(a, f, t, len) {
  const o = a.createOscillator(), g = a.createGain(); o.type = 'triangle'; o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + len);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + len + 0.02);
}

// ---------- Beat ----------
// 16 steg per takt. Tempot glider mellan 80 och 104 bpm beroende på hur jämnt det är.
const KICK = [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0];
const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
const BASS = [[0, 2], [7, 1], [10, 1], [0, 2], [3, 2]]; // halvtonsteg och längd i åttondelar, i a-moll
const BASS_STEPS = [0, 6, 8, 10, 14];
export const beat = (() => {
  let timer = null, step = 0, next = 0, bpm = 86, target = 86, bus = null, bar = 0;
  function tick() {
    const a = ac; if (!a) return;
    bpm += (target - bpm) * 0.05;
    const dur = 60 / bpm / 4;
    while (next < a.currentTime + 0.12) {
      const intense = target > 96;
      if (KICK[step]) kickAt(a, next, 0.45, bus);
      if (SNARE[step]) snareAt(a, next, 0.22, bus, 0.18);
      if (step % 2 === 0 || intense) hatAt(a, next, step % 4 === 2 ? 0.07 : 0.04, bus);
      const bi = BASS_STEPS.indexOf(step);
      if (bi >= 0) { const [semi, len] = BASS[(bi + bar) % BASS.length]; bassAt(a, next, 55 * Math.pow(2, semi / 12), len * dur * 2, bus); }
      next += dur;
      step = (step + 1) % 16;
      if (step === 0) bar = (bar + 1) % 4;
    }
  }
  return {
    start() {
      if (timer || !settings.music) return;
      const a = ctx(); if (!a) return;
      bus = a.createGain(); bus.gain.value = 0.5; bus.connect(a.destination);
      next = a.currentTime + 0.05; step = 0;
      timer = setInterval(tick, 40);
    },
    stop() { if (timer) clearInterval(timer); timer = null; if (bus) { try { bus.disconnect(); } catch (e) {} bus = null; } },
    // closeness 0..1, där 1 är helt jämnt
    setTension(closeness) { target = 80 + 24 * Math.max(0, Math.min(1, closeness)); },
    get playing() { return !!timer; },
  };
})();

// ---------- Röster ----------
let svVoice = null;
function pickVoice() {
  if (!('speechSynthesis' in window)) return null;
  const vs = speechSynthesis.getVoices();
  return vs.find((v) => /^sv/i.test(v.lang)) || null;
}
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => { svVoice = pickVoice(); };

export function speak(text, voice = {}) {
  if (!settings.voice || !text) return;
  const native = window.CypherApp;
  if (native && native.speak) { try { native.speak(text, voice.pitch || 1, voice.rate || 1); } catch (e) {} return; }
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  svVoice = svVoice || pickVoice();
  if (svVoice) u.voice = svVoice;
  u.lang = 'sv-SE'; u.pitch = voice.pitch || 1; u.rate = voice.rate || 1;
  speechSynthesis.speak(u);
}
export function stopSpeaking() {
  const native = window.CypherApp;
  if (native && native.stopSpeaking) { try { native.stopSpeaking(); } catch (e) {} }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
