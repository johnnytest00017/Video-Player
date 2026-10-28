/* Pad layout: 3 / 6 / 8 petals per pad. Draws the petal shapes + places the icons for whatever count is chosen.
   The real buttons stay in the page (so their handlers survive); only their shapes move. Extra petals are glass decoration. */
const C = 200, R = 182;
const PARAMS = {
  3: { half: 60,   hole: 46, gap: 16, wmax: 46, icon: 4.0, off: 14 },
  6: { half: 30,   hole: 40, gap: 12, wmax: 34, icon: 3.4, off: 10 },
  8: { half: 22.5, hole: 38, gap: 12, wmax: 30, icon: 3.0, off: 8 }
};
/* which petal slot (0 = top, clockwise) each button takes */
const SLOTS = {
  left:  { 3: { fsToggle: 0, backward: 1, speedUp: 2 }, 6: { fsToggle: 0, backward: 2, speedUp: 4 }, 8: { fsToggle: 0, backward: 2, speedUp: 4, speedDown: 6 } },
  right: { 3: { settingsToggle: 0, forward: 1, adjustToggle: 2 }, 6: { settingsToggle: 0, forward: 2, adjustToggle: 4 }, 8: { settingsToggle: 0, forward: 2, adjustToggle: 4 } }
};
const ALL = { left: ['fsToggle', 'speedUp', 'speedDown', 'backward'], right: ['settingsToggle', 'adjustToggle', 'forward'] };
const WIDE = new Set(['forward', 'backward']);   // these two react to a press anywhere in their slice of the pad, not just on the petal

function petal(center, P, sc, side) {
  const a = P.half * Math.PI / 180, t = Math.tan(a);
  const w = Math.max(0, Math.min(P.wmax, 2 * (0.45 * R * Math.sin(a) - P.gap / 2)));
  const d = P.gap / 2 + w / 2, k = d / Math.cos(a), apex = k / t;
  const edgeX = rho => (t * k + Math.sqrt(Math.max(0, t * t * k * k - (1 + t * t) * (k * k - rho * rho)))) / (1 + t * t);
  const rIn = Math.max(P.hole + w / 2, apex + .5), rO = Math.max(R - w / 2, rIn + 1);
  const xi = edgeX(rIn), xo = edgeX(rO), yi = t * xi - k, yo = t * xo - k;
  const th = center * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th), qy = side * yi;
  const Pt = (x, y) => { x = xi + sc * (x - xi); y = qy + sc * (y - qy); return (C + x * cs - y * sn).toFixed(2) + ' ' + (C + x * sn + y * cs).toFixed(2); };
  const d_ = 'M' + Pt(xi, yi) + 'L' + Pt(xo, yo) + 'A' + (rO * sc).toFixed(2) + ' ' + (rO * sc).toFixed(2) + ' 0 0 0 ' + Pt(xo, -yo) +
    'L' + Pt(xi, -yi) + 'A' + (rIn * sc).toFixed(2) + ' ' + (rIn * sc).toFixed(2) + ' 0 0 1 ' + Pt(xi, yi) + 'Z';
  return { d: d_, w, rIn, rO };
}

const NS = 'http://www.w3.org/2000/svg';
let lastKey = '';

export function layoutPads(n, size) {
  n = PARAMS[n] ? n : 3; size = (size || 100) / 100;
  const key = n + ':' + size;
  if (key === lastKey) return;
  lastKey = key;
  const pads = document.querySelector('.pads');
  if (!pads) return;
  pads.dataset.n = String(n);
  const P = PARAMS[n];
  for (const side of ['left', 'right']) {
    const well = document.querySelector(side === 'left' ? '.well.cyan' : '.well.violet');
    if (!well) continue;
    well.querySelectorAll(':scope > .dec').forEach(e => e.remove());
    const slots = SLOTS[side][n], taken = new Set(Object.values(slots)), mask = [];
    for (const id of ALL[side]) {
      const btn = document.getElementById(id);
      if (!btn) continue;
      const slot = slots[id];
      btn.style.display = slot === undefined ? 'none' : '';
      if (slot === undefined) continue;
      const c = -90 + (360 / n) * slot, g = petal(c, P, 1, -1);
      mask.push([g.d, g.w]);
      const body = btn.querySelector('.body'); body.setAttribute('d', g.d); body.setAttribute('stroke-width', g.w.toFixed(2));
      const rc = (g.rIn + g.rO) / 2 + P.off, s = P.icon * size;
      const cx = C + rc * Math.cos(c * Math.PI / 180), cy = C + rc * Math.sin(c * Math.PI / 180);
      if (WIDE.has(id)) {
        const svg = btn.querySelector('svg');
        let hit = svg.querySelector('.hit');
        if (!hit) { hit = document.createElementNS(NS, 'path'); hit.setAttribute('class', 'hit'); svg.insertBefore(hit, svg.firstChild); }
        const h = 180 / n, a1 = (c - h) * Math.PI / 180, a2 = (c + h) * Math.PI / 180, rr = 260;
        const q = a => (C + rr * Math.cos(a)).toFixed(1) + ' ' + (C + rr * Math.sin(a)).toFixed(1);
        hit.setAttribute('d', `M${C} ${C}L${q(a1)}A${rr} ${rr} 0 0 1 ${q(a2)}Z`);
      }
      const lab = btn.querySelector('.lab');
      const dy = lab ? -6 * s : 0;
      btn.querySelector('.ico').setAttribute('transform', `translate(${cx.toFixed(1)} ${(cy + dy).toFixed(1)}) scale(${s.toFixed(2)}) translate(-12 -12)`);
      if (lab) { lab.setAttribute('x', cx.toFixed(1)); lab.setAttribute('y', (cy + 11.5 * s).toFixed(1)); lab.style.fontSize = (9 * s).toFixed(1) + 'px'; }
    }
    if (n > 3) {
      for (let i = 0; i < n; i++) {
        if (taken.has(i)) continue;
        const big = n === 8 && side === 'right' && i === 6;
        const g = petal(-90 + (360 / n) * i, P, big ? 1 : .6, i % 2 ? 1 : -1), w = big ? g.w : g.w * .5;
        mask.push([g.d, w]);
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('class', 'dec'); svg.setAttribute('viewBox', '0 0 400 400'); svg.setAttribute('aria-hidden', 'true');
        svg.innerHTML = `<g class="pt"><path class="body" d="${g.d}" stroke-width="${w.toFixed(2)}"/></g>`;
        well.appendChild(svg);
      }
    }
    const glass = well.querySelector('.petal-glass');
    if (glass) {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><g fill="#fff" stroke="#fff" stroke-linejoin="round">' +
        mask.map(([d, w]) => `<path d="${d}" stroke-width="${w.toFixed(2)}"/>`).join('') + '</g></svg>';
      const url = 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
      for (const p of ['-webkit-mask-image', 'mask-image']) glass.style.setProperty(p, url);
      for (const [p, v] of [['mask-size', '100% 100%'], ['mask-repeat', 'no-repeat'], ['mask-position', 'center']]) {
        glass.style.setProperty('-webkit-' + p, v); glass.style.setProperty(p, v);
      }
    }
  }
}
