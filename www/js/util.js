export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const mkCv = (w = 1, h = 1) => Object.assign(document.createElement('canvas'), { width: w, height: h });

export function fmtTime(t) {
  if (!Number.isFinite(t)) return '0:00';
  t = Math.max(0, Math.floor(t));
  const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/* localStorage helpers: everything is wrapped, storage can be blocked or empty. */
export function loadJSON(key, defaults) {
  const o = Object.assign({}, defaults);
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    for (const k of Object.keys(defaults)) if (typeof saved[k] === typeof defaults[k]) o[k] = saved[k];
  } catch (e) { /* ignore */ }
  return o;
}
export function saveJSON(key, obj) {
  try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) { /* ignore */ }
}

export const waitEvent = (target, name, ms) => new Promise((resolve, reject) => {
  const t = setTimeout(() => { target.removeEventListener(name, on); reject(new Error('timeout')); }, ms);
  const on = () => { clearTimeout(t); target.removeEventListener(name, on); resolve(); };
  target.addEventListener(name, on);
});
