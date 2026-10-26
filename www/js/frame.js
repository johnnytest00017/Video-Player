/* Frame control: move / zoom / stretch the video inside the display, resize the display.
   Gestures on the display:
     pinch ............ zoom (around the fingers)           two-finger drag ... move
     one-finger drag .. move (only in Adjust mode)          wheel ............. zoom (desktop)
     tap .............. play / pause (controls in cinema layout; nothing in Adjust mode)
     double-tap ....... ±skip on the left / right third, fullscreen in the middle, reset view in Adjust mode */
import { stage, videoWrap, gestures, adjustEditor, adjBox, adjHint, dispHandle, adjustToggle, viewBadge, adjFit, adjFill, adjReset, adjDone } from './dom.js';
import {
  S, view, VIEW_DEFAULTS, VIEW_LIMITS, viewIsDefault, disp, DISP_DEFAULTS, DISP_LIMITS, saveDisp, prefs, isFull, on, emit
} from './state.js';
import { clamp } from './util.js';
import { applyLayout, requestLayout } from './layout.js';
import { openLayer, closeLayer } from './ui.js';
import { exitCropEdit } from './crop.js';
import { togglePlay, skipBy, showFlash, toggleControls, toggleFullscreen } from './player.js';

/* ---------- state setters (used by gestures, sliders, buttons) ---------- */
export function setView(partial) {
  Object.assign(view, partial);
  view.zoom = clamp(view.zoom, VIEW_LIMITS.zoomMin, VIEW_LIMITS.zoomMax);
  view.sx = clamp(view.sx, VIEW_LIMITS.stretchMin, VIEW_LIMITS.stretchMax);
  view.sy = clamp(view.sy, VIEW_LIMITS.stretchMin, VIEW_LIMITS.stretchMax);
  requestLayout();
  emit('view');
}
export function resetView() { Object.assign(view, VIEW_DEFAULTS); applyLayout(); emit('view'); }

export function setDisp(partial, persist = true) {
  Object.assign(disp, partial);
  disp.h = clamp(disp.h, DISP_LIMITS.min, DISP_LIMITS.max);
  stage.style.setProperty('--display-h', disp.h + '%');
  if (persist) saveDisp();
  requestLayout();
  emit('disp');
}
export function resetFrame() { Object.assign(view, VIEW_DEFAULTS); setDisp(DISP_DEFAULTS); applyLayout(); emit('view'); }
stage.style.setProperty('--display-h', disp.h + '%');

/* ---------- badge: tells you the video is zoomed / moved, one tap puts it back ---------- */
function syncBadge() {
  const off = !viewIsDefault();
  viewBadge.classList.toggle('hidden', !off);
  if (off) viewBadge.textContent = `Reset view · ${Math.round(view.zoom * 100)}%`;
}
viewBadge.addEventListener('click', resetView);
on('view', syncBadge);
on('media', syncBadge);
syncBadge();

/* ---------- Adjust mode ---------- */
let hintTimer = 0;
export function setAdjusting(next) {
  if (next === S.adjusting) return;
  if (next && !S.videoLoaded) return;
  if (next && S.cropEditing) exitCropEdit();
  S.adjusting = next;
  adjustEditor.classList.toggle('hidden', !next);
  adjustToggle.setAttribute('aria-pressed', String(next));
  if (next) {
    openLayer('adjust', () => setAdjusting(false));
    adjHint.style.opacity = '1';
    clearTimeout(hintTimer); hintTimer = setTimeout(() => { adjHint.style.opacity = '0'; }, 3600);
    updateBox(S.region);
  } else closeLayer('adjust');
  emit('adjust');
  emit('ui-activity');
}
adjustToggle.addEventListener('click', () => setAdjusting(!S.adjusting));
adjDone.addEventListener('click', () => setAdjusting(false));
adjReset.addEventListener('click', () => { resetView(); });
adjFit.addEventListener('click', () => { setView({ zoom: 1, x: 0, y: 0 }); setDisp({ fit: 'fit' }); });
adjFill.addEventListener('click', () => { setView({ zoom: 1, x: 0, y: 0 }); setDisp({ fit: 'fill' }); });
on('request-close-adjust', () => setAdjusting(false));

/* dashed outline of where the picture is right now */
function updateBox(r) {
  if (!S.adjusting || !r) return;
  Object.assign(adjBox.style, { left: r.dx + 'px', top: r.dy + 'px', width: r.dw + 'px', height: r.dh + 'px' });
}
on('layout', updateBox);

