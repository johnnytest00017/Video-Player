/* Haptic feedback. Uses the native Capacitor Haptics plugin when the app has it (best feel), otherwise the web Vibration API.
   Android only lets the web API vibrate when the app holds the VIBRATE permission; the plugin adds that permission by itself.
   Everything is optional and fails soft. */
import { look } from './state.js';

const cap = window.Capacitor;
let plugin = null;
try {
  plugin = cap && ((cap.Plugins && cap.Plugins.Haptics) ||
    (cap.isNativePlatform && cap.isNativePlatform() && cap.registerPlugin ? cap.registerPlugin('Haptics') : null));
} catch (e) { plugin = null; }
const STYLES = ['LIGHT', 'MEDIUM', 'HEAVY'];
const SCALE = [0, .8, 1.25, 2];            // strength: off · soft · normal · strong  (multiplies the web vibration length)
let last = 0;

/* ms = length of the web vibration, base = 0 light · 1 medium · 2 heavy for the native plugin */
function buzz(ms, base, selection) {
  const k = SCALE[look.haptics];
  if (!k) return;
  const now = performance.now();
  if (now - last < 14) return;             // never a continuous buzz while dragging fast
  last = now;
  try {
    const web = () => { if (navigator.vibrate) navigator.vibrate(Math.max(8, Math.round(ms * k))); };
    if (plugin) {
      const p = (selection && look.haptics === 2) ? plugin.selectionChanged() : plugin.impact({ style: STYLES[Math.max(0, Math.min(2, base + look.haptics - 2))] });
      if (p && p.catch) p.catch(web);          // plugin not installed natively: fall back to the web API
    } else web();
  } catch (e) { /* ignore */ }
}

export const haptic = {
  tick: () => buzz(10, 0, true),            // a notch while dragging a slider
  tap: () => buzz(16, 0),                   // an ordinary button
  press: () => buzz(22, 1),                // the pad keys going down
  thud: () => buzz(38, 2),                 // a detent: default value, either end, a switch flipping
  grab: () => buzz(14, 0),                  // finger takes hold of a slider
  release: () => buzz(10, 0)
};

/* Settings → Look → Test vibration */
export function hapticDemo() {
  const seq = [['tick', 0], ['tick', 110], ['tick', 220], ['tap', 400], ['press', 620], ['thud', 880]];
  seq.forEach(([n, t]) => setTimeout(() => { last = 0; haptic[n](); }, t));
}
