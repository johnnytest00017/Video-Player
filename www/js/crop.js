/* Crop: two vertical + two horizontal cut lines, plus automatic bar detection. */
import { video, videoWrap, cropEditor } from './dom.js';
import { S, crop, MIN_KEEP, hasCrop, prefs, emit, on } from './state.js';
import { clamp, waitEvent } from './util.js';
import { fgFrame, applyLayout } from './layout.js';
import { openLayer, closeLayer } from './ui.js';

const $ = id => document.getElementById(id);
const lines = { t: $('lineT'), b: $('lineB'), l: $('lineL'), r: $('lineR') };
const shades = { t: $('shT'), b: $('shB'), l: $('shL'), r: $('shR') };
const cropBox = $('cropBox');

export let cropNote = '';

export function cropLabel(note) {
  const parts = [];
  [['t', 'T'], ['b', 'B'], ['l', 'L'], ['r', 'R']].forEach(([k, n]) => {
    if (crop[k] > .001) parts.push(`${n} ${Math.round(crop[k] * 100)}%`);
  });
  const base = parts.length ? parts.join(' · ') : 'No crop';
  return note ? `${base} · ${note}` : base;
}

export function setCrop(next, note = '') {
  const n = next || {};
  ['t', 'r', 'b', 'l'].forEach(k => { crop[k] = clamp(Number(n[k]) || 0, 0, .9); });
  // never let opposite sides cross
  if (crop.t + crop.b > 1 - MIN_KEEP) { const o = crop.t + crop.b - (1 - MIN_KEEP); crop.t -= o / 2; crop.b -= o / 2; }
  if (crop.l + crop.r > 1 - MIN_KEEP) { const o = crop.l + crop.r - (1 - MIN_KEEP); crop.l -= o / 2; crop.r -= o / 2; }
  cropNote = note;
  applyLayout();
  emit('crop', note);
}
export function setCropStatus(note) { cropNote = note; emit('crop', note); }

/* ---------- editor ---------- */
function updateEditor() {
  if (!S.cropEditing) return;
  const f = fgFrame(); if (!f) return;
  const W = videoWrap.clientWidth, H = videoWrap.clientHeight;
  const x0 = f.x + crop.l * f.w, x1 = f.x + (1 - crop.r) * f.w;
  const y0 = f.y + crop.t * f.h, y1 = f.y + (1 - crop.b) * f.h;
  lines.t.style.top = y0 + 'px'; lines.b.style.top = y1 + 'px';
  lines.l.style.left = x0 + 'px'; lines.r.style.left = x1 + 'px';
  const box = (n, l, t, w, h) => { n.style.left = l + 'px'; n.style.top = t + 'px'; n.style.width = Math.max(0, w) + 'px'; n.style.height = Math.max(0, h) + 'px'; };
  box(shades.t, 0, 0, W, y0);
  box(shades.b, 0, y1, W, H - y1);
  box(shades.l, 0, y0, x0, y1 - y0);
  box(shades.r, x1, y0, W - x1, y1 - y0);
  box(cropBox, x0, y0, x1 - x0, y1 - y0);
}
on('layout', updateEditor);

export function enterCropEdit() {
  if (!S.videoLoaded || !video.videoWidth) { setCropStatus('Open a video first'); return; }
  if (S.cropEditing) return;
  emit('request-close-adjust');
  emit('request-close-sheet');
  S.cropEditing = true;
  cropEditor.classList.remove('hidden');
  openLayer('crop', exitCropEdit);
  applyLayout();                       // shows the FULL frame while editing so the bars are visible
}
export function exitCropEdit() {
  if (!S.cropEditing) return;
  S.cropEditing = false;
  cropEditor.classList.add('hidden');
  closeLayer('crop');
  applyLayout();
  emit('crop', cropNote);
}

let dragEdge = null;
Object.entries(lines).forEach(([edge, node]) => {
  node.addEventListener('pointerdown', e => { dragEdge = edge; node.setPointerCapture(e.pointerId); e.preventDefault(); });
  node.addEventListener('pointermove', e => { if (dragEdge === edge) moveEdge(edge, e); });
  const end = () => { if (dragEdge === edge) dragEdge = null; };
  node.addEventListener('pointerup', end);
  node.addEventListener('pointercancel', end);
});
function moveEdge(edge, e) {
  const f = fgFrame(); if (!f) return;
  const r = videoWrap.getBoundingClientRect();
  const px = (e.clientX - r.left - f.x) / f.w, py = (e.clientY - r.top - f.y) / f.h;
  const next = { t: crop.t, r: crop.r, b: crop.b, l: crop.l };
  const c = (v, hi) => clamp(v, 0, hi);
  if (edge === 't') next.t = c(py, 1 - crop.b - MIN_KEEP);
  if (edge === 'b') next.b = c(1 - py, 1 - crop.t - MIN_KEEP);
  if (edge === 'l') next.l = c(px, 1 - crop.r - MIN_KEEP);
  if (edge === 'r') next.r = c(1 - px, 1 - crop.l - MIN_KEEP);
  setCrop(next, 'manual');
}
$('edDone').addEventListener('click', exitCropEdit);
$('edReset').addEventListener('click', () => setCrop({}, ''));
$('edAuto').addEventListener('click', () => runAutoDetect());

