/* Ambilight engine — ported from WesselKroos/youtube-ambilight (MIT licence, see THIRD_PARTY_NOTICES.md), 2D-canvas renderer.

   1. A STACK of copies of the picture. Each copy is scaled a little bigger than the one above it ("Edge size"),
      so together they form rings of colour that continue past the picture's edges.
   2. The whole stack is blurred with CSS ("Blur") and colour-adjusted (brightness / contrast / saturation).
   3. A black SHADOW gradient sits on top and fades the glow out with distance ("Spread", "fade start", "fade curve").
   4. Optional FRAME BLENDING cross-fades between video frames, and FLICKER REDUCTION limits how fast the brightness
      of the glow may change. The real <video> sits above all of this, untouched.

   The glow is built from the VISIBLE part of the picture (after crop, zoom, move): see setGeometry(). */
import { video, ambi, ambiFilter, ambiProj, ambiNoise } from './dom.js';
import { S, amb, modes, bgMode } from './state.js';
import { clamp, mkCv } from './util.js';

const INNER = 2;          // scaled-down layers inside the picture (they smooth the join with the picture's edge)
const MAXPOS = 6;         // most rings outside the picture in "Fit player" mode (fewer canvases = steadier on phones)

const pr = { list: [], w: 0, h: 0 };
let dirty = true, cleared = true, snap = true, lastAlpha = 1, blendT0 = 0, fPrev = null;
/* frame-rate estimates, kept up to date by the draw loop (background.js) */
export const timing = { vDur: 33.3, dDur: 16.7 };

/* ---- shadow: the fade-out gradient (same maths as the extension's ProjectorShadow) ---- */
const SH = 512;
const shadowCv = Object.assign(mkCv(SH, SH), { className: 'ambi-shadow' });
const sctx = shadowCv.getContext('2d');
ambiProj.appendChild(shadowCv);
let shadowKey = '';

function shadowGradient(size, edge, keyframes, fadeOutFrom, horizontal) {
  const pts = [0,
    ...keyframes.map(e => Math.max(0, edge - edge * e.p - edge * fadeOutFrom * (1 - e.p))),
    edge - edge * fadeOutFrom,
    edge + size + edge * fadeOutFrom,
    ...keyframes.slice().reverse().map(e => Math.min(edge + size + edge, edge + size + edge * e.p + edge * fadeOutFrom * (1 - e.p))),
    edge + size + edge];
  const max = pts[pts.length - 1] || 1, K = keyframes.length, stops = [];
  stops.push([Math.min(1, pts[0] / max), 1]);
  const kr = keyframes.slice().reverse();                                   // (the extension reverses the array in place here, so the first half reads it reversed)
  for (let i = 0; i < K; i++) stops.push([Math.min(1, pts[K - i] / max), kr[i].o]);
  stops.push([Math.min(1, pts[1 + K] / max), 0]);
  stops.push([Math.min(1, pts[2 + K] / max), 0]);
  for (let i = 0; i < K; i++) stops.push([Math.min(1, pts[2 + K * 2 - i] / max), keyframes[i].o]);
  stops.push([Math.min(1, pts[3 + K * 2] / max), 1]);
  const g = sctx.createLinearGradient(0, 0, horizontal ? SH : 0, horizontal ? 0 : SH);
  for (const [o, a] of stops) g.addColorStop(Math.round(o * 10000) / 10000, `rgba(0,0,0,${Math.round(a * 10000) / 10000})`);
  sctx.fillStyle = g; sctx.fillRect(0, 0, SH, SH);
}

