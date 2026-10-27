/* MIRROR background (ported from ambient_video_player_crop v27).

   Only a thin strip along each edge of the picture is used. It is reflected outward, and the reflection is reflected again
   (ping-pong) until the gap is full, so every join is continuous. "Smart merge" then hides busy / minor-colour parts of the edge
   (a head, a moving object) by carrying calm colour in from the nearest calm positions. Each region (top, bottom, sides) has its
   own canvas and its own settings, and each canvas gets its own CSS blur / brightness / contrast / saturation. */
import { video, mirTop, mirBottom, mirSide, mirTopB, mirBottomB, mirSideB } from './dom.js';
import { S, modes, mir } from './state.js';
import { clamp } from './util.js';

const PAD = 96;                       // canvases overscan the display so the blur never fades at its edges (blur max 48 px)
const PW = 96, PH = 54, MR = 16;      // merge analysis grid, and depth of the merge overlay
const smooth01 = (lo, hi, x) => { const t = clamp((x - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t); };

/* cv = the reflection. cv2 = an optional second copy that carries the blur and is masked so the blur grows with distance. */
const mk = (cv, cv2) => ({ cv, g: cv.getContext('2d'), cv2, g2: cv2.getContext('2d'), filter: '', filter2: '', mask: '' });
const REG = { top: mk(mirTop, mirTopB), bottom: mk(mirBottom, mirBottomB), side: mk(mirSide, mirSideB) };
const band = Object.assign(document.createElement('canvas'), { width: 1, height: 1 });
const bg = band.getContext('2d');

let dirty = true, cw = 0, ch = 0;
export const invalidate = () => { dirty = true; };

/* ---------- smart merge (edge analysis) ---------- */
const probe = Object.assign(document.createElement('canvas'), { width: PW, height: PH });
const pctx = probe.getContext('2d', { willReadFrequently: true });
const mkEdge = (w, h, n) => {
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h }), x = c.getContext('2d');
  return { c, x, img: x.createImageData(w, h), n, m: new Float32Array(n), col: new Float32Array(n * 3), ready: false,
           cols: null, prevC: null, prevT: -1, raw: new Float32Array(n), mot: new Float32Array(n) };
};
const E = { top: mkEdge(PW, MR, PW), bot: mkEdge(PW, MR, PW), left: mkEdge(MR, PH, PH), right: mkEdge(MR, PH, PH) };
const boxAvg = (arr, chn, W) => {
  const n = arr.length / chn, out = new Float32Array(arr.length);
  for (let i = 0; i < n; i++) for (let c = 0; c < chn; c++) {
    let s = 0, w = 0;
    for (let j = Math.max(0, i - W); j <= Math.min(n - 1, i + W); j++) { s += arr[j * chn + c]; w++; }
    out[i * chn + c] = s / w;
  }
  return out;
};
const COV_D2 = 48 * 48;
function edgeCols(px, e, thick, idx) {
  const n = e.n, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let r = 0, g = 0, b = 0;
    for (let d = 0; d < thick; d++) { const k = idx(i, d); r += px[k]; g += px[k + 1]; b += px[k + 2]; }
    c[i * 3] = r / thick; c[i * 3 + 1] = g / thick; c[i * 3 + 2] = b / thick;
  }
  return c;
}
/* Two rules decide what must NOT appear in the extension:
   1) COVERAGE: a colour that covers less than the chosen share of the side is a minor colour (a head, a small object).
   2) MOTION: where the edge changes fast (something moving through it, a pan).
   Hidden parts are replaced by colour carried in from the nearest calm positions along the edge. */
