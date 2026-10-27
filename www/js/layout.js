/* Frame layout engine.

   Two separate things, as in a real editor:
     DISPLAY  the window (videoWrap) — its height is user-controlled, or the whole screen in fullscreen.
     VIDEO    the picture — fitted into the display, then moved / zoomed / stretched by the user.

   The <video> element itself always sits unscaled in its layer ("contain", bottom aligned). Every placement is a CSS transform
   of that layer, so there is one code path for crop, zoom, move and stretch. Whatever the picture does not cover is filled by the
   ambient background, which listens to the 'layout' event and builds itself from the part of the picture that is visible. */
import { video, videoWrap, fgLayer, fgClip } from './dom.js';
import { S, crop, view, disp, isFull, emit } from './state.js';
import { clamp } from './util.js';

const ASPECTS = { '16:9': 16 / 9, '4:3': 4 / 3, '21:9': 21 / 9, '1:1': 1 };
const ZERO = { t: 0, r: 0, b: 0, l: 0 };

/* The picture is lifted off the bottom edge: a clear band of ambient shows beneath it. */
function liftPx() { return isFull() ? 0 : clamp(Math.round(videoWrap.clientHeight * .09), 22, 50); }

/* Where the whole video frame is drawn inside its layer (object-fit: contain, bottom aligned). */
export function fgFrame() {
  const vw = video.videoWidth, vh = video.videoHeight, ew = fgLayer.clientWidth, eh = fgLayer.clientHeight;
  if (!vw || !vh || !ew || !eh) return null;
  const k = Math.min(ew / vw, eh / vh), w = vw * k, h = vh * k;
  return { x: (ew - w) / 2, y: eh - h, w, h };
}

function computeRegion() {
  const W = videoWrap.clientWidth, H = videoWrap.clientHeight;
  const lift = liftPx(), Hc = H - lift;                    // Hc = height of the area the picture is fitted into
  fgLayer.style.bottom = lift + 'px';
  const f = fgFrame();
  if (!f || !W || Hc < 8) return null;

  const editing = S.cropEditing;
  const c = editing ? ZERO : crop;
  const x0 = f.x + c.l * f.w, x1 = f.x + (1 - c.r) * f.w;     // cropped region, in layer px
  const y0 = f.y + c.t * f.h, y1 = f.y + (1 - c.b) * f.h;
  const vw = video.videoWidth, vh = video.videoHeight;
  const regX = (x0 - f.x) / f.w * vw, regY = (y0 - f.y) / f.h * vh;      // …and in video px
  const regW = (x1 - x0) / f.w * vw, regH = (y1 - y0) / f.h * vh;

  /* 1. base box: how the cropped region is fitted into the display */
  const forced = editing ? 0 : (ASPECTS[disp.aspect] || 0);
  const ar = forced || regW / regH;
  let bw, bh;
  switch (editing ? 'fit' : disp.fit) {
    case 'fill':    bw = Math.max(W, Hc * ar); bh = bw / ar; break;
    case 'stretch': bw = W; bh = Hc; break;
    case 'native': { const d = window.devicePixelRatio || 1; bw = regW / d; bh = forced ? bw / ar : regH / d; break; }
    default:        bw = Math.min(W, Hc * ar); bh = bw / ar;
  }
  const baseCx = W / 2, baseCy = (bh <= Hc && !isFull()) ? Hc - bh / 2 : Hc / 2;   // cinema layout centres the picture

  /* 2. user transform on top (never when the crop editor shows the full frame) */
  if (!editing) {
    view.x = clamp(view.x, -baseCx / W, (W - baseCx) / W);          // the picture's centre always stays inside the display
    view.y = clamp(view.y, -baseCy / H, (H - baseCy) / H);
  }
  const v = editing ? { zoom: 1, x: 0, y: 0, sx: 1, sy: 1 } : view;
  const dw = bw * v.zoom * v.sx, dh = bh * v.zoom * v.sy;
  const cx = baseCx + v.x * W, cy = baseCy + v.y * H;
  const dx = cx - dw / 2, dy = cy - dh / 2;

  return {
    W, H, Hc, f, x0, x1, y0, y1, regX, regY, regW, regH,
    dw, dh, dx, dy, sX: dw / (x1 - x0), sY: dh / (y1 - y0), baseCx, baseCy
  };
}

let raf = 0;
/* Coalesces bursts (gestures, resize) into one layout per frame. */
export function requestLayout() {
  if (raf) return;
  raf = requestAnimationFrame(() => { raf = 0; applyLayout(); });
}

export function applyLayout() {
  if (raf) { cancelAnimationFrame(raf); raf = 0; }
  const r = computeRegion();
  S.region = r;
  // the <video> always fills its layer; the crop is a rectangular overflow clip around it
  const lw = fgLayer.clientWidth, lh = fgLayer.clientHeight;
  video.style.width = lw + 'px'; video.style.height = lh + 'px';
  if (!r) {
    fgLayer.style.transform = '';
    Object.assign(fgClip.style, { left: '0px', top: '0px', width: '100%', height: '100%' });
    video.style.left = '0px'; video.style.top = '0px';
    emit('layout', null);
    return;
  }
  Object.assign(fgClip.style, { left: r.x0 + 'px', top: r.y0 + 'px', width: (r.x1 - r.x0) + 'px', height: (r.y1 - r.y0) + 'px' });
  video.style.left = -r.x0 + 'px'; video.style.top = -r.y0 + 'px';
  const identity = Math.abs(r.sX - 1) < .002 && Math.abs(r.sY - 1) < .002 && Math.abs(r.dx - r.x0) < .5 && Math.abs(r.dy - r.y0) < .5;
  // whole-pixel translation: the picture is never resampled onto half pixels
  fgLayer.style.transform = identity ? '' : `translate(${Math.round(r.dx - r.sX * r.x0)}px, ${Math.round(r.dy - r.sY * r.y0)}px) scale(${r.sX}, ${r.sY})`;
  emit('layout', r);
}
