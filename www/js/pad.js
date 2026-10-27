/* The game-pad controls: D-pad (left / right skip, up / down speed — hold to repeat), the reel's press feel and the round keys. */
import { video, controls, backward, forward, speedUp, speedDown, speedLabel, loopToggle } from './dom.js';
import { S, prefs, savePrefs, on, emit } from './state.js';
import { clamp } from './util.js';
import { skipBy, setSpeed, showFlash } from './player.js';
import { haptic } from './haptics.js';

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const fmtSpeed = s => s + '×';

/* A key that acts when pressed and keeps acting while held. A tap from a keyboard / screen reader (a click that no pointer press
   came before) acts once. */
function holdKey(btn, act, every = 190) {
  let t = 0, iv = 0, viaPointer = false, clear = 0;
  const stop = () => { clearTimeout(t); clearInterval(iv); t = iv = 0; };
  btn.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button) return;
    viaPointer = true; clearTimeout(clear); stop();
    act(false);
    t = setTimeout(() => { iv = setInterval(() => act(true), every); }, 420);
  });
  ['pointerup', 'pointercancel', 'pointerleave', 'blur'].forEach(ev => btn.addEventListener(ev, () => { stop(); clear = setTimeout(() => { viaPointer = false; }, 350); }));
  btn.addEventListener('click', () => { if (viaPointer) return; act(false); });
  document.addEventListener('visibilitychange', stop);
}

/* skip */
const skip = dir => again => {
  if (!S.videoLoaded) return;
  skipBy(dir * prefs.skip);
  showFlash((dir < 0 ? '−' : '+') + prefs.skip + 's', dir < 0 ? 'left' : 'right');
  if (again) haptic.tick();
};
holdKey(backward, skip(-1));
holdKey(forward, skip(1));

/* speed */
function stepSpeed(dir) {
  return again => {
    if (!S.videoLoaded) return;
    const cur = video.playbackRate;
    let i = SPEEDS.findIndex(s => Math.abs(s - cur) < .001);
    if (i < 0) i = SPEEDS.reduce((b, s, k) => (Math.abs(s - cur) < Math.abs(SPEEDS[b] - cur) ? k : b), 0);
    const j = clamp(i + dir, 0, SPEEDS.length - 1);
    if (j === i) { showFlash(fmtSpeed(SPEEDS[i]) + (dir > 0 ? ' · fastest' : ' · slowest')); haptic.thud(); return; }
    setSpeed(SPEEDS[j]);
    showFlash(fmtSpeed(SPEEDS[j]));
    if (again || SPEEDS[j] === 1) { if (SPEEDS[j] === 1) haptic.thud(); else haptic.tick(); }   // normal speed is a detent
  };
}
holdKey(speedUp, stepSpeed(1), 320);
holdKey(speedDown, stepSpeed(-1), 320);
const paintSpeed = () => {
  const s = video.playbackRate;
  speedLabel.textContent = fmtSpeed(Math.round(s * 100) / 100);
  speedLabel.classList.toggle('off', Math.abs(s - 1) > .001);
};
on('speed', paintSpeed);
video.addEventListener('loadedmetadata', paintSpeed);
video.addEventListener('emptied', paintSpeed);

/* loop key */
const paintLoop = () => loopToggle.setAttribute('aria-pressed', String(!!prefs.loop));
loopToggle.addEventListener('click', () => {
  prefs.loop = !prefs.loop; savePrefs(); paintLoop(); emit('loop');
  showFlash(prefs.loop ? 'Loop on' : 'Loop off');
  if (prefs.loop) haptic.thud();
});
on('loop', paintLoop);
paintLoop();

/* the keys go down the moment the finger lands, like a real button (not on release, and not while scrolling: this card never scrolls) */
controls.addEventListener('pointerdown', e => { if (e.target.closest('.pad-btn, .reel-btn')) haptic.press(); });

/* every other button in the app: a tick on click (a click is only sent for a real tap, never when a scroll started on the button) */
document.addEventListener('click', e => {
  const t = e.target.closest && e.target.closest('button, summary, [role=switch], [role=tab], [role=radio]');
  if (!t || t.closest('.pad-btn, .reel-btn') || t.disabled) return;
  if (t.matches('.switch')) haptic.thud();
  else if (t.closest('.seg, .tabs, .chips')) haptic.tick();
  else haptic.tap();
}, true);

paintSpeed();