function analyseEdge(px, e, thick, idx, horiz, snapAll, cfg) {
  const n = e.n, c = e.cols, W = Math.round(n * .5), thr = cfg.cov / 100, sens = cfg.sens / 100, merge = cfg.merge / 100;
  const minor = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const j0 = Math.max(0, i - W), j1 = Math.min(n - 1, i + W);
    let acc = 0;
    for (let d = 0; d < thick; d++) {
      const k = idx(i, d), r = px[k], g = px[k + 1], b = px[k + 2];
      let same = 0, tot = 0;
      for (let j = j0; j <= j1; j += 3) for (let dd = 0; dd < thick; dd += 2) {
        const q = idx(j, dd), dr = px[q] - r, dg = px[q + 1] - g, db = px[q + 2] - b;
        if (dr * dr + dg * dg + db * db < COV_D2) same++;
        tot++;
      }
      acc += 1 - smooth01(thr * .7, thr * 1.15, same / tot);
    }
    minor[i] = acc / thick;
  }
  const loc = boxAvg(minor, 1, W), mraw = boxAvg(e.raw, 1, 2), LOm = 6 / sens, HIm = 20 / sens, bad = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const minorS = smooth01(.25, .6, minor[i]) * (1 - smooth01(.7, .95, loc[i]));
    e.mot[i] = snapAll ? 0 : e.mot[i] + (mraw[i] - e.mot[i]) * .3;
    bad[i] = Math.max(minorS, smooth01(LOm, HIm, e.mot[i]));
  }
  const dil = new Float32Array(n);
  for (let i = 0; i < n; i++) { let mx = 0; for (let j = Math.max(0, i - 3); j <= Math.min(n - 1, i + 3); j++) mx = Math.max(mx, bad[j]); dil[i] = mx; }
  const m = boxAvg(dil, 1, 2), cs = boxAvg(c, 3, 1), wide = boxAvg(c, 3, Math.round(n * .3));
  const L = new Int16Array(n), R = new Int16Array(n);
  let last = -1; for (let i = 0; i < n; i++) { if (dil[i] < .3) last = i; L[i] = last; }
  last = -1; for (let i = n - 1; i >= 0; i--) { if (dil[i] < .3) last = i; R[i] = last; }
  const fill = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
    let v;
    if (dil[i] < .3) v = cs[i * 3 + k];
    else if (L[i] >= 0 && R[i] >= 0) { const t = (i - L[i]) / (R[i] - L[i]); v = cs[L[i] * 3 + k] * (1 - t) + cs[R[i] * 3 + k] * t; }
    else if (L[i] >= 0) v = cs[L[i] * 3 + k];
    else if (R[i] >= 0) v = cs[R[i] * 3 + k];
    else v = wide[i * 3 + k];
    fill[i * 3 + k] = v;
  }
  const cm = boxAvg(fill, 3, 2), edgeT = Math.max(1, n * .05);
  for (let i = 0; i < n; i++) {
    const tm = m[i] * smooth01(0, edgeT, Math.min(i, n - 1 - i)) * merge;
    if (snapAll || !e.ready) { e.m[i] = tm; for (let k = 0; k < 3; k++) e.col[i * 3 + k] = cm[i * 3 + k]; }
    else { e.m[i] += (tm - e.m[i]) * .3; for (let k = 0; k < 3; k++) e.col[i * 3 + k] += (cm[i * 3 + k] - e.col[i * 3 + k]) * .3; }
  }
  e.ready = true;
  const w = e.img.width, data = e.img.data;
  for (let i = 0; i < n; i++) for (let r = 0; r < MR; r++) {
    const t = r / (MR - 1), ramp = t * t * (3 - 2 * t), k = horiz ? (r * w + i) * 4 : (i * w + r) * 4;
    if (mir.zones) { data[k] = 255; data[k + 1] = 0; data[k + 2] = 170; }
    else { data[k] = e.col[i * 3]; data[k + 1] = e.col[i * 3 + 1]; data[k + 2] = e.col[i * 3 + 2]; }
    data[k + 3] = Math.round(255 * e.m[i] * ramp);
  }
  e.x.putImageData(e.img, 0, 0);
}

