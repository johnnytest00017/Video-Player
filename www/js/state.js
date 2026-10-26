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
export const DISP_DEFAULTS = { h: 45, fit: 'fit', aspect: 'auto' };
export const disp = loadJSON('avp.display.v1', DISP_DEFAULTS);
disp.h = clamp(disp.h, DISP_LIMITS.min, DISP_LIMITS.max);
export const saveDisp = () => saveJSON('avp.display.v1', disp);

/* ---- video transform inside the display — per video, not persisted ----
   zoom: 1 = as fitted. x / y: offset as a fraction of the display. sx / sy: extra stretch per axis. */
export const VIEW_DEFAULTS = { zoom: 1, x: 0, y: 0, sx: 1, sy: 1 };
export const VIEW_LIMITS = { zoomMin: .25, zoomMax: 5, stretchMin: .5, stretchMax: 2 };
export const view = Object.assign({}, VIEW_DEFAULTS);
export const viewIsDefault = () => Object.keys(VIEW_DEFAULTS).every(k => Math.abs(view[k] - VIEW_DEFAULTS[k]) < .001);

/* ---- player preferences — persisted ---- */
export const PREF_DEFAULTS = { autoCrop: true, keepAwake: true, loop: false, skip: 10, subScale: 100, subDelay: 0 };
export const prefs = loadJSON('avp.prefs.v1', PREF_DEFAULTS);
export const savePrefs = () => saveJSON('avp.prefs.v1', prefs);

/* ---- ambient settings — persisted (same key as v1 so saved presets survive) ---- */
export const AMBI_KEY = 'ambilightSettings.v1';
export const AMBI_DEFAULTS = {
  bg: 1, stReach: 35, stCurve: 80, extAlign: 0, extZoom: 100, extX: 0, extY: 0, fit: 1,
  blur: 30, edge: 12, spread: 60, fadeStart: 15, fadeCurve: 35,
  brightness: 100, contrast: 100, saturation: 115, debanding: 0,
  flicker: 0, blending: 1, blendSmooth: 80,
  top: 1, right: 1, bottom: 1, left: 1
};
export const amb = Object.assign({}, AMBI_DEFAULTS);
try { Object.assign(amb, JSON.parse(localStorage.getItem(AMBI_KEY) || '{}')); } catch (e) { /* ignore */ }
export const saveAmb = () => saveJSON(AMBI_KEY, amb);

/* 0 off, 1 ambilight, 2 extended video, 3 stretch fill */
export const bgMode = () => (amb.bg === 2 && !S.extLoaded) ? 1 : amb.bg;
