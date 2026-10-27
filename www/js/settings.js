/* Settings bottom sheet: Frame · Crop · Ambient · Playback · Media. Built from small helpers so every row looks and behaves alike. */
import { sheet, tabs, sheetBody, sheetClose, settingsToggle, video } from './dom.js';
import {
  S, view, disp, RADIUS_MAX, prefs, amb, crop, AMBI_DEFAULTS, VIEW_DEFAULTS, VIEW_LIMITS, DISP_LIMITS, DISP_DEFAULTS,
  bgMode, savePrefs, on, emit
} from './state.js';
import { APP_NAME, APP_VERSION } from './config.js';
import { openLayer, closeLayer } from './ui.js';
import { loadJSON, saveJSON } from './util.js';
import { setView, setDisp, resetFrame, setAdjusting } from './frame.js';
import { enterCropEdit, runAutoDetect, setCrop, cropNote } from './crop.js';
import { ambiChanged } from './background.js';
import { setSpeed, syncSkipLabels } from './player.js';
import { applySubStyle } from './subtitles.js';
import { pickVideoFile, pickSrtFile, pickExtFile, removeSrt } from './media.js';
import * as ext from './extended.js';

/* ---------- tiny DOM helpers ---------- */
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const syncs = [];
const syncAll = () => syncs.forEach(f => f());

const group = text => h('div', 'group-label', text);

function slider({ label, sub, min, max, step = 1, get, set, fmt = v => v + '%', def }) {
  const f = h('div', 'field'), head = h('div', 'field-head');
  const val = def != null ? h('button', 'field-val') : h('span', 'field-val');
  const input = Object.assign(document.createElement('input'), { type: 'range', min, max, step });
  input.setAttribute('aria-label', label);
  const paint = () => {
    const v = get();
    input.value = v; val.textContent = fmt(v);
    input.style.setProperty('--p', ((v - min) / (max - min) * 100) + '%');
  };
  if (def != null) { val.type = 'button'; val.title = 'Tap to reset'; val.addEventListener('click', () => { set(def); paint(); }); }
  input.addEventListener('input', () => { set(+input.value); paint(); });
  head.append(h('div', 'field-name', label), val);
  f.append(head);
  if (sub) f.append(h('div', 'field-sub', sub));
  f.append(input);
  syncs.push(paint);
  return f;
}

function segmented({ label, options, get, set }) {
  const f = h('div', 'field');
  if (label) f.append(h('div', 'field-name', label));
  const seg = h('div', 'seg'); seg.setAttribute('role', 'radiogroup');
  if (label) seg.setAttribute('aria-label', label);
  options.forEach(([value, text]) => {
    const b = h('button', null, text); b.type = 'button'; b.setAttribute('role', 'radio');
    b.addEventListener('click', () => { set(value); paint(); });
    seg.append(b);
  });
  const paint = () => [...seg.children].forEach((b, i) => b.setAttribute('aria-checked', String(options[i][0] === get())));
  f.append(seg); syncs.push(paint);
  return f;
}

function toggle({ label, sub, get, set }) {
  const row = h('div', 'row'), left = h('div', 'grow');
  left.append(h('div', 'field-name', label));
  if (sub) left.append(h('div', 'field-sub', sub));
  const sw = h('button', 'switch'); sw.type = 'button'; sw.setAttribute('role', 'switch'); sw.setAttribute('aria-label', label);
  const paint = () => sw.setAttribute('aria-checked', String(!!get()));
  sw.addEventListener('click', () => { set(!get()); paint(); });
  row.append(left, sw); syncs.push(paint);
  return row;
}

function button(text, cls, onClick) {
  const b = h('button', 'btn small ' + (cls || ''), text); b.type = 'button'; b.addEventListener('click', onClick);
  return b;
}
const btnRow = (...btns) => { const r = h('div', 'btn-row'); r.append(...btns); return r; };