let lastMergeT = 0;
function updateMerge(sx, sy, sw, sh, snap) {
  const now = performance.now();
  if (!snap && now - lastMergeT < 33) return;                       // analyse ~30x per second; the last result is reused in between
  lastMergeT = now;
  const wanted = [];
  const th = c => Math.max(2, Math.round(PH * c.strip / 100)), tw = c => Math.max(2, Math.round(PW * c.strip / 100));
  if (modes.top === 2 && mir.top.merge > 0) wanted.push([E.top, th(mir.top), (i, d) => (d * PW + i) * 4, true, mir.top]);
  if (modes.bottom === 2 && mir.bottom.merge > 0) wanted.push([E.bot, th(mir.bottom), (i, d) => ((PH - 1 - d) * PW + i) * 4, true, mir.bottom]);
  if (modes.side === 2 && mir.side.merge > 0) {
    wanted.push([E.left, tw(mir.side), (i, d) => (i * PW + d) * 4, false, mir.side]);
    wanted.push([E.right, tw(mir.side), (i, d) => (i * PW + PW - 1 - d) * 4, false, mir.side]);
  }
  if (!wanted.length) return;
  pctx.drawImage(video, sx, sy, sw, sh, 0, 0, PW, PH);
  const px = pctx.getImageData(0, 0, PW, PH).data;
  const tm = video.currentTime || 0; let motSum = 0;
  for (const [e, thick, idx] of wanted) {
    e.cols = edgeCols(px, e, thick, idx);
    const dt = tm - e.prevT;
    if (snap || !e.ready || dt < 0 || dt > .5) { e.prevC = e.cols; e.prevT = tm; e.raw.fill(0); }
    else if (dt >= .08) {
      for (let i = 0; i < e.n; i++) e.raw[i] = Math.hypot(e.cols[i * 3] - e.prevC[i * 3], e.cols[i * 3 + 1] - e.prevC[i * 3 + 1], e.cols[i * 3 + 2] - e.prevC[i * 3 + 2]) * (.1 / dt);
      e.prevC = e.cols; e.prevT = tm;
    }
    let s = 0; for (let i = 0; i < e.n; i++) s += e.raw[i]; motSum += s / e.n;
  }
  const cut = motSum / wanted.length > 40;                          // every edge changed at once = a scene cut, not motion
  if (cut) for (const [e] of wanted) e.raw.fill(0);
  for (const [e, thick, idx, horiz, cfg] of wanted) analyseEdge(px, e, thick, idx, horiz, snap || cut, cfg);
}

/* ---------- drawing ---------- */
const segs = (A, Lp, t, total) => {                                  // ping-pong tiles along one axis
  const o = [{ d: A, n: Lp, s: 0, sn: Lp, f: 0 }];
  for (let k = 1; A - (k - 1) * t > 0; k++) o.push({ d: A - k * t, n: t, s: 0, sn: t, f: k & 1 });
  for (let k = 1; A + Lp + (k - 1) * t < total; k++) o.push({ d: A + Lp + (k - 1) * t, n: t, s: Lp - t, sn: t, f: k & 1 });
  return o;
};

function cssFilter(c, withBlur) {
  const blur = withBlur ? Math.round(clamp(c.blurPx, 0, 48) * 10) / 10 : 0;          // real CSS pixels
  return [blur ? `blur(${blur}px)` : '', c.saturation !== 100 ? `saturate(${c.saturation}%)` : '', c.brightness !== 100 ? `brightness(${c.brightness}%)` : '', c.contrast !== 100 ? `contrast(${c.contrast}%)` : ''].filter(Boolean).join(' ');
}

/* Mask for the blurred copy: invisible (= sharp) up to `d0` px from the picture, fully visible from `d1` px on. Positions are canvas px. */
function rampMask(key, c, X, Y, Wd, Hd, room) {
  const d0 = Math.round(room * clamp(c.blurStart, 0, 100) / 100), d1 = d0 + Math.max(1, Math.round(room * clamp(c.blurRamp, 0, 100) / 100));
  const T = 'transparent', O = '#000';
  if (key === 'top') return `linear-gradient(to bottom, ${O} 0px, ${O} ${Y - d1}px, ${T} ${Y - d0}px, ${T} 100%)`;
  if (key === 'bottom') { const e = Y + Hd; return `linear-gradient(to bottom, ${T} 0px, ${T} ${e + d0}px, ${O} ${e + d1}px, ${O} 100%)`; }
  const r = X + Wd;
  return `linear-gradient(to right, ${O} 0px, ${O} ${X - d1}px, ${T} ${X - d0}px, ${T} ${r + d0}px, ${O} ${r + d1}px, ${O} 100%)`;
}

