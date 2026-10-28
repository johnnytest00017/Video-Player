/* Move the controls: the seek bar, the two pads, play and loop. Drag them in "arrange" mode; positions are remembered. */
const KEY = 'avp.layout.v1';
let pos = {};
try { pos = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { pos = {}; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(pos)); } catch (e) { /* ignore */ } };
const items = () => [...document.querySelectorAll('[data-mv]')];
const apply = el => { const p = pos[el.dataset.mv]; el.style.translate = p ? p[0] + 'px ' + p[1] + 'px' : ''; };
const applyAll = () => items().forEach(apply);
applyAll();

const bar = document.getElementById('arrangeBar');
let active = false;
export const isArranging = () => active;

export function startArranging() {
  active = true; document.documentElement.classList.add('arranging'); bar.hidden = false;
}
export function stopArranging() {
  active = false; document.documentElement.classList.remove('arranging'); bar.hidden = true;
}
export function resetLayout() { pos = {}; save(); applyAll(); }

document.getElementById('arrangeDone').addEventListener('click', stopArranging);
document.getElementById('arrangeReset').addEventListener('click', resetLayout);

/* while arranging, nothing on the controls does its normal job — a press picks the control up instead */
let drag = null;
const block = e => {
  if (!active) return;
  const el = e.target.closest && e.target.closest('[data-mv]');
  if (!el && !(e.target.closest && e.target.closest('#arrangeBar'))) return;
  if (el) { e.stopImmediatePropagation(); e.preventDefault(); }
};
for (const t of ['click', 'touchstart', 'mousedown', 'contextmenu']) window.addEventListener(t, block, true);

window.addEventListener('pointerdown', e => {
  if (!active) return;
  const el = e.target.closest && e.target.closest('[data-mv]');
  if (!el) return;
  e.stopImmediatePropagation(); e.preventDefault();
  const k = el.dataset.mv, p = pos[k] || [0, 0];
  drag = { el, k, id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: p[0], oy: p[1] };
  el.classList.add('dragging');
}, true);
window.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  const lim = Math.max(innerWidth, innerHeight) * 1.2;
  const x = Math.max(-lim, Math.min(lim, drag.ox + e.clientX - drag.sx)), y = Math.max(-lim, Math.min(lim, drag.oy + e.clientY - drag.sy));
  pos[drag.k] = [Math.round(x), Math.round(y)]; apply(drag.el);
  e.preventDefault();
}, true);
const end = e => { if (!drag || e.pointerId !== drag.id) return; drag.el.classList.remove('dragging'); drag = null; save(); };
window.addEventListener('pointerup', end, true); window.addEventListener('pointercancel', end, true);