function shadowRescale(scale, ps) {
  shadowCv.style.transform = `scale(${scale.x + .01}, ${scale.y + .01})`;
  const dirs = { top: modes.top === 1, bottom: modes.bottom === 1, left: modes.side === 1, right: modes.side === 1 };
  const key = JSON.stringify([scale, ps, amb.fadeCurve, amb.fadeStart, dirs]);
  if (key === shadowKey) return;
  shadowKey = key;
  sctx.clearRect(0, 0, SH, SH);
  const edge = { w: (ps.w * scale.x - ps.w) / 2 / scale.x, h: (ps.h * scale.y - ps.h) / 2 / scale.y };
  const vid = { w: ps.w / scale.x, h: ps.h / scale.y };
  const easing = 16 / (amb.fadeCurve * .64), kf = [];
  for (let i = 1; i < 256; i++) kf.push({ p: Math.round(i / 256 * 10000) / 10000, o: Math.round(Math.pow(i / 256, easing) * 10000) / 10000 });
  let from = amb.fadeStart / 100;
  from = Math.max(from, -(vid.h / 2 / edge.h), -(vid.w / 2 / edge.w));
  if (!Number.isFinite(from)) from = amb.fadeStart / 100;
  if (edge.w < .01 && edge.h < .01) return;                               // nothing outside the picture: no shadow needed
  try { shadowGradient(vid.h, edge.h, kf, from, false); shadowGradient(vid.w, edge.w, kf, from, true); } catch (e) { sctx.clearRect(0, 0, SH, SH); return; }
  // switched-off directions: paint the matching quarter of the glow black
  const sw = SH / (vid.w + edge.w * 2), sh = SH / (vid.h + edge.h * 2), W = SH, H = SH;
  const cx = sw * (edge.w + vid.w / 2), cy = sh * (edge.h + vid.h / 2), L = sw * edge.w, R = sw * (edge.w + vid.w), T = sh * edge.h, B = sh * (edge.h + vid.h);
  sctx.fillStyle = '#000';
  const poly = pts => { sctx.beginPath(); pts.forEach(([x, y], i) => i ? sctx.lineTo(x, y) : sctx.moveTo(x, y)); sctx.closePath(); sctx.fill(); };
  if (!dirs.top) poly([[0, 0], [L, T], [cx, cy], [R, T], [W, 0]]);
  if (!dirs.right) poly([[W, 0], [R, T], [cx, cy], [R, B], [W, H]]);
  if (!dirs.bottom) poly([[0, H], [L, B], [cx, cy], [R, B], [W, H]]);
  if (!dirs.left) poly([[0, 0], [L, T], [cx, cy], [L, B], [0, H]]);
}

/* ---- geometry: where the visible picture is, and which part of the video it shows ----
   The picture may be zoomed / moved so that it spills past the display. Only the part inside the display is used,
   so the glow always reaches from the edge of what you actually see, and the canvases stay small. */
export function setGeometry(r) {
  dirty = true;
  if (!r) { S.geo = null; return; }
  const vx0 = Math.max(r.dx, 0), vy0 = Math.max(r.dy, 0);
  const vx1 = Math.min(r.dx + r.dw, r.W), vy1 = Math.min(r.dy + r.dh, r.H);
  if (vx1 - vx0 < 2 || vy1 - vy0 < 2) { S.geo = null; return; }
  const kx = r.regW / r.dw, ky = r.regH / r.dh;                 // video px per screen px
  const g = {
    r: Object.assign({}, r, { dx: vx0, dy: vy0, dw: vx1 - vx0, dh: vy1 - vy0 }),
    sx: r.regX + (vx0 - r.dx) * kx, sy: r.regY + (vy0 - r.dy) * ky,
    sw: (vx1 - vx0) * kx, sh: (vy1 - vy0) * ky
  };
  S.geo = (g.sw >= 2 && g.sh >= 2) ? g : null;
}

const buf = mkCv(), bctx = buf.getContext('2d');             // newest frame
const prevBuf = mkCv(), prevCtx = prevBuf.getContext('2d');  // frame before it (frame blending)
const blendBuf = mkCv(), blendCtx = blendBuf.getContext('2d');
const proc = mkCv(), pcx = proc.getContext('2d', { willReadFrequently: true });   // small canvas for flicker reduction
bctx.imageSmoothingQuality = 'high';

