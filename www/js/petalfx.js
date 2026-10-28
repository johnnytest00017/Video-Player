/* Live "glass" behind the petals: Mirror = the video itself (blurred), Ambient = its colours as a soft glow. */
import { video } from './dom.js';
import { look } from './state.js';

const canvases = [...document.querySelectorAll('.pic canvas')];
let raf = 0, last = 0;

function frame(t) {
  raf = requestAnimationFrame(frame);
  const mode = look.petalMode;
  if (mode !== 2 && mode !== 3) return;
  if (document.hidden || !video.videoWidth) return;
  if (t - last < (video.paused ? 400 : 60)) return;
  last = t;
  const base = mode === 3 ? 12 : 72, w = base, h = Math.max(4, Math.round(base * video.videoHeight / video.videoWidth));
  for (const c of canvases) {
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    try { c.getContext('2d').drawImage(video, 0, 0, w, h); } catch (e) { /* video not ready */ }
  }
}

export function refreshFx() {
  const on = look.petalMode === 2 || look.petalMode === 3;
  if (on && !raf) raf = requestAnimationFrame(frame);
  if (!on && raf) { cancelAnimationFrame(raf); raf = 0; }
  last = 0;
}
