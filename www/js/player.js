/* Transport, time, fullscreen, auto-hiding controls, keyboard shortcuts. */
import {
  video, stage, flash, bigPlay, playPause, seek, currentTime, duration, backward, forward, backLabel, fwdLabel,
  fsToggle, fsPath, videoWrap, controls
} from './dom.js';
import { S, prefs, isFull, on, emit } from './state.js';
import { fmtTime, clamp } from './util.js';
import { applyLayout } from './layout.js';
import { tick } from './background.js';
import { updateSubtitle } from './subtitles.js';
import { openLayer, closeLayer, closeTop } from './ui.js';
import { haptic } from './haptics.js';
import { setImmersive, keepAwake } from './native.js';

const ICON_PLAY = '<svg viewBox="0 0 24 28" aria-hidden="true"><path d="M3 2.5Q3 0 5.3 1.4L22 12.2Q24 13.5 22 14.8L5.3 26.6Q3 28 3 25.5Z" fill="currentColor"/></svg>';
const ICON_ENTER = 'M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4';
const ICON_EXIT = 'M9 4v4a1 1 0 0 1-1 1H4M20 9h-4a1 1 0 0 1-1-1V4M15 20v-4a1 1 0 0 1 1-1h4M4 15h4a1 1 0 0 1 1 1v4';

/* ---------- play / pause ---------- */
export async function togglePlay() {
  if (!S.videoLoaded) return;
  if (video.paused) { try { await video.play(); } catch (e) { /* ignore */ } } else video.pause();
}
function syncPlayIcon() {
  const playing = !video.paused && !video.ended;
  playPause.classList.toggle('playing', playing);       // the reel turns and shows the pause bars (css)
  bigPlay.innerHTML = ICON_PLAY;
  playPause.setAttribute('aria-label', playing ? 'Pause video' : 'Play video');
  bigPlay.classList.toggle('visible', !playing && S.videoLoaded);
  keepAwake(playing && prefs.keepAwake);
  scheduleHide();
}
['play', 'pause', 'ended', 'emptied'].forEach(ev => video.addEventListener(ev, syncPlayIcon));
playPause.addEventListener('click', togglePlay);
bigPlay.addEventListener('click', togglePlay);
on('media', syncPlayIcon);
on('keep-awake', syncPlayIcon);

/* ---------- seeking ---------- */
export function skipBy(sec) {
  if (!S.videoLoaded) return;
  const d = Number.isFinite(video.duration) ? video.duration : Infinity;
  video.currentTime = clamp(video.currentTime + sec, 0, d);
}
/* the skip keys live in pad.js (they repeat while held) */

export function syncSkipLabels() {
  backLabel.textContent = fwdLabel.textContent = String(prefs.skip);
  backward.setAttribute('aria-label', `Back ${prefs.skip} seconds`);
  forward.setAttribute('aria-label', `Forward ${prefs.skip} seconds`);
}

let seeking = false;
const paintSeek = () => { seek.style.setProperty('--p', (seek.value / seek.max * 100) + '%'); };
let seekNotch = -1;
seek.addEventListener('pointerdown', () => { haptic.grab(); seekNotch = Math.floor(seek.value / 50); });
seek.addEventListener('input', () => {
  seeking = true; paintSeek();
  const n = Math.floor(seek.value / 50);
  if (n !== seekNotch) { seekNotch = n; if (seek.value <= 0 || seek.value >= 1000) haptic.thud(); else haptic.tick(); }
  if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = (Number(seek.value) / 1000) * video.duration;
});
['change', 'pointerup', 'pointercancel', 'blur'].forEach(ev => seek.addEventListener(ev, () => { seeking = false; }));
video.addEventListener('loadedmetadata', () => { duration.textContent = fmtTime(video.duration); });
video.addEventListener('emptied', () => { duration.textContent = '0:00'; currentTime.textContent = '0:00'; seek.value = 0; paintSeek(); });
video.addEventListener('timeupdate', () => {
  currentTime.textContent = fmtTime(video.currentTime);
  if (!seeking && Number.isFinite(video.duration) && video.duration > 0) {
    seek.value = String(Math.round(video.currentTime / video.duration * 1000)); paintSeek();
  }
  updateSubtitle();
});
video.addEventListener('ended', () => { if (prefs.loop) { video.currentTime = 0; video.play().catch(() => {}); } });