/* ---------- display height handle ---------- */
let hd = null;
dispHandle.addEventListener('pointerdown', e => {
  dispHandle.setPointerCapture(e.pointerId); e.preventDefault();
  hd = { y: e.clientY, h: disp.h };
  adjustEditor.classList.add('dragging');
});
dispHandle.addEventListener('pointermove', e => {
  if (!hd) return;
  setDisp({ h: hd.h + (e.clientY - hd.y) / stage.clientHeight * 100 }, false);
});
const endHandle = () => { if (!hd) return; hd = null; saveDisp(); adjustEditor.classList.remove('dragging'); };
dispHandle.addEventListener('pointerup', endHandle);
dispHandle.addEventListener('pointercancel', endHandle);

/* ---------- touch gestures ---------- */
const ptrs = new Map();
let g = null;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
function wrapPoint(e) { const r = videoWrap.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

function session(mode, extra) {
  return Object.assign({ mode, v0: Object.assign({}, view), r0: S.region, moved: mode !== 'tap', t: performance.now() }, extra);
}

gestures.addEventListener('pointerdown', e => {
  if (S.cropEditing || !S.videoLoaded) return;
  try { gestures.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  const p = wrapPoint(e);
  ptrs.set(e.pointerId, p);
  emit('ui-activity');
  if (ptrs.size === 1) g = session('tap', { start: p });
  else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; g = session('pinch', { d0: dist(a, b) || 1, m0: mid(a, b) }); }
});

gestures.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId) || !g || !g.r0) return;
  const p = wrapPoint(e);
  ptrs.set(e.pointerId, p);
  const { W, H } = g.r0;
  if (g.mode === 'pinch' && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    const m = mid(a, b), z = clamp(g.v0.zoom * dist(a, b) / g.d0, VIEW_LIMITS.zoomMin, VIEW_LIMITS.zoomMax);
    const k = z / g.v0.zoom, r0 = g.r0;
    const c0x = r0.dx + r0.dw / 2, c0y = r0.dy + r0.dh / 2;                 // picture centre when the gesture began
    const cx = m.x - (g.m0.x - c0x) * k, cy = m.y - (g.m0.y - c0y) * k;     // keep the point under the fingers fixed
    setView({ zoom: z, x: (cx - r0.baseCx) / W, y: (cy - r0.baseCy) / H });
  } else if (g.mode === 'tap') {
    if (Math.hypot(p.x - g.start.x, p.y - g.start.y) > 9) g.moved = true;
    if (g.moved && S.adjusting) setView({ x: g.v0.x + (p.x - g.start.x) / W, y: g.v0.y + (p.y - g.start.y) / H });
  }
});

function release(e) {
  if (!ptrs.has(e.pointerId)) return;
  const p = ptrs.get(e.pointerId);
  ptrs.delete(e.pointerId);
  if (ptrs.size === 0) {
    if (g && g.mode === 'tap' && !g.moved && e.type === 'pointerup' && performance.now() - g.t < 500) handleTap(p);
    g = null;
  } else if (ptrs.size === 1) {
    g = session('tap', { start: [...ptrs.values()][0], moved: true });          // finger left a pinch: carry on as a drag
  }
}
gestures.addEventListener('pointerup', release);
gestures.addEventListener('pointercancel', release);

gestures.addEventListener('wheel', e => {
  const r = S.region;
  if (!S.videoLoaded || !r) return;
  e.preventDefault();
  const p = wrapPoint(e);
  const z = clamp(view.zoom * Math.exp(-e.deltaY * .0015), VIEW_LIMITS.zoomMin, VIEW_LIMITS.zoomMax), k = z / view.zoom;
  const c0x = r.dx + r.dw / 2, c0y = r.dy + r.dh / 2;
  setView({ zoom: z, x: (p.x - (p.x - c0x) * k - r.baseCx) / r.W, y: (p.y - (p.y - c0y) * k - r.baseCy) / r.H });
}, { passive: false });

/* ---------- taps ---------- */
let lastTap = null, tapTimer = 0;
function handleTap(p) {
  const now = performance.now();
  if (lastTap && now - lastTap.t < 300 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 60) {
    clearTimeout(tapTimer); lastTap = null; onDouble(p); return;
  }
  lastTap = { t: now, x: p.x, y: p.y };
  clearTimeout(tapTimer);
  tapTimer = setTimeout(() => { lastTap = null; onSingle(); }, 270);
}
function onSingle() {
  if (S.adjusting) return;
  if (isFull()) toggleControls(); else togglePlay();
}
function onDouble(p) {
  if (S.adjusting) { resetView(); return; }
  const rel = p.x / videoWrap.clientWidth;
  if (rel < .34) { skipBy(-prefs.skip); showFlash(`−${prefs.skip}s`, 'left'); }
  else if (rel > .66) { skipBy(prefs.skip); showFlash(`+${prefs.skip}s`, 'right'); }
  else toggleFullscreen();
}