/* ---------- auto-detect: any side, any bar colour ---------- */
function analyzeFrame(src) {
  const vw = src.videoWidth, vh = src.videoHeight;
  if (!vw || !vh) return null;
  const w = 256, h = Math.max(32, Math.round(w * vh / vw));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d', { willReadFrequently: true });
  c.drawImage(src, 0, 0, w, h);
  const d = c.getImageData(0, 0, w, h).data;

  // per-row and per-column mean colour + brightness spread
  const mk = n => Array.from({ length: n }, () => ({ r: 0, g: 0, b: 0, l: 0, l2: 0, n: 0 }));
  const rows = mk(h), cols = mk(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, R = d[i], G = d[i + 1], B = d[i + 2];
    const L = .2126 * R + .7152 * G + .0722 * B;
    for (const a of [rows[y], cols[x]]) { a.r += R; a.g += G; a.b += B; a.l += L; a.l2 += L * L; a.n++; }
  }
  const fin = a => { a.r /= a.n; a.g /= a.n; a.b /= a.n; const m = a.l / a.n; a.sd = Math.sqrt(Math.max(0, a.l2 / a.n - m * m)); };
  rows.forEach(fin); cols.forEach(fin);

  const UNIFORM = 10, TOL = 40;
  const dist = (p, q) => Math.hypot(p.r - q.r, p.g - q.g, p.b - q.b);
  const count = (stats, rev) => {
    const len = stats.length, maxN = Math.floor(len * .35);
    const get = i => rev ? stats[len - 1 - i] : stats[i];
    let s = 0;
    if (get(0).sd > UNIFORM) { if (get(1) && get(1).sd <= UNIFORM) s = 1; else return 0; }
    const ref = get(s);
    let n = s;
    while (n < maxN && get(n).sd <= UNIFORM && dist(get(n), ref) <= TOL) n++;
    return n > 0 ? Math.min(maxN, n + 1) / len : 0;   // +1px safety margin so no edge fringe remains
  };
  const res = { t: count(rows, false), b: count(rows, true), l: count(cols, false), r: count(cols, true) };
  if (res.t + res.b > .8 || res.l + res.r > .8) return null;   // fade-to-black / flat frame: ignore
  return res;
}

async function detectBars() {
  if (!S.videoLoaded || !video.videoWidth) { setCropStatus('Open a video first'); return null; }
  setCropStatus('Scanning…');
  const results = [];
  if (video.readyState >= 2) { try { const r = analyzeFrame(video); if (r) results.push(r); } catch (e) { /* ignore */ } }
  let probe = null;
  try {
    probe = document.createElement('video');
    probe.muted = true; probe.playsInline = true; probe.preload = 'auto'; probe.src = video.currentSrc || video.src;
    await waitEvent(probe, 'loadeddata', 5000);
    const dur = probe.duration;
    if (Number.isFinite(dur) && dur > 1) {
      for (const p of [.1, .3, .5, .7, .9]) {
        try {
          probe.currentTime = dur * p;
          await waitEvent(probe, 'seeked', 2500);
          const r = analyzeFrame(probe); if (r) results.push(r);
        } catch (e) { /* ignore */ }
      }
    }
  } catch (e) { /* ignore */ }
  finally { if (probe) { probe.removeAttribute('src'); probe.load(); } }
  if (!results.length) { setCropStatus('Auto-detect unavailable'); return null; }
  // A bar must be present in EVERY sampled frame, so dark scenes are not mistaken for bars.
  const out = { t: 1, b: 1, l: 1, r: 1 };
  results.forEach(r => ['t', 'b', 'l', 'r'].forEach(k => { out[k] = Math.min(out[k], r[k]); }));
  return out;
}

let detecting = false;
export async function runAutoDetect() {
  if (detecting) return;
  detecting = true;
  try {
    const r = await detectBars();
    if (!r) return;
    const found = ['t', 'b', 'l', 'r'].some(k => r[k] >= .008);
    if (!found) { setCrop({}, 'no bars found'); return; }
    setCrop(r, 'auto');
  } finally { detecting = false; }
}

/* automatic pass when a video has loaded */
let autoTimer = null;
video.addEventListener('loadeddata', () => {
  if (autoTimer) clearTimeout(autoTimer);
  if (prefs.autoCrop) autoTimer = setTimeout(runAutoDetect, 250);
});
export { hasCrop };
