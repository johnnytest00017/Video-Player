/* Live glass behind the petals + the play button.
   Mirror = the video itself (blurred), Ambient = its colours as a soft glow.
   ONE big picture is spread across every glass piece, so red on the right of the video shows in the right pad and yellow on the left in the left pad.
   Smooth, not flickery: the video is shrunk in two steps (no aliasing), blended with the previous frame, and redrawn at a calm rate. */
import { video } from './dom.js';
import { look } from './state.js';

const targets = [['.well.cyan'], ['.well.violet'], ['#playPause'], ['.seek-wrap']].map(([sel]) => {
  const el = document.querySelector(sel);
  return el && { el, glass: el.querySelector('.petal-glass, .pill-glass, .seek-glass'), pic: el.querySelector('.pic'), cv: el.querySelector('.pic canvas') };
}).filter(t => t && t.glass && t.pic && t.cv);

const mid = document.createElement('canvas'), field = document.createElement('canvas');
const mctx = mid.getContext('2d'), fctx = field.getContext('2d');
let raf = 0, last = 0, first = true, sizeKey = '';

function frame(t) {
  raf = requestAnimationFrame(frame);
  const mode = look.petalMode;
  if ((mode !== 2 && mode !== 3) || document.hidden) return;
  if (t - last < (video.paused ? 500 : 70)) return;
  last = t;
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw) return;

  const rects = targets.map(x => x.el.getBoundingClientRect());
  const ex = rects.map(r => .25 * Math.min(r.width, r.height));
  const M = Math.max(...ex, 4);
  let L = Infinity, T = Infinity, Rr = -Infinity, B = -Infinity;
  rects.forEach(r => { L = Math.min(L, r.left); T = Math.min(T, r.top); Rr = Math.max(Rr, r.right); B = Math.max(B, r.bottom); });
  L -= M; T -= M; Rr += M; B += M;
  const uw = Math.max(1, Rr - L), uh = Math.max(1, B - T);

  const fw = mode === 3 ? 28 : 110, fh = Math.max(4, Math.min(160, Math.round(fw * uh / uw)));
  const key = mode + ':' + fw + 'x' + fh;
  if (key !== sizeKey) {
    sizeKey = key; first = true;
    field.width = fw; field.height = fh; mid.width = fw * 4; mid.height = fh * 4;
    mctx.imageSmoothingEnabled = true; mctx.imageSmoothingQuality = 'high';
    fctx.imageSmoothingEnabled = true; fctx.imageSmoothingQuality = 'high';
  }

  /* the video, "cover"-fitted over the whole glass area */
  const ua = uw / uh, va = vw / vh;
  let sw, sh, sx, sy;
  if (va > ua) { sh = vh; sw = vh * ua; sx = (vw - sw) / 2; sy = 0; } else { sw = vw; sh = vw / ua; sx = 0; sy = (vh - sh) / 2; }
  try {
    mctx.globalAlpha = 1; mctx.drawImage(video, sx, sy, sw, sh, 0, 0, mid.width, mid.height);
    fctx.globalAlpha = first ? 1 : (mode === 3 ? .14 : .4);
    fctx.drawImage(mid, 0, 0, fw, fh);
    first = false;
  } catch (e) { return; }

  targets.forEach((x, i) => {
    const r = rects[i], e = ex[i];
    const tl = r.left - e, tt = r.top - e, tw = r.width + 2 * e, th = r.height + 2 * e;
    const g = x.glass.getBoundingClientRect();
    Object.assign(x.pic.style, { left: (tl - g.left) + 'px', top: (tt - g.top) + 'px', width: tw + 'px', height: th + 'px', right: 'auto', bottom: 'auto' });
    const fx = (tl - L) / uw * fw, fy = (tt - T) / uh * fh, fsw = tw / uw * fw, fsh = th / uh * fh;
    const cw = Math.max(2, Math.round(fsw)), ch = Math.max(2, Math.round(fsh));
    if (x.cv.width !== cw || x.cv.height !== ch) { x.cv.width = cw; x.cv.height = ch; }
    const c = x.cv.getContext('2d');
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(field, Math.max(0, fx), Math.max(0, fy), Math.min(fsw, fw), Math.min(fsh, fh), 0, 0, cw, ch);
  });
}

export function refreshFx() {
  const on = look.petalMode === 2 || look.petalMode === 3;
  if (on && !raf) raf = requestAnimationFrame(frame);
  if (!on && raf) {
    cancelAnimationFrame(raf); raf = 0;
    targets.forEach(x => { for (const p of ['left', 'top', 'width', 'height', 'right', 'bottom', 'inset']) x.pic.style[p] = ''; });
  }
  first = true; last = 0; sizeKey = '';
}