/* A row showing a file name with action buttons. */
function fileRow(label, nameOf, ...actions) {
  const row = h('div', 'row'), left = h('div', 'grow');
  const name = h('div', 'field-sub ellipsis');
  left.append(h('div', 'field-name', label), name);
  const acts = h('div', 'row-actions'); acts.append(...actions);
  row.append(left, acts);
  syncs.push(() => { name.textContent = nameOf() || 'None'; });
  return row;
}

/* ---------- presets: named snapshots, saved on the device ---------- */
const PRESET_KEY = 'avp.presets.v1';
const presetStore = (() => { const o = loadJSON(PRESET_KEY, { frame: '[]', ambient: '[]' }); return o; })();
const readList = kind => { try { return JSON.parse(presetStore[kind]) || []; } catch (e) { return []; } };
const writeList = (kind, list) => { presetStore[kind] = JSON.stringify(list); saveJSON(PRESET_KEY, presetStore); };

function presetBox(kind, capture, apply) {
  const box = h('div', 'presets');
  const form = h('div', 'preset-form');
  const input = Object.assign(document.createElement('input'), { type: 'text', placeholder: 'Preset name', maxLength: 24 });
  input.setAttribute('aria-label', 'Preset name');
  const save = button('Save current', 'primary', () => {
    const name = input.value.trim() || ('Preset ' + (readList(kind).length + 1));
    const list = readList(kind).filter(p => p.name !== name);          // same name = overwrite
    list.push({ name, data: capture() });
    writeList(kind, list); input.value = ''; paint();
  });
  form.append(input, save);
  const list = h('div', 'preset-list');
  const paint = () => {
    list.textContent = '';
    const items = readList(kind);
    if (!items.length) list.append(h('p', 'note', 'No presets yet. Set things up how you like, name it and tap Save current.'));
    items.forEach((p, i) => {
      const row = h('div', 'preset-row');
      const use = h('button', 'preset-use', p.name); use.type = 'button';
      use.addEventListener('click', () => { apply(p.data); syncAll(); });
      const del = h('button', 'icon-btn small', ''); del.type = 'button'; del.setAttribute('aria-label', 'Delete preset ' + p.name);
      del.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
      del.addEventListener('click', () => { const l = readList(kind); l.splice(i, 1); writeList(kind, l); paint(); });
      row.append(use, del); list.append(row);
    });
  };
  paint();
  box.append(form, list);
  return box;
}

const panel = id => sheetBody.querySelector(`[data-panel="${id}"]`);

