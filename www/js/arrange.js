/* Arrange the controls: seek bar, left pad, right pad, play, loop.
   Drag them (optionally snapping to a grid) or fine-tune with sliders: X, Y and size for the selected control. Everything is remembered. */
const KEY = 'avp.layout.v3', GKEY = 'avp.layout.grid.v1';
const NAMES = { bar: 'Seek bar', left: 'Left pad', right: 'Right pad', play: 'Play', loop: 'Loop' };
/* where everything sits unless the user moves it: [x px, y px, size %] */
const DEFAULT = { left: [-34, -60, 100], right: [34, 60, 100], play: [0, 60, 100], loop: [0, 60, 100], bar: [0, 60, 112] };
let pos = {}, grid = { size: 16, snap: true };
try { pos = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { pos = {}; }
try { grid = Object.assign(grid, JSON.parse(localStorage.getItem(GKEY) || '{}')); } catch (e) { /* ignore */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(pos)); localStorage.setItem(GKEY, JSON.stringify(grid)); } catch (e) { /* ignore */ } };
const items = () => [...document.querySelectorAll('[data-mv]')];
const get = k => pos[k] || DEFAULT[k] || [0, 0, 100];
const apply = el => {
  const p = get(el.dataset.mv);
  el.style.translate = p[0] || p[1] ? p[0] + 'px ' + p[1] + 'px' : '';
  el.style.scale = p[2] && p[2] !== 100 ? String(p[2] / 100) : '';
};
const applyAll = () => items().forEach(apply);
applyAll();

const panel = document.getElementById('arrangeBar'), gridEl = document.getElementById('arrangeGrid');
let active = false, sel = 'left', lim = 800;
export const isArranging = () => active;

const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const els = {};

function build() {
  panel.textContent = '';
  const head = mk('div', 'ap-head');
  head.append(mk('b', null, 'Arrange controls'));
  const fold = mk('button', 'ap-fold', '▾'); fold.type = 'button'; fold.setAttribute('aria-label', 'Collapse');
  fold.addEventListener('click', () => { const c = panel.classList.toggle('folded'); fold.textContent = c ? '▴' : '▾'; });
  const done = mk('button', 'ap-done', 'Done'); done.type = 'button'; done.addEventListener('click', stopArranging);
  head.append(fold, done);

  const body = mk('div', 'ap-body');
  const chips = mk('div', 'ap-chips'); els.chips = {};
  for (const k of Object.keys(NAMES)) {
    const b = mk('button', 'ap-chip', NAMES[k]); b.type = 'button'; b.addEventListener('click', () => select(k));
    chips.append(b); els.chips[k] = b;
  }
  body.append(chips);

  const slider = (name, min, max, unit, onInput) => {
    const row = mk('label', 'ap-row'), nm = mk('span', 'ap-name', name), out = mk('output', 'ap-out');
    const r = document.createElement('input'); r.type = 'range'; r.min = min; r.max = max; r.step = 1;
    r.addEventListener('input', () => { onInput(+r.value); out.textContent = r.value + unit; });
    row.append(nm, r, out); body.append(row); return { r, out, unit };
  };
  els.x = slider('X', -lim, lim, ' px', v => setSel(0, v));
  els.y = slider('Y', -lim, lim, ' px', v => setSel(1, v));
  els.s = slider('Size', 30, 250, ' %', v => setSel(2, v));

  const gr = mk('div', 'ap-grid'); els.g = {};
  gr.append(mk('span', 'ap-name', 'Grid'));
  [[0, 'Off'], [8, '8'], [16, '16'], [24, '24'], [32, '32'], [48, '48']].forEach(([v, t]) => {
    const b = mk('button', 'ap-chip sm', t); b.type = 'button';
    b.addEventListener('click', () => { grid.size = v; save(); paintGrid(); });
    gr.append(b); els.g[v] = b;
  });
  const sn = mk('button', 'ap-chip sm snap', 'Snap'); sn.type = 'button';
  sn.addEventListener('click', () => { grid.snap = !grid.snap; save(); paintGrid(); });
  gr.append(sn); els.snap = sn;
  body.append(gr);

  const act = mk('div', 'ap-actions');
  const r1 = mk('button', 'ap-chip', 'Reset this'); r1.type = 'button';
  r1.addEventListener('click', () => { delete pos[sel]; save(); apply(el(sel)); sync(); });
  const r2 = mk('button', 'ap-chip', 'Reset all'); r2.type = 'button';
  r2.addEventListener('click', () => { resetLayout(); sync(); });
  act.append(r1, r2); body.append(act);
  panel.append(head, body);
}