/* darkens the far end of a region: 0 right at the picture (the join stays invisible), easing in with distance */
function fade(g, c, x, y, w, h, vertical, towardStart) {
  const d = Math.min(.95, .27 * c.fade / 50);
  if (d <= 0 || w < 1 || h < 1) return;
  const gr = g.createLinearGradient(vertical ? 0 : x, vertical ? y : 0, vertical ? 0 : x + w, vertical ? y + h : 0);
  const a = (o, al) => gr.addColorStop(clamp(o, 0, 1), `rgba(0,0,0,${al})`);
  if (towardStart) { a(0, d); a(.35, d * .2); a(1, 0); } else { a(0, 0); a(.65, d * .2); a(1, d); }
  g.fillStyle = gr; g.fillRect(x, y, w, h);
}

function drawVertical(reg, isTop, ctx) {
  const { g, c, X, Y, Wd, Hd, sx, sy, sw, sh, E: edge } = ctx;
  const ty = clamp(Math.round(Hd * c.strip / 100), 8, Hd), tx = clamp(Math.round(Wd * c.strip / 100), 8, Wd);
  const kx = sw / Wd, srcH = sh * ty / Hd, srcY = isTop ? sy : sy + sh - srcH;
  if (band.width !== cw) band.width = cw;
  if (band.height !== ty) band.height = ty;
  bg.clearRect(0, 0, cw, ty);
  for (const t of segs(X, Wd, tx, cw)) {                             // pass 1: the edge strip, extended sideways across the whole width
    bg.save(); bg.translate(t.d + (t.f ? t.n : 0), 0); bg.scale(t.f ? -1 : 1, 1);
    bg.drawImage(video, sx + t.s * kx, srcY, t.sn * kx, srcH, 0, 0, t.n, ty); bg.restore();
  }
  const edgeY = isTop ? Y : Y + Hd;                                   // the picture's edge, in canvas px
  g.drawImage(band, 0, 0, cw, ty, 0, isTop ? Y : Y + Hd - ty, cw, ty);   // under the picture: gives the blur something to blend with
  const room = isTop ? edgeY : ch - edgeY;
  for (let k = 1; (k - 1) * ty < room; k++) {                         // pass 2: ping-pong away from the edge
    const d = isTop ? edgeY - k * ty : edgeY + (k - 1) * ty, flip = k & 1;
    g.save(); g.translate(0, d + (flip ? ty : 0)); g.scale(1, flip ? -1 : 1);
    g.drawImage(band, 0, 0, cw, ty, 0, 0, cw, ty); g.restore();
  }
  // smart-merge overlay (only over the picture's width, as in v27)
  if (c.merge > 0) {
    const e = edge, rh = Math.min(ty, room);
    if (isTop) {
      g.save(); g.translate(X, Y); g.scale(1, -1); g.drawImage(e.c, 0, 0, PW, MR * rh / ty, 0, 0, Wd, rh); g.restore();
      if (Y - ty > 1) g.drawImage(e.c, 0, MR - 1, PW, 1, X, 0, Wd, Y - ty);
    } else {
      g.drawImage(e.c, 0, 0, PW, MR * rh / ty, X, edgeY, Wd, rh);
      if (room - ty > 1) g.drawImage(e.c, 0, MR - 1, PW, 1, X, edgeY + ty, Wd, room - ty);
    }
  }
  if (isTop) fade(g, c, 0, 0, cw, edgeY, true, true); else fade(g, c, 0, edgeY, cw, ch - edgeY, true, false);
}

