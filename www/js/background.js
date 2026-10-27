/* Background orchestration: picks the active background (ambilight / stretch / extended / off) and runs the draw loop. */
import { video, extVideo, ambi, stretchCv, mirTop, mirBottom, mirSide, mirTopB, mirBottomB, mirSideB } from './dom.js';
import { amb, modes, mir, saveAmb, saveModes, saveMir, bgMode, anyMode, on } from './state.js';
import * as ambilight from './ambilight.js';
import * as mirror from './mirror.js';
import * as stretch from './stretch.js';
import * as ext from './extended.js';
import { updateSubtitle } from './subtitles.js';

const hasVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
const timing = ambilight.timing;
let loopOn = false, vfcId = 0, rafId = 0, rafT = 0, lastMT = -1, lastPF = -1, lastCT = -1, newVideoFrame = false;

function drawBackground(newFrame) {
  const m = bgMode();
  if (m === 3) stretch.draw();
  else if (m === 1) {
    if (anyMode(1)) ambilight.draw(newFrame);          // regions set to Ambient
    if (anyMode(2)) mirror.draw(newFrame);             // regions set to Mirror
  }
}
export function tick() { updateSubtitle(); drawBackground(video.paused); }

/* Which layers are visible for the current mode. */
export function applyBg() {
  const m = bgMode();
  ambi.style.display = m === 1 && anyMode(1) ? '' : 'none';
  mirTop.style.display = m === 1 && modes.top === 2 ? 'block' : 'none';
  mirBottom.style.display = m === 1 && modes.bottom === 2 ? 'block' : 'none';
  mirSide.style.display = m === 1 && modes.side === 2 ? 'block' : 'none';
  const ramp = k => m === 1 && modes[k] === 2 && mir[k].blurMode === 1 && mir[k].blurPx > 0 ? 'block' : 'none';   // distance-blur overlay
  mirTopB.style.display = ramp('top'); mirBottomB.style.display = ramp('bottom'); mirSideB.style.display = ramp('side');
  stretchCv.style.display = m === 3 ? 'block' : 'none';
  extVideo.style.display = m === 2 ? 'block' : 'none';
  ambilight.invalidate(); mirror.invalidate();
  if (m === 2) ext.refresh();
  ext.sync(true);
  tick();
}

/* A setting changed: save, rebuild, redraw. */
export function ambiChanged() {
  saveAmb(); saveModes(); saveMir();
  ambilight.invalidate();
  applyBg();
  ext.refresh();
  if (loopOn) { cancelAnimationFrame(rafId); rafT = 0; rafId = requestAnimationFrame(onRaf); }
}

/* ---- the draw loop ---- */
const wantRaf = () => !hasVFC || (!!amb.blending && amb.blendSmooth > 0);
function onVfc(now, meta) {
  if (!loopOn) return;
  if (lastMT >= 0 && meta.mediaTime > lastMT && meta.presentedFrames > lastPF) {
    const d = (meta.mediaTime - lastMT) * 1000 / (video.playbackRate || 1) / (meta.presentedFrames - lastPF);
    if (d > 8 && d < 100) timing.vDur = timing.vDur * .9 + d * .1;
  }
  lastMT = meta.mediaTime; lastPF = meta.presentedFrames;
  newVideoFrame = true;
  updateSubtitle();
  if (!wantRaf()) { drawBackground(true); newVideoFrame = false; }
  vfcId = video.requestVideoFrameCallback(onVfc);
}
function onRaf(t) {
  if (!loopOn) return;
  if (rafT) { const d = t - rafT; if (d > 4 && d < 50) timing.dDur = timing.dDur * .9 + d * .1; }
  rafT = t;
  if (wantRaf()) {
    let nf = newVideoFrame;
    if (!hasVFC) { nf = video.currentTime !== lastCT; lastCT = video.currentTime; updateSubtitle(); }
    drawBackground(nf); newVideoFrame = false;
  }
  rafId = requestAnimationFrame(onRaf);
}
function startLoop() {
  if (loopOn) return;
  loopOn = true; lastMT = -1; lastPF = -1; rafT = 0;
  if (hasVFC) vfcId = video.requestVideoFrameCallback(onVfc);
  rafId = requestAnimationFrame(onRaf);
}
function stopLoop() {
  loopOn = false;
  try { if (hasVFC) video.cancelVideoFrameCallback(vfcId); } catch (e) { /* ignore */ }
  cancelAnimationFrame(rafId);
  tick();
}

export function resetBackground() { ambilight.reset(); }

video.addEventListener('play', startLoop);
video.addEventListener('pause', stopLoop);
video.addEventListener('ended', stopLoop);
video.addEventListener('seeking', () => ambilight.markSeek());
['seeked', 'loadeddata', 'loadedmetadata'].forEach(ev => video.addEventListener(ev, tick));

on('layout', r => { ambilight.setGeometry(r); mirror.invalidate(); drawBackground(false); });
on('bg-changed', applyBg);