/* ============ FRAME ============ */
(() => {
  const p = panel('frame');
  p.append(
    group('Display'),
    slider({ label: 'Height', min: DISP_LIMITS.min, max: DISP_LIMITS.max, get: () => disp.h, set: v => setDisp({ h: v }), fmt: v => Math.round(v) + '%', def: DISP_DEFAULTS.h }),
    slider({ label: 'Corner radius', min: 0, max: RADIUS_MAX, get: () => disp.radius, set: v => setDisp({ radius: v }), fmt: v => Math.round(v) + ' px', def: DISP_DEFAULTS.radius }),
    segmented({ label: 'Fit', options: [['fit', 'Fit'], ['fill', 'Fill'], ['stretch', 'Stretch'], ['native', '100%']], get: () => disp.fit, set: v => setDisp({ fit: v }) }),
    segmented({ label: 'Aspect ratio', options: [['auto', 'Auto'], ['16:9', '16:9'], ['4:3', '4:3'], ['21:9', '21:9'], ['1:1', '1:1']], get: () => disp.aspect, set: v => setDisp({ aspect: v }) }),
    group('Video'),
    slider({ label: 'Zoom', min: VIEW_LIMITS.zoomMin * 100, max: VIEW_LIMITS.zoomMax * 100, get: () => Math.round(view.zoom * 100), set: v => setView({ zoom: v / 100 }), def: 100 }),
    slider({ label: 'Move left / right', min: -100, max: 100, get: () => Math.round(view.x * 100), set: v => setView({ x: v / 100 }), def: 0 }),
    slider({ label: 'Move up / down', min: -100, max: 100, get: () => Math.round(view.y * 100), set: v => setView({ y: v / 100 }), def: 0 }),
    slider({ label: 'Stretch width', min: VIEW_LIMITS.stretchMin * 100, max: VIEW_LIMITS.stretchMax * 100, get: () => Math.round(view.sx * 100), set: v => setView({ sx: v / 100 }), def: 100 }),
    slider({ label: 'Stretch height', min: VIEW_LIMITS.stretchMin * 100, max: VIEW_LIMITS.stretchMax * 100, get: () => Math.round(view.sy * 100), set: v => setView({ sy: v / 100 }), def: 100 }),
    toggle({ label: 'Keep frame for next videos', sub: 'zoom and position stay when you open another file', get: () => prefs.keepView, set: v => { prefs.keepView = v; savePrefs(); } }),
    btnRow(
      button('Move & zoom on screen', 'primary', () => { closeSheet(); setAdjusting(true); }),
      button('Reset frame', '', resetFrame)
    ),
    group('Presets'),
    presetBox('frame',
      () => ({ disp: { h: disp.h, fit: disp.fit, aspect: disp.aspect, radius: disp.radius }, view: Object.assign({}, view) }),
      d => { Object.assign(view, VIEW_DEFAULTS, d.view); setDisp(d.disp); setView({}); }),
    h('p', 'note', 'Anything the video does not cover is filled by the Ambient background. Pinch the display to zoom; in “Move & zoom” mode one finger drags the picture and the bar at the bottom resizes the display.')
  );
})();

/* ============ CROP ============ */
(() => {
  const p = panel('crop');
  const sum = h('div', 'crop-summary'), cells = {};
  [['t', 'Top'], ['b', 'Bottom'], ['l', 'Left'], ['r', 'Right']].forEach(([k, name]) => {
    const c = h('div'), b = h('b', null, '0%'); c.append(b, h('span', null, name)); cells[k] = b; sum.append(c);
  });
  const status = h('p', 'crop-status');
  const paint = () => {
    for (const k of Object.keys(cells)) cells[k].textContent = Math.round(crop[k] * 100) + '%';
    status.textContent = cropNote ? { auto: 'Bars detected automatically.', manual: 'Set by hand.' }[cropNote] || cropNote : '';
  };
  syncs.push(paint);
  p.append(
    group('Black bars'), sum, status,
    btnRow(
      button('Edit lines', 'primary', () => { closeSheet(); enterCropEdit(); }),
      button('Auto-detect', '', () => runAutoDetect()),
      button('Reset', '', () => setCrop({}, ''))
    ),
    toggle({ label: 'Detect bars automatically', sub: 'when a video opens', get: () => prefs.autoCrop, set: v => { prefs.autoCrop = v; savePrefs(); } }),
    h('p', 'note', 'Edit lines: drag the two horizontal and two vertical lines to cut any side. The ambient glow is built from the cropped picture.')
  );
})();

