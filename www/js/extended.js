/* EXTENDED-VIDEO BACKGROUND.
   Optional second file: a version of the same clip that an outpainting tool (Follow-Your-Canvas, MOTIA, LTX outpaint ...)
   has extended past the original edges. It plays muted behind the real video, locked to the same time. The real
   picture stays on top, so the middle is always the untouched original. */
import { video, extVideo, extFile } from './dom.js';
import { S, amb, saveAmb, bgMode, emit, on } from './state.js';

let extURL = null;

/* Place the extended frame so its copy of the original lines up exactly under the real picture. */
export function layout(r) {
  if (!S.extLoaded || !r || !extVideo.videoWidth || !video.videoWidth) return;
  const f = r.f;
  const fx = r.dx + (f.x - r.x0) * r.sX, fy = r.dy + (f.y - r.y0) * r.sY;      // the full original frame on screen
  const fw = f.w * r.sX, fh = f.h * r.sY;
  const Ow = video.videoWidth, Oh = video.videoHeight, Ew = extVideo.videoWidth, Eh = extVideo.videoHeight;
  const k = amb.extAlign === 1 ? 1 : Math.min(Ew / Ow, Eh / Oh);               // extended pixels per original pixel
  const z = amb.extZoom / 100;
  const w = Ew * fw / (Ow * k) * z, h = Eh * fh / (Oh * k) * z;
  const cx = fx + fw / 2 + amb.extX / 100 * fw, cy = fy + fh / 2 + amb.extY / 100 * fh;
  Object.assign(extVideo.style, { left: (cx - w / 2) + 'px', top: (cy - h / 2) + 'px', width: w + 'px', height: h + 'px' });
}
export const refresh = () => layout(S.region);

/* Keep it in step with the main video: hard seek on big drift, tiny speed nudges on small drift. */
export function sync(hard) {
  if (!S.extLoaded) return;
  if (bgMode() !== 2) { if (!extVideo.paused) extVideo.pause(); return; }
  const base = video.playbackRate || 1;
  const d = extVideo.currentTime - video.currentTime;
  if (hard || Math.abs(d) > .25) { try { extVideo.currentTime = video.currentTime; } catch (e) { /* ignore */ } extVideo.playbackRate = base; }
  else if (Math.abs(d) > .04) extVideo.playbackRate = base * (1 - Math.max(-.05, Math.min(.05, d * .5)));
  else extVideo.playbackRate = base;
  if (video.paused) { if (!extVideo.paused) extVideo.pause(); }
  else if (extVideo.paused) { const p = extVideo.play(); if (p && p.catch) p.catch(() => {}); }
}

export function clear() {
  if (extURL) URL.revokeObjectURL(extURL);
  extURL = null; S.extLoaded = false; S.extName = '';
  extVideo.pause(); extVideo.removeAttribute('src'); extVideo.load();
  if (amb.bg === 2) { amb.bg = 1; saveAmb(); }
  emit('media'); emit('amb-sync'); emit('bg-changed');
}

export function load(file) {
  if (!file) return;
  if (extURL) URL.revokeObjectURL(extURL);
  extURL = URL.createObjectURL(file);
  extVideo.src = extURL; extVideo.load();
  S.extLoaded = true; S.extName = file.name;
  amb.bg = 2; saveAmb();
  emit('media'); emit('amb-sync'); emit('bg-changed');
}

extFile.addEventListener('change', () => { load(extFile.files && extFile.files[0]); extFile.value = ''; });
extVideo.addEventListener('loadedmetadata', () => { refresh(); emit('bg-changed'); });
extVideo.addEventListener('loadeddata', () => sync(true));
['play', 'pause', 'seeking', 'seeked', 'ratechange', 'loadeddata'].forEach(ev =>
  video.addEventListener(ev, () => sync(ev === 'seeked' || ev === 'seeking' || ev === 'pause')));
setInterval(() => sync(false), 200);
on('layout', layout);
