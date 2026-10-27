/* Shared state, persisted settings and a tiny event bus. */
import { loadJSON, saveJSON, clamp } from './util.js';

/* ---- event bus ---- */
const L = {};
export const on = (name, fn) => { (L[name] || (L[name] = [])).push(fn); };
export const emit = (name, detail) => { (L[name] || []).forEach(fn => { try { fn(detail); } catch (e) { console.error(name, e); } }); };

/* ---- runtime flags ---- */
export const S = {
  videoLoaded: false, srtLoaded: false, extLoaded: false,
  videoName: '', srtName: '', extName: '',
  cropEditing: false, adjusting: false, sheetOpen: false,
  fs: false, landscape: false,
  region: null,      // where the picture sits in the display (see layout.js)
  geo: null          // visible part of the picture, feeds the ambient engine
};
export const isFull = () => S.fs || S.landscape;

/* ---- crop: fractions (0-1) cut from each side of the video frame ---- */
export const crop = { t: 0, r: 0, b: 0, l: 0 };
export const MIN_KEEP = .1;
export const hasCrop = () => crop.t > .001 || crop.r > .001 || crop.b > .001 || crop.l > .001;

/* ---- display (the window) — persisted ---- */
export const DISP_LIMITS = { min: 25, max: 65 };
export const DISP_DEFAULTS = { h: 45, fit: 'fit', aspect: 'auto', radius: 28 };
export const RADIUS_MAX = 64;
export const disp = loadJSON('avp.display.v1', DISP_DEFAULTS);
disp.h = clamp(disp.h, DISP_LIMITS.min, DISP_LIMITS.max);
disp.radius = clamp(disp.radius, 0, 64);
export const saveDisp = () => saveJSON('avp.display.v1', disp);

/* ---- video transform inside the display — per video, not persisted ----
   zoom: 1 = as fitted. x / y: offset as a fraction of the display. sx / sy: extra stretch per axis. */
export const VIEW_DEFAULTS = { zoom: 1, x: 0, y: 0, sx: 1, sy: 1 };
export const VIEW_LIMITS = { zoomMin: .25, zoomMax: 5, stretchMin: .5, stretchMax: 2 };
export const view = Object.assign({}, VIEW_DEFAULTS);
export const viewIsDefault = () => Object.keys(VIEW_DEFAULTS).every(k => Math.abs(view[k] - VIEW_DEFAULTS[k]) < .001);

/* ---- player preferences — persisted ---- */
export const PREF_DEFAULTS = { autoCrop: true, keepAwake: true, loop: false, keepView: false, skip: 10, subScale: 100, subDelay: 0 };
export const prefs = loadJSON('avp.prefs.v1', PREF_DEFAULTS);
export const savePrefs = () => saveJSON('avp.prefs.v1', prefs);

/* ---- look & feel — persisted. accent / shell are #rrggbb. skin: none | circuit | image (the picture itself lives in its own storage key, see look.js).
   haptics: 0 off · 1 soft · 2 normal · 3 strong ---- */
export const LOOK_DEFAULTS = { accent: '#f6d63b', shell: '#2b2b2b', reelAccent: 0, skin: 'none', skinOp: 55, skinBlur: 0, haptics: 2, hapticStr: 50 };
export const look = loadJSON('avp.look.v1', LOOK_DEFAULTS);
export const saveLook = () => saveJSON('avp.look.v1', look);

/* ---- ambient settings — persisted. v2 key: v1 values are imported once (smooth motion is switched off: it redraws every screen frame). ---- */
export const AMBI_KEY = 'ambilightSettings.v2';
export const AMBI_DEFAULTS = {
  bg: 1, stReach: 35, stCurve: 80, extAlign: 0, extZoom: 100, extX: 0, extY: 0, fit: 1,
  blur: 30, edge: 12, spread: 60, fadeStart: 15, fadeCurve: 35,
  brightness: 100, contrast: 100, saturation: 115, debanding: 0,
  flicker: 0, blending: 0, blendSmooth: 80,
  top: 1, right: 1, bottom: 1, left: 1
};
export const amb = Object.assign({}, AMBI_DEFAULTS);
try {
  const v2 = localStorage.getItem(AMBI_KEY);
  if (v2) Object.assign(amb, JSON.parse(v2));
  else { Object.assign(amb, JSON.parse(localStorage.getItem('ambilightSettings.v1') || '{}'), { blending: 0 }); }
} catch (e) { /* ignore */ }
export const saveAmb = () => saveJSON(AMBI_KEY, amb);

/* ---- per-region background: Top, Bottom, Sides each pick Ambient (1), Mirror (2) or Off (0) ---- */
export const MODES_DEFAULTS = { top: 1, bottom: 1, side: 1 };
export const modes = Object.assign({}, MODES_DEFAULTS);
{
  let raw = null;
  try { raw = localStorage.getItem('avp.regions.v1'); } catch (e) { /* ignore */ }
  if (raw) { try { Object.assign(modes, JSON.parse(raw)); } catch (e) { /* ignore */ } }
  else {                                         // first run of this version: carry over the old glow-sides switches
    modes.top = amb.top ? 1 : 0; modes.bottom = amb.bottom ? 1 : 0; modes.side = (amb.left && amb.right) ? 1 : 0;
    if (amb.bg === 0) modes.top = modes.bottom = modes.side = 0;
  }
  if (amb.bg === 0) amb.bg = 1;
}
export const saveModes = () => saveJSON('avp.regions.v1', modes);
export const anyMode = m => modes.top === m || modes.bottom === m || modes.side === m;

/* ---- mirror settings, one set per region ---- */
/* blurPx: real CSS pixels. blurMode 0 = the same blur everywhere, 1 = sharp next to the picture and growing with distance
   (blurStart = % of the region that stays sharp, blurRamp = % of the region over which the blur grows).
   merge is OFF by default: it paints a tiny low-resolution colour map over the mirror, which looks like heavy blur. */
export const MIR_DEFAULTS = {
  strip: 10, blurPx: 4, blurMode: 0, blurStart: 0, blurRamp: 60,
  saturation: 100, brightness: 100, contrast: 100, fade: 35,
  merge: 0, cov: 33, sens: 100
};
export const pickMir = (src, base = MIR_DEFAULTS) => {          // only known keys, numbers only (old saves had a different `blur` meaning)
  const o = Object.assign({}, base);
  if (src && typeof src === 'object') for (const k of Object.keys(MIR_DEFAULTS)) if (typeof src[k] === 'number' && isFinite(src[k])) o[k] = src[k];
  return o;
};
export const mir = { top: pickMir(), bottom: pickMir(), side: pickMir(), zones: 0 };
try {
  const s = JSON.parse(localStorage.getItem('avp.mirror.v2') || '{}');
  for (const k of ['top', 'bottom', 'side']) mir[k] = pickMir(s[k]);
  mir.zones = s.zones ? 1 : 0;
} catch (e) { /* ignore */ }
export const saveMir = () => saveJSON('avp.mirror.v2', mir);

/* whole-background mode: 1 = per-region (Ambient / Mirror / Off), 2 = extended video, 3 = stretch fill */
export const bgMode = () => (amb.bg === 2 && !S.extLoaded) ? 1 : (amb.bg === 2 || amb.bg === 3 ? amb.bg : 1);