/* ============ AMBIENT ============ */
const ambiGroups = [];
(() => {
  const p = panel('ambient');
  const set = key => v => { amb[key] = v; ambiChanged(); };
  const A = (key, label, min, max, extra = {}) => slider(Object.assign({ label, min, max, get: () => amb[key], set: set(key), def: AMBI_DEFAULTS[key] }, extra));
  const modeGroup = (modes, ...nodes) => { const d = h('div'); d.append(...nodes); ambiGroups.push({ d, modes }); return d; };

  p.append(
    segmented({
      label: 'Background', options: [[1, 'Ambilight'], [3, 'Stretch'], [2, 'Extended'], [0, 'Off']],
      get: bgMode,
      set: v => {
        if (v === 2 && !S.extLoaded) { pickExtFile(); return; }          // Extended needs a file first
        amb.bg = v; ambiChanged(); syncAll();
      }
    }),

    modeGroup([1],
      group('Glow'),
      segmented({ label: 'Spread', options: [[1, 'Fit player'], [0, 'Manual']], get: () => amb.fit, set: v => { amb.fit = v; ambiChanged(); syncAll(); } }),
      A('edge', 'Edge size', 2, 50),
      (() => { const s = A('spread', 'Spread (manual)', 0, 200); syncs.push(() => s.classList.toggle('hidden', !!amb.fit)); return s; })(),
      A('fadeStart', 'Fade start', -50, 100),
      A('fadeCurve', 'Fade curve', 1, 100)
    ),
    modeGroup([3],
      group('Stretch'),
      A('stReach', 'Reach', 5, 100),
      A('stCurve', 'Curve', 30, 200)
    ),
    modeGroup([2],
      group('Extended video'),
      fileRow('Clip', () => S.extName,
        button('Import', '', pickExtFile), button('Remove', 'danger', () => ext.clear())),
      segmented({ label: 'Original inside extended', options: [[0, 'Scaled to fit'], [1, 'Native pixels']], get: () => amb.extAlign, set: v => { amb.extAlign = v; ambiChanged(); syncAll(); } }),
      A('extZoom', 'Zoom', 50, 200),
      A('extX', 'Shift X', -50, 50),
      A('extY', 'Shift Y', -50, 50),
      h('p', 'note', 'Adjust Zoom / Shift until the middle of the extended clip lines up with the real picture.')
    ),
    modeGroup([1, 3],
      group('Look'),
      A('blur', 'Blur', 0, 100),
      A('brightness', 'Brightness', 0, 200),
      A('contrast', 'Contrast', 0, 200),
      A('saturation', 'Saturation', 0, 200)
    )
  );

  /* advanced ambilight options tucked away */
  const adv = h('details', 'more'); adv.append(h('summary', null, 'Advanced'));
  const dirs = h('div', 'field'); dirs.append(h('div', 'field-name', 'Glow sides'));
  const chips = h('div', 'chips');
  const dirBtns = [['top', 'Top'], ['right', 'Right'], ['bottom', 'Bottom'], ['left', 'Left']].map(([key, text]) => {
    const b = h('button', 'chip', text); b.type = 'button';
    b.addEventListener('click', () => { amb[key] = amb[key] ? 0 : 1; ambiChanged(); syncAll(); });
    chips.append(b); return [key, b];
  });
  syncs.push(() => dirBtns.forEach(([key, b]) => b.setAttribute('aria-pressed', String(!!amb[key]))));
  dirs.append(chips);
  adv.append(
    A('debanding', 'Debanding (noise)', 0, 100),
    A('flicker', 'Flicker reduction', 0, 100),
    toggle({ label: 'Smooth motion', sub: 'frame blending', get: () => amb.blending, set: v => { amb.blending = v ? 1 : 0; ambiChanged(); } }),
    A('blendSmooth', 'Smooth motion strength', 0, 100),
    dirs
  );
  ambiGroups.push({ d: adv, modes: [1] });
  const ambKeep = () => { const o = Object.assign({}, amb); delete o.bg; return o; };
  p.append(adv, group('Presets'), presetBox('ambient', ambKeep, d => { Object.assign(amb, d); ambiChanged(); syncAll(); }), btnRow(button('Reset ambient settings', '', () => { Object.assign(amb, AMBI_DEFAULTS, { bg: bgMode() === 2 ? 2 : AMBI_DEFAULTS.bg }); ambiChanged(); syncAll(); })));

  syncs.push(() => { const m = bgMode(); ambiGroups.forEach(({ d, modes }) => d.classList.toggle('hidden', !modes.includes(m))); });
})();