/* ---------- feedback bubble (double-tap seek etc.) ---------- */
let flashTimer = 0;
export function showFlash(text, side = 'center') {
  flash.textContent = text;
  flash.style.left = side === 'left' ? '12%' : side === 'right' ? 'auto' : '50%';
  flash.style.right = side === 'right' ? '12%' : 'auto';
  flash.style.marginLeft = side === 'center' ? `-${Math.round(flash.offsetWidth / 2)}px` : '0';
  flash.classList.add('on');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => flash.classList.remove('on'), 650);
}

/* ---------- fullscreen / landscape layout ---------- */
function syncFullClass() {
  stage.classList.toggle('full', isFull());
  if (!isFull()) setHidden(false);
  applyLayout();
  tick();
  scheduleHide();
}
export function setFullscreen(on_) {
  if (S.fs === on_) return;
  S.fs = on_;
  fsPath.setAttribute('d', on_ ? ICON_EXIT : ICON_ENTER);
  fsToggle.setAttribute('aria-label', on_ ? 'Exit fullscreen' : 'Fullscreen');
  if (on_) openLayer('fullscreen', () => setFullscreen(false));
  else closeLayer('fullscreen');
  setImmersive(isFull());
  // ask the browser for true fullscreen where it exists (the layout works without it)
  const root = document.documentElement;
  try {
    if (on_ && !document.fullscreenElement && !document.webkitFullscreenElement) {
      const req = root.requestFullscreen || root.webkitRequestFullscreen;
      if (req) { const r = req.call(root); if (r && r.catch) r.catch(() => {}); }
    } else if (!on_ && (document.fullscreenElement || document.webkitFullscreenElement)) {
      const ex = document.exitFullscreen || document.webkitExitFullscreen;
      if (ex) { const r = ex.call(document); if (r && r.catch) r.catch(() => {}); }
    }
  } catch (e) { /* ignore */ }
  syncFullClass();
}
export const toggleFullscreen = () => setFullscreen(!S.fs);
fsToggle.addEventListener('click', toggleFullscreen);
const onFsChange = () => { if (S.fs && !document.fullscreenElement && !document.webkitFullscreenElement) setFullscreen(false); };
document.addEventListener('fullscreenchange', onFsChange);
document.addEventListener('webkitfullscreenchange', onFsChange);

/* A phone held sideways (short viewport) gets the cinema layout automatically. */
const mq = window.matchMedia('(orientation: landscape) and (max-height: 540px)');
const onMq = () => { S.landscape = mq.matches; setImmersive(isFull()); syncFullClass(); };
if (mq.addEventListener) mq.addEventListener('change', onMq); else mq.addListener(onMq);
S.landscape = mq.matches;

/* ---------- auto-hide controls in the cinema layout ---------- */
let hideTimer = 0;
function setHidden(h) {
  stage.classList.toggle('ui-hidden', h && isFull());
}
export function showControls() { setHidden(false); scheduleHide(); }
export function toggleControls() { const hidden = stage.classList.contains('ui-hidden'); setHidden(!hidden); if (hidden) scheduleHide(); }
function scheduleHide() {
  clearTimeout(hideTimer);
  if (!isFull() || video.paused || S.sheetOpen || S.adjusting || S.cropEditing) return;
  hideTimer = setTimeout(() => setHidden(true), 3500);
}
controls.addEventListener('pointerdown', scheduleHide);
on('ui-activity', scheduleHide);

/* ---------- keyboard (desktop / Bluetooth keyboards) ---------- */
document.addEventListener('keydown', e => {
  if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  switch (e.key) {
    case ' ': case 'k': e.preventDefault(); togglePlay(); break;
    case 'ArrowLeft': e.preventDefault(); skipBy(e.shiftKey ? -prefs.skip : -5); showFlash(e.shiftKey ? `−${prefs.skip}s` : '−5s', 'left'); break;
    case 'ArrowRight': e.preventDefault(); skipBy(e.shiftKey ? prefs.skip : 5); showFlash(e.shiftKey ? `+${prefs.skip}s` : '+5s', 'right'); break;
    case 'f': toggleFullscreen(); break;
    case 'Escape': closeTop(); break;
    default: return;
  }
});

/* ---------- speed ---------- */
export function setSpeed(v) { video.playbackRate = v; emit('speed', v); }
video.addEventListener('ratechange', () => emit('speed', video.playbackRate));

syncSkipLabels();
syncPlayIcon();