const el = k => document.querySelector('[data-mv="' + k + '"]');

function setSel(i, v) {
  const p = get(sel).slice(); while (p.length < 3) p.push(100);
  p[i] = v; pos[sel] = p; apply(el(sel)); save();
}
function select(k) { sel = k; items().forEach(e => e.classList.toggle('sel', e.dataset.mv === k)); sync(); }
function sync() {
  const p = get(sel);
  els.x.r.value = p[0]; els.x.out.textContent = p[0] + ' px';
  els.y.r.value = p[1]; els.y.out.textContent = p[1] + ' px';
  const s = p[2] || 100; els.s.r.value = s; els.s.out.textContent = s + ' %';
  for (const k in els.chips) els.chips[k].setAttribute('aria-pressed', String(k === sel));
}
function paintGrid() {
  for (const v in els.g) els.g[v].setAttribute('aria-pressed', String(+v === grid.size));
  els.snap.setAttribute('aria-pressed', String(grid.snap)); els.snap.classList.toggle('dim', !grid.size);
  gridEl.hidden = !(active && grid.size > 0);
  gridEl.style.setProperty('--g', grid.size + 'px');
}

export function startArranging() {
  lim = Math.round(Math.max(innerWidth, innerHeight) * 1.2 / 10) * 10;
  build(); active = true;
  document.documentElement.classList.add('arranging'); panel.hidden = false; panel.classList.remove('folded');
  select(sel); paintGrid();
}
export function stopArranging() {
  active = false; document.documentElement.classList.remove('arranging'); panel.hidden = true; gridEl.hidden = true;
  items().forEach(e => e.classList.remove('sel', 'dragging'));
}
export function resetLayout() { pos = {}; save(); applyAll(); }

/* while arranging, nothing outside the panel does its normal job */
const inPanel = e => e.target.closest && e.target.closest('#arrangeBar');
const block = e => { if (active && !inPanel(e)) { e.stopImmediatePropagation(); if (e.cancelable) e.preventDefault(); } };
for (const t of ['click', 'touchstart', 'mousedown', 'contextmenu', 'dblclick']) window.addEventListener(t, block, true);

let drag = null;
window.addEventListener('pointerdown', e => {
  if (!active || inPanel(e)) return;
  e.stopImmediatePropagation(); e.preventDefault();
  const it = e.target.closest && e.target.closest('[data-mv]');
  if (!it) return;
  const k = it.dataset.mv; select(k);
  const p = get(k), r = it.getBoundingClientRect();
  drag = { it, k, id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: p[0], oy: p[1], bcx: r.left + r.width / 2 - p[0], bcy: r.top + r.height / 2 - p[1] };
  it.classList.add('dragging');
}, true);
window.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  let x = drag.ox + e.clientX - drag.sx, y = drag.oy + e.clientY - drag.sy;
  const g = grid.size;
  if (g > 0 && grid.snap) {            // snap the control's centre onto the grid lines
    x = Math.round((drag.bcx + x) / g) * g - drag.bcx;
    y = Math.round((drag.bcy + y) / g) * g - drag.bcy;
  }
  x = Math.max(-lim, Math.min(lim, Math.round(x))); y = Math.max(-lim, Math.min(lim, Math.round(y)));
  const p = get(drag.k).slice(); p[0] = x; p[1] = y; if (p.length < 3) p.push(100);
  pos[drag.k] = p; apply(drag.it); sync();
  e.preventDefault();
}, true);
const end = e => { if (!drag || e.pointerId !== drag.id) return; drag.it.classList.remove('dragging'); drag = null; save(); };
window.addEventListener('pointerup', end, true); window.addEventListener('pointercancel', end, true);
