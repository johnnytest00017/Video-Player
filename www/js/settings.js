/* Settings bottom sheet: Top · Video · Bottom · Presets · Playback · Media.
   Top and Bottom (and the Sides, inside Video) each choose Ambient, Mirror or Off and have their own options. */
import { sheet, tabs, sheetBody, sheetClose, settingsToggle, video } from './dom.js';
import {
  S, view, disp, prefs, amb, modes, mir, crop, AMBI_DEFAULTS, MIR_DEFAULTS, pickMir, MODES_DEFAULTS, VIEW_DEFAULTS, VIEW_LIMITS,
  DISP_LIMITS, DISP_DEFAULTS, PREF_DEFAULTS, RADIUS_MAX, LOOK_DEFAULTS, look, bgMode, savePrefs, on, emit
} from './state.js';
import { APP_NAME, APP_VERSION } from './config.js';
import { openLayer, closeLayer } from './ui.js';
import { loadJSON, saveJSON, clamp } from './util.js';
import { setView, setDisp, resetFrame, setAdjusting } from './frame.js';
import { enterCropEdit, runAutoDetect, setCrop, cropNote } from './crop.js';
import { ambiChanged } from './background.js';
import { setSpeed, syncSkipLabels } from './player.js';
import { applySubStyle } from './subtitles.js';
import { pickVideoFile, pickSrtFile, pickExtFile, removeSrt } from './media.js';
import * as ext from './extended.js';
import { haptic, hapticDemo } from './haptics.js';
import { setLook, loadSkinFile, clearSkinImage, hasSkinImage, loadPetalFile, clearPetalImage, hasPetalImage } from './look.js';
import { skinFile, petalFile } from './dom.js';
import { startArranging, resetLayout } from './arrange.js';

/* ---------- tiny DOM helpers ---------- */
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const syncs = [];
const syncAll = () => syncs.forEach(f => f());
const group = text => h('div', 'group-label', text);

const RESET_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.6-5.9M4 4v4.5h4.5"/></svg>';
const decimals = step => { const t = String(step); return t.includes('.') ? t.split('.')[1].length : 0; };

/* A "level" row: label inside, the part up to the value is filled, a grip marks the end, dots mark the levels.
   Only a deliberate sideways DRAG moves the value. A tap does nothing, and so does a finger that lands on the row to scroll the
   sheet (the browser takes the touch over and we get a pointercancel). The drag is relative to where it started, so the value
   never jumps under the finger. While dragging you feel a notch every 5 %, and a firmer thud at the default value and at both ends.
   The real <input type=range> stays inside the row (invisible, no pointer events) for the keyboard and screen readers.
   Tap the number to type an exact value; the ↺ button appears when the value differs from its default. */