function layout() {
  const g = S.geo; if (!g) return false;
  const r = g.r, W = r.W, H = r.H;
  const dx = Math.round(r.dx), dy = Math.round(r.dy), dw = Math.round(r.dw), dh = Math.round(r.dh);
  if (dw < 4 || dh < 4) return false;
  Object.assign(ambiProj.style, { left: dx + 'px', top: dy + 'px', width: dw + 'px', height: dh + 'px' });

  // size of the small canvases the picture is drawn into (the blur hides the lower resolution)
  const pMin = Math.max(160, Math.min(256, g.sw, g.sh)), ps = Math.max(pMin / g.sw, pMin / g.sh);
  const w = Math.ceil(g.sw * ps), h = Math.ceil(g.sh * ps);
  if (pr.w !== w || pr.h !== h) { pr.w = w; pr.h = h; }
  for (const c of [buf, prevBuf, blendBuf]) { if (c.width !== w) c.width = w; if (c.height !== h) c.height = h; }
  bctx.imageSmoothingQuality = 'high';
  const pf = 192 / Math.max(w, h), fw = Math.max(16, Math.round(w * pf)), fh = Math.max(16, Math.round(h * pf));
  if (proc.width !== fw) proc.width = fw;
  if (proc.height !== fh) proc.height = fh;

  // rings: every ring is `step` bigger than the one inside it
  const ratio = w > h ? { x: 1, y: w / h } : { x: h / w, y: 1 };
  let step = amb.edge / 100, posMax;
  if (amb.fit) {
    const gx = Math.max(0, dx, W - dx - dw), gy = Math.max(0, dy, H - dy - dh);   // free space around the picture, in px
    const needX = 2 * gx / dw / ratio.x, needY = 2 * gy / dh / ratio.y;            // step*rings needed to reach the player's edge
    const need = Math.max(needX, needY);
    posMax = clamp(Math.ceil(need / step - 1e-6), 1, MAXPOS);
    if (need > 0) step = need / posMax;
  } else posMax = Math.max(0, Math.round(amb.spread / amb.edge));
  const levels = Math.max(2, posMax + INNER + 1);

  while (pr.list.length > levels) pr.list.pop().c.remove();
  while (pr.list.length < levels) {
    const c = mkCv(w, h); c.className = 'ambi-level';
    ambiProj.insertBefore(c, ambiProj.firstChild);                                // later = lower in the stack = bigger
    pr.list.push({ c, x: c.getContext('2d') });
  }
  let last = { x: 1, y: 1 };
  pr.list.forEach((p, i) => {
    if (p.c.width !== w) p.c.width = w;
    if (p.c.height !== h) p.c.height = h;
    const pos = i - INNER; let sx = 1, sy = 1;
    if (pos > 0) { sx = 1 + step * ratio.x * pos; sy = 1 + step * ratio.y * pos; }
    if (pos < 0) { sx = Math.max(0, 1 - step * ratio.x * -pos); sy = Math.max(0, 1 - step * ratio.y * -pos); }
    last = { x: sx, y: sy };
    p.c.style.transform = `scale(${Math.max(1 / w, sx)}, ${Math.max(1 / h, sy)})`;
  });
  shadowRescale(last, { w, h });

  const blurPx = amb.blur ? Math.max(4, Math.round(dh * .0025 * amb.blur)) : 0;   // any blur at all is at least 4px: hides video grain
  ambiFilter.style.filter = [
    blurPx ? `blur(${blurPx}px)` : '',
    amb.contrast !== 100 ? `contrast(${amb.contrast}%)` : '',
    amb.brightness !== 100 ? `brightness(${amb.brightness}%)` : '',
    amb.saturation !== 100 ? `saturate(${amb.saturation}%)` : ''
  ].filter(Boolean).join(' ');
  ambiNoise.style.display = amb.debanding ? '' : 'none';           // a blended layer that is invisible still costs a composite
  ambiNoise.style.opacity = amb.debanding ? String(clamp(amb.debanding / 100, 0, 1)) : '0';
  ambi.style.display = bgMode() === 1 ? '' : 'none';
  return true;
}