function drawSides(ctx) {
  const { g, c, X, Y, Wd, Hd, sx, sy, sw, sh } = ctx;
  const tx = clamp(Math.round(Wd * c.strip / 100), 8, Wd), ky = sh / Hd, srcW = sw * tx / Wd;
  if (band.width !== tx) band.width = tx;
  if (band.height !== Hd) band.height = Hd;
  for (const left of [true, false]) {
    bg.clearRect(0, 0, tx, Hd);
    bg.drawImage(video, left ? sx : sx + sw - srcW, sy, srcW, sh, 0, 0, tx, Hd);
    const edgeX = left ? X : X + Wd, room = left ? edgeX : cw - edgeX;
    g.drawImage(band, 0, 0, tx, Hd, left ? X : X + Wd - tx, Y, tx, Hd);
    for (let k = 1; (k - 1) * tx < room; k++) {
      const d = left ? edgeX - k * tx : edgeX + (k - 1) * tx, flip = k & 1;
      g.save(); g.translate(d + (flip ? tx : 0), Y); g.scale(flip ? -1 : 1, 1);
      g.drawImage(band, 0, 0, tx, Hd, 0, 0, tx, Hd); g.restore();
    }
    if (c.merge > 0) {
      const e = left ? E.left : E.right, rw = Math.min(tx, room);
      if (left) {
        g.save(); g.translate(X, Y); g.scale(-1, 1); g.drawImage(e.c, 0, 0, MR * rw / tx, PH, 0, 0, rw, Hd); g.restore();
        if (X - tx > 1) g.drawImage(e.c, MR - 1, 0, 1, PH, 0, Y, X - tx, Hd);
      } else {
        g.drawImage(e.c, 0, 0, MR * rw / tx, PH, edgeX, Y, rw, Hd);
        if (room - tx > 1) g.drawImage(e.c, MR - 1, 0, 1, PH, edgeX + tx, Y, room - tx, Hd);
      }
    }
    if (left) fade(g, c, 0, Y, edgeX, Hd, false, true); else fade(g, c, edgeX, Y, cw - edgeX, Hd, false, false);
  }
}

function place(reg, ramp) {
  for (const cv of ramp ? [reg.cv, reg.cv2] : [reg.cv]) {
    if (cv.width !== cw) cv.width = cw;
    if (cv.height !== ch) cv.height = ch;
    Object.assign(cv.style, { left: -PAD + 'px', top: -PAD + 'px', width: cw + 'px', height: ch + 'px' });
  }
}

export function draw(newFrame) {
  const want = { top: modes.top === 2, bottom: modes.bottom === 2, side: modes.side === 2 };
  if (!want.top && !want.bottom && !want.side) return;
  const geo = S.geo;
  if (!geo || video.readyState < 2 || !video.videoWidth) return;
  if (!newFrame && !dirty) return;
  const r = geo.r;
  const nw = Math.round(r.W + 2 * PAD), nh = Math.round(r.H + 2 * PAD);
  let snap = dirty;
  if (nw !== cw || nh !== ch) { cw = nw; ch = nh; snap = true; }
  dirty = false;
  const Wd = Math.round(r.dw), Hd = Math.round(r.dh), X = Math.round(r.dx) + PAD, Y = Math.round(r.dy) + PAD;
  if (Wd < 2 || Hd < 2) return;
  const base = { X, Y, Wd, Hd, sx: geo.sx, sy: geo.sy, sw: geo.sw, sh: geo.sh };
  try { updateMerge(geo.sx, geo.sy, geo.sw, geo.sh, snap); } catch (e) { /* merge is optional */ }
  for (const key of ['top', 'bottom', 'side']) {
    const reg = REG[key];
    if (!want[key]) continue;
    const c = mir[key], ramp = c.blurMode === 1 && c.blurPx > 0;
    place(reg, ramp);
    const f = cssFilter(c, !ramp);                                    // ramp: the reflection keeps only colour; the blurred copy gets the blur
    if (reg.filter !== f) { reg.filter = f; reg.cv.style.filter = f; }
    reg.g.clearRect(0, 0, cw, ch);
    const ctx = Object.assign({ g: reg.g, c }, base);
    if (key === 'top') { ctx.E = E.top; if (Y > PAD + 1) drawVertical(reg, true, ctx); }
    else if (key === 'bottom') { ctx.E = E.bot; if (r.H - (r.dy + r.dh) > 1) drawVertical(reg, false, ctx); }
    else drawSides(ctx);
    if (ramp) {
      reg.g2.clearRect(0, 0, cw, ch);
      reg.g2.drawImage(reg.cv, 0, 0);
      const f2 = cssFilter(c, true);
      if (reg.filter2 !== f2) { reg.filter2 = f2; reg.cv2.style.filter = f2; }
      const room = key === 'top' ? r.dy : key === 'bottom' ? r.H - (r.dy + r.dh) : Math.min(r.dx, r.W - (r.dx + r.dw));
      const m = rampMask(key, c, X, Y, Wd, Hd, Math.max(1, room));
      if (reg.mask !== m) { reg.mask = m; reg.cv2.style.webkitMaskImage = m; reg.cv2.style.maskImage = m; }
    }
  }
}