function slider({ label, sub, min, max, step = 1, get, set, fmt = v => v + '%', def }) {
  const wrap = h('div', 'lvwrap'), row = h('div', 'lv');
  const name = h('span', 'lv-name', label);
  const val = h('button', 'lv-val'); val.type = 'button'; val.title = 'Tap to type a value';
  const rst = h('button', 'lv-reset'); rst.type = 'button'; rst.title = 'Reset'; rst.setAttribute('aria-label', 'Reset ' + label); rst.innerHTML = RESET_SVG;
  const input = Object.assign(document.createElement('input'), { type: 'range', min, max, step });
  input.className = 'lv-input'; input.setAttribute('aria-label', label);
  const grip = h('i', 'lv-grip');
  row.append(h('i', 'lv-fill'), h('i', 'lv-ticks'), grip, name, rst, val, input);
  wrap.append(row);
  if (sub) wrap.append(h('div', 'hint', sub));

  const meas = () => { if (name.offsetWidth) row.style.setProperty('--gmin', (name.offsetWidth + 26) + 'px'); };
  if (window.ResizeObserver) new ResizeObserver(meas).observe(row); else row.addEventListener('pointerdown', meas);
  const dec = decimals(step), range = max - min, snap = v => +(Math.round(clamp(v, min, max) / step) * step).toFixed(dec);
  const paint = () => {
    const v = get();
    input.value = v; val.textContent = fmt(v);
    row.style.setProperty('--p', ((v - min) / (max - min) * 100) + '%');
    rst.hidden = def == null || Math.abs(v - def) < step / 2;
  };
  input.addEventListener('input', () => { set(+input.value); paint(); });       // keyboard / screen reader
  rst.addEventListener('click', () => { set(def); paint(); haptic.thud(); });

  /* ---- drag ---- */
  const zone = Math.max(step * 1.5, range * .015);   // the default value pulls a little, so a quick drag cannot skip over it
  let st = null;
  const bump = () => { try { grip.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(1.7)' }, { transform: 'scaleY(1)' }], { duration: 110 }); } catch (e) { /* ignore */ } };
  const end = () => { if (!st) return; const was = st.drag; st = null; if (was) { row.classList.remove('active'); haptic.release(); } };
  row.addEventListener('pointerdown', e => {
    if ((e.pointerType === 'mouse' && e.button) || e.target.closest('.lv-val, .lv-reset, .lv-edit')) return;
    st = { id: e.pointerId, x: e.clientX, y: e.clientY, v0: get(), last: get(), w: Math.max(row.clientWidth, 160), drag: false, notch: -1, mouse: e.pointerType === 'mouse' };
  });
  row.addEventListener('pointermove', e => {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y, adx = Math.abs(dx), ady = Math.abs(dy);
    if (!st.drag) {
      if (ady >= 10 && ady > adx * .6) { st = null; return; }                        // that is a scroll: leave it to the sheet
      if (adx < (st.mouse ? 3 : 10) || adx < ady * 1.6) return;                       // not clearly sideways yet
      st.drag = true; st.x = e.clientX; st.v0 = get();                                // start from where the drag was recognised: no jump
      try { row.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      row.classList.add('active'); haptic.grab();
      return;
    }
    let v = snap(st.v0 + (e.clientX - st.x) / st.w * range);
    if (def != null) {
      const d = snap(def);
      if (Math.abs(v - d) < zone || (st.last - d) * (v - d) < 0) v = d;           // near it, or flicked straight across it: stop on the default
    }
    if (v === st.last) return;
    st.last = v; set(v); paint(); bump();
    if (def != null && v === snap(def)) haptic.thud();
    else if (v <= min || v >= max) haptic.thud();
    else { const n = Math.floor((v - min) / (range / 20)); if (n !== st.notch) { st.notch = n; haptic.tick(); } }
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => row.addEventListener(ev, e => { if (st && e.pointerId === st.id) end(); }));

  val.addEventListener('click', () => {
    const ed = Object.assign(document.createElement('input'), { type: 'number', className: 'lv-edit', value: get() });
    ed.inputMode = 'decimal'; ed.step = step; ed.min = min; ed.max = max;
    row.append(ed); val.style.visibility = 'hidden'; ed.focus(); ed.select();
    let closed = false;
    const done = ok => {
      if (closed) return; closed = true;
      const n = parseFloat(ed.value);
      ed.remove(); val.style.visibility = '';
      if (ok && Number.isFinite(n)) set(snap(n));
      paint();
    };
    ed.addEventListener('keydown', e => { if (e.key === 'Enter') done(true); else if (e.key === 'Escape') done(false); });
    ed.addEventListener('blur', () => done(true));
  });
  syncs.push(paint);
  return wrap;
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

/* A row of round colour swatches + a "pick any colour" swatch. */
function swatches({ label, colors, get, set }) {
  const f = h('div', 'field');
  f.append(h('div', 'field-name', label));
  const row = h('div', 'swatches'); row.setAttribute('role', 'radiogroup'); row.setAttribute('aria-label', label);
  const btns = colors.map(([hex, name]) => {
    const b = h('button', 'swatch'); b.type = 'button'; b.setAttribute('role', 'radio'); b.title = name; b.setAttribute('aria-label', name);
    b.style.setProperty('--c', hex); b.addEventListener('click', () => { set(hex); syncAll(); });
    row.append(b); return [hex, b];
  });
  const any = h('label', 'swatch any'); any.title = 'Pick any colour';
  const pick = Object.assign(document.createElement('input'), { type: 'color' });
  pick.setAttribute('aria-label', label + ': any colour');
  pick.addEventListener('input', () => { set(pick.value); syncAll(); });
  any.append(pick); row.append(any);
  f.append(row);
  syncs.push(() => {
    const cur = String(get()).toLowerCase();
    btns.forEach(([hex, b]) => b.setAttribute('aria-checked', String(hex === cur)));
    const custom = !colors.some(([hex]) => hex === cur);
    any.classList.toggle('on', custom); any.style.setProperty('--c', cur); pick.value = cur;
  });
  return f;
}

function button(text, cls, onClick) {
  const b = h('button', 'btn small ' + (cls || ''), text); b.type = 'button'; b.addEventListener('click', onClick);
  return b;
}
const btnRow = (...btns) => { const r = h('div', 'btn-row'); r.append(...btns); return r; };
const note = text => h('p', 'note', text);
const details = (title, ...nodes) => { const d = h('details', 'more'); d.append(h('summary', null, title), ...nodes); d.addEventListener('toggle', syncAll); return d; };

function fileRow(label, nameOf, ...actions) {
  const row = h('div', 'row'), left = h('div', 'grow');
  const name = h('div', 'field-sub ellipsis');
  left.append(h('div', 'field-name', label), name);
  const acts = h('div', 'row-actions'); acts.append(...actions);
  row.append(left, acts);
  syncs.push(() => { name.textContent = nameOf() || 'None'; });
  return row;
}

/* show / hide a block depending on state */
const showWhen = (node, test) => { syncs.push(() => node.classList.toggle('hidden', !test())); return node; };
const panel = id => sheetBody.querySelector(`[data-panel="${id}"]`);

/* ============ AMBIENT LOOK (shared by every region set to Ambient) ============ */
function ambientLook() {
  const set = key => v => { amb[key] = v; ambiChanged(); };
  const A = (key, label, min, max, extra = {}) => slider(Object.assign({ label, min, max, get: () => amb[key], set: set(key), def: AMBI_DEFAULTS[key] }, extra));
  const spread = A('spread', 'Spread (manual)', 0, 200);
  syncs.push(() => spread.classList.toggle('hidden', !!amb.fit));
  return details('Ambient look',
    note('Shared by every region that is set to Ambient.'),
    segmented({ label: 'Spread', options: [[1, 'Fit player'], [0, 'Manual']], get: () => amb.fit, set: v => { amb.fit = v; ambiChanged(); syncAll(); } }),
    A('blur', 'Blur', 0, 100), A('edge', 'Edge size', 2, 50), spread,
    A('fadeStart', 'Fade start', -50, 100), A('fadeCurve', 'Fade curve', 1, 100),
    A('brightness', 'Brightness', 0, 200), A('contrast', 'Contrast', 0, 200), A('saturation', 'Saturation', 0, 200),
    A('debanding', 'Debanding (noise)', 0, 100), A('flicker', 'Flicker reduction', 0, 100),
    toggle({ label: 'Smooth motion', sub: 'frame blending — more GPU work, switch off if the glow flickers', get: () => amb.blending, set: v => { amb.blending = v ? 1 : 0; ambiChanged(); } }),
    A('blendSmooth', 'Smooth motion strength', 0, 100)
  );
}

/* ============ ONE REGION: mode + its own options ============ */
const px = v => (Number.isInteger(v) ? v : v.toFixed(1)) + ' px';
function regionControls(key, title) {
  const c = mir[key], root = h('div');
  const M = (k, label, min, max, extra = {}) => slider(Object.assign({ label, min, max, get: () => c[k], set: v => { c[k] = v; ambiChanged(); }, def: MIR_DEFAULTS[k] }, extra));
  const rampBox = h('div'); rampBox.append(
    M('blurStart', 'Sharp zone', 0, 90, { sub: 'how far from the picture the reflection stays sharp' }),
    M('blurRamp', 'Blur ramp', 1, 100, { sub: 'how far the blur takes to reach full strength' })
  );
  const mirrorBox = h('div');
  mirrorBox.append(
    group('Reflection'),
    M('strip', 'Strip size', 2, 50, { sub: 'how much of the picture’s edge is reflected, then flipped again and again' }),
    M('fade', 'Edge fade', 0, 100, { sub: 'darkens the reflection with distance' }),
    group('Blur'),
    segmented({ options: [[0, 'Even'], [1, 'Grows with distance']], get: () => c.blurMode, set: v => { c.blurMode = v; ambiChanged(); syncAll(); } }),
    M('blurPx', 'Blur', 0, 48, { step: .5, fmt: v => v === 0 ? 'Off' : px(v), sub: 'in real pixels · 0 = a perfectly sharp mirror' }),
    showWhen(rampBox, () => c.blurMode === 1),
    group('Colour'),
    M('saturation', 'Saturation', 0, 250), M('brightness', 'Brightness', 0, 200), M('contrast', 'Contrast', 0, 200),
    group('Smart merge'),
    M('merge', 'Merge amount', 0, 100, { fmt: v => v === 0 ? 'Off' : v + '%', sub: 'hides heads / moving objects at the edge · it paints a soft low-resolution colour map, so keep it Off for a crisp mirror' }),
    M('cov', 'Min colour coverage', 5, 60), M('sens', 'Motion sensitivity', 40, 250),
    toggle({ label: 'Show merge zones', sub: 'pink = merged', get: () => mir.zones, set: v => { mir.zones = v ? 1 : 0; ambiChanged(); } }),
    btnRow(
      button('Reset ' + title.toLowerCase() + ' mirror', '', () => { Object.assign(c, pickMir()); ambiChanged(); syncAll(); }),
      button('Copy to all regions', '', () => { for (const k of ['top', 'bottom', 'side']) if (k !== key) Object.assign(mir[k], c); ambiChanged(); syncAll(); })
    )
  );
  const ambientBox = h('div');
  ambientBox.append(ambientLook());
  root.append(
    segmented({ label: title + ' background', options: [[1, 'Ambient'], [2, 'Mirror'], [0, 'Off']], get: () => modes[key], set: v => { modes[key] = v; ambiChanged(); syncAll(); } }),
    showWhen(mirrorBox, () => modes[key] === 2),
    showWhen(ambientBox, () => modes[key] === 1)
  );
  return root;
}

/* ============ TOP / BOTTOM ============ */
for (const [key, title] of [['top', 'Top'], ['bottom', 'Bottom']]) {
  const p = panel(key);
  p.append(
    showWhen(note('Whole background is set to Stretch or Extended (Video tab), so these region settings are paused.'), () => bgMode() !== 1),
    regionControls(key, title),
    note(key === 'top' ? 'Top is everything above the picture.' : 'Bottom is everything below the picture.')
  );
}

/* ============ VIDEO ============ */
(() => {
  const p = panel('video');

  /* crop */
  const sum = h('div', 'crop-summary'), cells = {};
  [['t', 'Top'], ['b', 'Bottom'], ['l', 'Left'], ['r', 'Right']].forEach(([k, name]) => {
    const c = h('div'), b = h('b', null, '0%'); c.append(b, h('span', null, name)); cells[k] = b; sum.append(c);
  });
  const status = h('p', 'crop-status');
  syncs.push(() => {
    for (const k of Object.keys(cells)) cells[k].textContent = Math.round(crop[k] * 100) + '%';
    status.textContent = cropNote ? { auto: 'Bars detected automatically.', manual: 'Set by hand.' }[cropNote] || cropNote : '';
  });

  /* whole-background specials */
  const set = key => v => { amb[key] = v; ambiChanged(); };
  const A = (key, label, min, max, extra = {}) => slider(Object.assign({ label, min, max, get: () => amb[key], set: set(key), def: AMBI_DEFAULTS[key] }, extra));
  const stretchBox = h('div'); stretchBox.append(A('stReach', 'Stretch reach', 5, 100), A('stCurve', 'Stretch curve', 30, 200), A('blur', 'Blur', 0, 100), A('brightness', 'Brightness', 0, 200), A('saturation', 'Saturation', 0, 200));
  const extBox = h('div');
  extBox.append(
    fileRow('Extended clip', () => S.extName, button('Import', '', pickExtFile), button('Remove', 'danger', () => ext.clear())),
    segmented({ label: 'Original inside extended', options: [[0, 'Scaled to fit'], [1, 'Native pixels']], get: () => amb.extAlign, set: v => { amb.extAlign = v; ambiChanged(); syncAll(); } }),
    A('extZoom', 'Zoom', 50, 200), A('extX', 'Shift X', -50, 50), A('extY', 'Shift Y', -50, 50)
  );

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
    btnRow(button('Move & zoom on screen', 'primary', () => { closeSheet(); setAdjusting(true); }), button('Reset frame', '', resetFrame)),
    note('Pinch the display to zoom. In “Move & zoom” mode one finger drags the picture and the bar at the bottom resizes the display.'),

    details('Crop black bars', sum, status,
      btnRow(button('Edit lines', 'primary', () => { closeSheet(); enterCropEdit(); }), button('Auto-detect', '', () => runAutoDetect()), button('Reset', '', () => setCrop({}, ''))),
      toggle({ label: 'Detect bars automatically', sub: 'when a video opens', get: () => prefs.autoCrop, set: v => { prefs.autoCrop = v; savePrefs(); } })
    ),
    details('Sides (left & right)', regionControls('side', 'Sides')),
    details('Whole background',
      note('Regions = Top / Bottom / Sides as set in their tabs. Stretch and Extended fill the whole display instead.'),
      segmented({
        options: [[1, 'Regions'], [3, 'Stretch'], [2, 'Extended']],
        get: bgMode,
        set: v => {
          if (v === 2 && !S.extLoaded) { pickExtFile(); return; }           // Extended needs a file first
          amb.bg = v; ambiChanged(); syncAll();
        }
      }),
      showWhen(stretchBox, () => bgMode() === 3),
      showWhen(extBox, () => bgMode() === 2)
    )
  );
})();

/* ============ PRESETS — one snapshot of everything ============ */
const copy = o => JSON.parse(JSON.stringify(o));
const snapshot = () => {
  const a = copy(amb); delete a.bg;
  return {
    disp: { h: disp.h, fit: disp.fit, aspect: disp.aspect, radius: disp.radius },
    view: copy(view), modes: copy(modes), mir: copy(mir), amb: a,
    prefs: { skip: prefs.skip, subScale: prefs.subScale, loop: prefs.loop }
  };
};
function applySnapshot(d) {
  Object.assign(view, VIEW_DEFAULTS, d.view || {});
  setDisp(Object.assign({}, DISP_DEFAULTS, d.disp || {}));
  Object.assign(modes, MODES_DEFAULTS, d.modes || {});
  for (const k of ['top', 'bottom', 'side']) Object.assign(mir[k], pickMir(d.mir && d.mir[k]));   // old presets: unknown keys dropped, missing ones default
  mir.zones = d.mir && d.mir.zones ? 1 : 0;
  const keepBg = amb.bg;
  Object.assign(amb, AMBI_DEFAULTS, d.amb || {}); amb.bg = keepBg;
  Object.assign(prefs, { skip: PREF_DEFAULTS.skip, subScale: PREF_DEFAULTS.subScale, loop: PREF_DEFAULTS.loop }, d.prefs || {});
  savePrefs(); syncSkipLabels(); applySubStyle(); emit('loop');
  setView({});
  ambiChanged(); syncAll();
}
const baseSnapshot = (over = {}) => ({
  disp: Object.assign({}, DISP_DEFAULTS), view: Object.assign({}, VIEW_DEFAULTS),
  modes: Object.assign({}, MODES_DEFAULTS, over.modes || {}),
  mir: { top: Object.assign({}, MIR_DEFAULTS), bottom: Object.assign({}, MIR_DEFAULTS), side: Object.assign({}, MIR_DEFAULTS), zones: 0 },
  amb: (() => { const a = Object.assign({}, AMBI_DEFAULTS); delete a.bg; return a; })(),
  prefs: { skip: PREF_DEFAULTS.skip, subScale: PREF_DEFAULTS.subScale, loop: PREF_DEFAULTS.loop }
});
const BUILT_IN = [
  { name: 'Default', data: baseSnapshot() },
  { name: 'Mirror everywhere', data: baseSnapshot({ modes: { top: 2, bottom: 2, side: 2 } }) },
  { name: 'Mirror top · glow bottom', data: baseSnapshot({ modes: { top: 2, bottom: 1, side: 1 } }) },
  { name: 'No background', data: baseSnapshot({ modes: { top: 0, bottom: 0, side: 0 } }) }
];
const PRESET_KEY = 'avp.presets.v2';
const store = loadJSON(PRESET_KEY, { list: '[]' });
const readList = () => { try { return JSON.parse(store.list) || []; } catch (e) { return []; } };
const writeList = list => { store.list = JSON.stringify(list); saveJSON(PRESET_KEY, store); };

(() => {
  const p = panel('presets');
  const input = Object.assign(document.createElement('input'), { type: 'text', placeholder: 'Preset name', maxLength: 24 });
  input.setAttribute('aria-label', 'Preset name');
  const list = h('div', 'preset-list');
  const paint = () => {
    list.textContent = '';
    const add = (item, deletable, i) => {
      const row = h('div', 'preset-row');
      const use = h('button', 'preset-use', item.name); use.type = 'button';
      use.addEventListener('click', () => applySnapshot(item.data));
      row.append(use);
      if (deletable) {
        const del = h('button', 'icon-btn small'); del.type = 'button'; del.setAttribute('aria-label', 'Delete preset ' + item.name);
        del.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
        del.addEventListener('click', () => { const l = readList(); l.splice(i, 1); writeList(l); paint(); });
        row.append(del);
      }
      list.append(row);
    };
    const mine = readList();
    list.append(group('Your presets'));
    if (!mine.length) list.append(note('Nothing saved yet. Set the whole player up how you like it, name it above and tap Save.'));
    mine.forEach((it, i) => add(it, true, i));
    list.append(group('Built-in'));
    BUILT_IN.forEach(it => add(it, false));
  };
  const save = button('Save', 'primary', () => {
    const name = input.value.trim() || ('Preset ' + (readList().length + 1));
    const l = readList().filter(x => x.name !== name);                 // same name = overwrite
    l.push({ name, data: snapshot() });
    writeList(l); input.value = ''; paint();
  });
  const form = h('div', 'preset-form'); form.append(input, save);
  p.append(
    group('Save everything'),
    note('A preset stores the display, video position and zoom, Top / Bottom / Sides backgrounds with all their mirror and ambient options, and the subtitle size and skip interval. Crop is per video and is not stored.'),
    form, list,
    btnRow(button('Reset everything to default', 'danger', () => applySnapshot(BUILT_IN[0].data)))
  );
  paint();
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
    toggle({ label: 'Loop video', get: () => prefs.loop, set: v => { prefs.loop = v; savePrefs(); emit('loop'); } }),
    toggle({ label: 'Keep screen on', sub: 'while playing', get: () => prefs.keepAwake, set: v => { prefs.keepAwake = v; savePrefs(); emit('keep-awake'); } }),
    group('Subtitles'),
    slider({ label: 'Size', min: 70, max: 160, get: () => prefs.subScale, set: v => { prefs.subScale = v; savePrefs(); applySubStyle(); }, def: 100 }),
    slider({ label: 'Delay', sub: 'positive = subtitles appear later', min: -10, max: 10, step: .1, get: () => prefs.subDelay, set: v => { prefs.subDelay = Math.round(v * 10) / 10; savePrefs(); applySubStyle(); }, fmt: v => (v > 0 ? '+' : '') + v.toFixed(1) + ' s', def: 0 })
  );
})();

/* ============ LOOK — colours, the picture behind the controls, haptics ============ */
(() => {
  const p = panel('look');
  const ACCENTS = [['#f6d63b', 'Yellow'], ['#ff8a5c', 'Orange'], ['#ff6b8b', 'Pink'], ['#b58cff', 'Violet'], ['#6cb8ff', 'Blue'], ['#5ee0b0', 'Mint'], ['#f3f3f0', 'White']];
  const SHELLS = [['#2b2b2b', 'Charcoal'], ['#111111', 'Black'], ['#1f2a3a', 'Midnight'], ['#2c2230', 'Plum'], ['#1f3029', 'Forest'], ['#33271f', 'Cocoa']];
  const imgRow = btnRow(
    button('Choose picture', 'primary', () => skinFile.click()),
    button('Remove', 'danger', () => clearSkinImage())
  );
  showWhen(imgRow, () => look.skin === 'image' || hasSkinImage());
  const pic = h('div');
  pic.append(
    slider({ label: 'Picture strength', min: 0, max: 100, get: () => look.skinOp, set: v => setLook({ skinOp: v }), def: LOOK_DEFAULTS.skinOp }),
    slider({ label: 'Picture blur', min: 0, max: 20, get: () => look.skinBlur, set: v => setLook({ skinBlur: v }), fmt: v => v === 0 ? 'Off' : v + ' px', def: LOOK_DEFAULTS.skinBlur })
  );
  showWhen(pic, () => look.skin !== 'none');

  const petalRow = btnRow(
    button('Choose picture', 'primary', () => petalFile.click()),
    button('Remove', 'danger', () => clearPetalImage())
  );
  const petalPic = h('div');
  petalPic.append(
    slider({ label: 'Picture strength', min: 0, max: 100, get: () => look.petalOp, set: v => setLook({ petalOp: v }), def: LOOK_DEFAULTS.petalOp }),
    slider({ label: 'Picture blur', min: 0, max: 40, get: () => look.petalBlur, set: v => setLook({ petalBlur: v }), fmt: v => v === 0 ? 'Off' : v + ' px', def: LOOK_DEFAULTS.petalBlur })
  );
  petalFile.addEventListener('change', async () => { await loadPetalFile(petalFile.files && petalFile.files[0]); petalFile.value = ''; syncAll(); });

  p.append(
    group('Colours'),
    swatches({ label: 'Accent', colors: ACCENTS, get: () => look.accent, set: v => setLook({ accent: v }) }),
    swatches({ label: 'Controls shell', colors: SHELLS, get: () => look.shell, set: v => setLook({ shell: v }) }),
    toggle({ label: 'Coloured play button', sub: 'the reel uses the accent colour', get: () => look.reelAccent, set: v => setLook({ reelAccent: v ? 1 : 0 }) }),

    group('Picture behind the controls'),
    segmented({ label: 'Skin', options: [['none', 'Plain'], ['circuit', 'Circuit'], ['image', 'My picture']],
      get: () => look.skin, set: v => { if (v === 'image' && !hasSkinImage()) { skinFile.click(); return; } setLook({ skin: v }); syncAll(); } }),
    imgRow, pic,
    note('Your picture is shrunk and kept inside the app. Lower the strength if the controls get hard to read.'),

    group('Pads'),
    segmented({ label: 'Petals per pad', options: [[3, '3'], [6, '6'], [8, '8']], get: () => look.padPetals, set: v => { setLook({ padPetals: v }); haptic.thud(); } }),
    note('With 6 or 8 petals the extra petals are glass decoration. 8 petals also gives you separate faster and slower keys.'),
    slider({ label: 'Pad size', min: 50, max: 220, step: 5, get: () => look.padScale, set: v => setLook({ padScale: v }), def: LOOK_DEFAULTS.padScale }),
    slider({ label: 'Space between pads', min: -20, max: 400, step: 2, fmt: v => v + ' px', get: () => look.padGap, set: v => setLook({ padGap: v }), def: LOOK_DEFAULTS.padGap }),
    btnRow(button('Move the controls', 'primary', () => { closeSheet(); startArranging(); }), button('Reset positions', '', () => resetLayout())),
    note('Move: drag the seek bar, each pad, play and loop anywhere — even off the edge of the screen. Tap Done when finished.'),

    group('Icons'),
    swatches({ label: 'Icon colour', colors: [['#ebf1fa', 'Soft white'], ['#ffffff', 'White'], ['#ffd54a', 'Yellow'], ['#6ee7ff', 'Cyan'], ['#c9a2ff', 'Violet'], ['#ff6b81', 'Red']], get: () => look.icoColor, set: v => setLook({ icoColor: v }) }),
    slider({ label: 'Icon size', min: 50, max: 200, step: 5, get: () => look.icoSize, set: v => setLook({ icoSize: v }), def: LOOK_DEFAULTS.icoSize }),

    group('Behind the petals'),
    segmented({ options: [[0, 'Off'], [1, 'Picture'], [2, 'Mirror'], [3, 'Ambient']], get: () => look.petalMode, set: v => { setLook({ petalMode: v }); syncAll(); } }),
    showWhen(petalRow, () => look.petalMode === 1),
    showWhen(petalPic, () => look.petalMode !== 0),
    note('Picture: your own image · Mirror: the video itself, blurred · Ambient: the video\'s colours as a soft glow. All shown through the glass petals only.'),

    group('Feel'),
    slider({ label: 'Vibration strength', sub: 'drag to feel it · 0 turns vibration off', min: 0, max: 100, step: 5, get: () => look.hapticStr, set: v => { setLook({ hapticStr: v }); haptic.thud(); }, fmt: v => v === 0 ? 'Off' : v + '%', def: LOOK_DEFAULTS.hapticStr }),
    btnRow(button('Test vibration', '', hapticDemo)),
    note('Sliders tick every 5 % while you drag, and thud at the default value and at both ends. The pad keys click the moment they go down. If you feel nothing, the app needs the Android vibrate permission (see the release notes).'),

    btnRow(button('Reset look', 'danger', () => { setLook(Object.assign({}, LOOK_DEFAULTS)); syncAll(); }))
  );
  skinFile.addEventListener('change', async () => { await loadSkinFile(skinFile.files && skinFile.files[0]); skinFile.value = ''; syncAll(); });
})();

/* ============ MEDIA ============ */
(() => {
  const p = panel('media');
  const about = h('div', 'about');
  about.innerHTML = `<b>${APP_NAME}</b> · v${APP_VERSION}<br>Ambient light engine from <i>youtube-ambilight</i> by Wessel Kroos (MIT).<br>Mirror background from the “ambient video player” v27.`;
  p.append(
    group('Files'),
    fileRow('Video', () => S.videoName, button('Open', '', pickVideoFile)),
    fileRow('Subtitles (SRT)', () => S.srtName, button('Open', '', pickSrtFile), button('Remove', 'danger', removeSrt)),
    fileRow('Extended video', () => S.extName, button('Import', '', pickExtFile), button('Remove', 'danger', () => ext.clear())),
    about
  );
})();

/* ============ sheet open / close + tabs ============ */
function selectTab(id) {
  [...tabs.children].forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
  sheetBody.querySelectorAll('.panel').forEach(pn => pn.classList.toggle('hidden', pn.dataset.panel !== id));
  sheetBody.scrollTop = 0;
  const sel = tabs.querySelector('[aria-selected="true"]');
  if (sel) tabs.scrollLeft = sel.offsetLeft - (tabs.clientWidth - sel.offsetWidth) / 2;     // scroll only the tab strip, never the page
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
selectTab('video');