/* dither tile for "Debanding": mid-grey noise, blended with "overlay" so pure black stays black */
(() => {
  try {
    const n = mkCv(128, 128), x = n.getContext('2d'), id = x.createImageData(128, 128);
    for (let i = 0; i < id.data.length; i += 4) { const v = 96 + Math.random() * 64; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    x.putImageData(id, 0, 0);
    ambiNoise.style.backgroundImage = `url(${n.toDataURL('image/png')})`;
  } catch (e) { /* ignore */ }
})();

/* Shrinks the video in steps of at most 2x. One big jump (e.g. 1080p -> 360p) only samples some pixels, which makes the
   glow shimmer / look grainy; halving step by step averages every pixel instead. */
const stepCv = [mkCv(), mkCv()], stepCx = stepCv.map(c => c.getContext('2d'));
stepCx.forEach(x => { x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; });
function downscale(src, sx, sy, sw, sh, dstCtx, dw, dh) {
  let cw = sw, ch = sh, from = src, fx = sx, fy = sy, i = 0;
  while (cw / 2 > dw * 1.01 && ch / 2 > dh * 1.01 && i < 8) {
    const tw = Math.max(dw, Math.round(cw / 2)), th = Math.max(dh, Math.round(ch / 2)), k = i & 1;
    if (stepCv[k].width !== tw) stepCv[k].width = tw;
    if (stepCv[k].height !== th) stepCv[k].height = th;
    stepCx[k].drawImage(from, fx, fy, cw, ch, 0, 0, tw, th);
    from = stepCv[k]; fx = 0; fy = 0; cw = tw; ch = th; i++;
  }
  dstCtx.imageSmoothingQuality = 'high';
  dstCtx.drawImage(from, fx, fy, cw, ch, 0, 0, dw, dh);
}

function captureFrame(fresh) {
  const g = S.geo;
  try {
    if (amb.flicker > 0) {
      downscale(video, g.sx, g.sy, g.sw, g.sh, pcx, proc.width, proc.height);
      const id = pcx.getImageData(0, 0, proc.width, proc.height), d = id.data;
      if (!fPrev || fPrev.length !== d.length) { fPrev = new Uint8ClampedArray(d.length); fresh = true; }
      if (!fresh) {
        // limit how fast each pixel's brightness may change: big jumps in brightness are followed more slowly
        const fd = (118 - amb.flicker) / 118, fp = fPrev;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], gg = d[i + 1], b = d[i + 2], pr0 = fp[i], pg = fp[i + 1], pb = fp[i + 2];
          const dl = Math.abs((r * .213 + gg * .715 + b * .072) - (pr0 * .213 + pg * .715 + pb * .072)) / 255;
          const k = Math.max(fd * .1, (1 - dl * dl * dl) * fd);
          d[i] = pr0 + (r - pr0) * k; d[i + 1] = pg + (gg - pg) * k; d[i + 2] = pb + (b - pb) * k;
        }
      }
      fPrev.set(d);
      pcx.putImageData(id, 0, 0);
      bctx.drawImage(proc, 0, 0, buf.width, buf.height);
    } else {
      fPrev = null;
      downscale(video, g.sx, g.sy, g.sw, g.sh, bctx, buf.width, buf.height);
    }
    return true;
  } catch (e) { return false; }
}

export function draw(newFrame) {
  if (bgMode() !== 1 || !S.geo || video.readyState < 2 || !video.videoWidth) return;
  if (dirty) { dirty = false; if (!layout()) return; cleared = true; }
  const now = performance.now(), blending = !!amb.blending && amb.blendSmooth > 0;
  const fresh = cleared || snap;
  let drew = false;
  if (newFrame || fresh) {
    if (blending && !fresh) prevCtx.drawImage(buf, 0, 0);                         // the frame we are fading away from
    if (!captureFrame(fresh)) return;
    if (blending && fresh) prevCtx.drawImage(buf, 0, 0);
    blendT0 = now - timing.dDur / 2; drew = true;
  }
  let alpha = 1;
  if (blending && !fresh && 1000 / timing.dDur >= 1000 / timing.vDur * 1.33) {    // only useful when the screen is faster than the video
    alpha = clamp((now - blendT0) / (timing.vDur * Math.max(.05, amb.blendSmooth / 100)), 0, 1);
  }
  if (drew || fresh || alpha !== lastAlpha) {
    let src = buf;
    if (blending && alpha < 1) {
      blendCtx.globalAlpha = 1; blendCtx.drawImage(prevBuf, 0, 0);
      blendCtx.globalAlpha = alpha; blendCtx.drawImage(buf, 0, 0);
      blendCtx.globalAlpha = 1; src = blendBuf;
    }
    for (const p of pr.list) p.x.drawImage(src, 0, 0);
    lastAlpha = alpha;
  }
  cleared = false; snap = false;
}

export const invalidate = () => { dirty = true; };
export const markSeek = () => { snap = true; };
export function reset() { S.geo = null; fPrev = null; cleared = true; snap = true; dirty = true; lastAlpha = 1; }