/* ============ PLAYBACK ============ */
(() => {
  const p = panel('playback');
  const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  const chips = h('div', 'chips');
  const sBtns = speeds.map(s => {
    const b = h('button', 'chip', s === 1 ? '1× Normal' : s + '×'); b.type = 'button';
    b.addEventListener('click', () => setSpeed(s)); chips.append(b); return [s, b];
  });
  syncs.push(() => sBtns.forEach(([s, b]) => b.setAttribute('aria-pressed', String(Math.abs(video.playbackRate - s) < .001))));
  const sp = h('div', 'field'); sp.append(h('div', 'field-name', 'Speed'), chips);

  p.append(
    group('Playback'), sp,
    segmented({ label: 'Skip interval', options: [[5, '5 s'], [10, '10 s'], [15, '15 s'], [30, '30 s']], get: () => prefs.skip, set: v => { prefs.skip = v; savePrefs(); syncSkipLabels(); } }),
    toggle({ label: 'Loop video', get: () => prefs.loop, set: v => { prefs.loop = v; savePrefs(); } }),
    toggle({ label: 'Keep screen on', sub: 'while playing', get: () => prefs.keepAwake, set: v => { prefs.keepAwake = v; savePrefs(); emit('keep-awake'); } }),
    group('Subtitles'),
    slider({ label: 'Size', min: 70, max: 160, get: () => prefs.subScale, set: v => { prefs.subScale = v; savePrefs(); applySubStyle(); }, def: 100 }),
    slider({ label: 'Delay', sub: 'positive = subtitles appear later', min: -10, max: 10, step: .1, get: () => prefs.subDelay, set: v => { prefs.subDelay = Math.round(v * 10) / 10; savePrefs(); applySubStyle(); }, fmt: v => (v > 0 ? '+' : '') + v.toFixed(1) + ' s', def: 0 })
  );
})();

/* ============ MEDIA ============ */
(() => {
  const p = panel('media');
  const about = h('div', 'about');
  about.innerHTML = `<b>${APP_NAME}</b> · v${APP_VERSION}<br>Ambient light engine from <i>youtube-ambilight</i> by Wessel Kroos (MIT).`;
  p.append(
    group('Files'),
    fileRow('Video', () => S.videoName, button('Open', '', pickVideoFile)),
    fileRow('Subtitles (SRT)', () => S.srtName, button('Open', '', pickSrtFile), button('Remove', 'danger', removeSrt)),
    fileRow('Extended video', () => S.extName, button('Import', '', pickExtFile), button('Remove', 'danger', () => ext.clear())),
    about
  );
})();

/* ============ sheet open / close + tabs ============ */
let current = 'frame';
function selectTab(id) {
  current = id;
  [...tabs.children].forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
  sheetBody.querySelectorAll('.panel').forEach(pn => pn.classList.toggle('hidden', pn.dataset.panel !== id));
  sheetBody.scrollTop = 0;
  syncAll();
}
tabs.addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) selectTab(b.dataset.tab); });

export function openSheet(tab) {
  if (S.cropEditing) return;
  if (tab) selectTab(tab);
  if (S.sheetOpen) return;
  S.sheetOpen = true;
  sheet.classList.add('open'); sheet.setAttribute('aria-hidden', 'false');
  settingsToggle.setAttribute('aria-expanded', 'true');
  openLayer('sheet', closeSheet);
  syncAll();
  emit('ui-activity');
}
export function closeSheet() {
  if (!S.sheetOpen) return;
  S.sheetOpen = false;
  sheet.classList.remove('open'); sheet.setAttribute('aria-hidden', 'true');
  settingsToggle.setAttribute('aria-expanded', 'false');
  closeLayer('sheet');
  emit('ui-activity');
}
settingsToggle.addEventListener('click', () => (S.sheetOpen ? closeSheet() : openSheet()));
sheetClose.addEventListener('click', closeSheet);
on('request-close-sheet', closeSheet);

/* keep sliders honest while the sheet is visible (gestures change zoom / position behind it) */
const live = () => { if (S.sheetOpen) syncAll(); };
['view', 'disp', 'crop', 'amb-sync', 'media', 'speed'].forEach(ev => on(ev, live));
on('layout', live);
selectTab('frame');
