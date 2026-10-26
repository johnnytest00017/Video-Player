/* Thin wrappers around the Android shell (Capacitor) with web fallbacks. Everything is optional and fails soft. */
const cap = window.Capacitor;
export const isNative = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());

/* Hide / show the system bars (immersive playback). Capacitor 8 ships the SystemBars plugin in core. */
export async function setImmersive(on) {
  if (!isNative) return;
  try {
    const bars = cap.Plugins && cap.Plugins.SystemBars;
    if (!bars) return;
    if (on) await bars.hide(); else await bars.show();
  } catch (e) { /* ignore */ }
}

/* Keep the screen on while playing. */
let lock = null, wanted = false;
async function acquire() {
  try {
    if (!wanted || lock || !navigator.wakeLock) return;
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => { lock = null; });
  } catch (e) { lock = null; }
}
export function keepAwake(on) {
  wanted = on;
  if (on) acquire();
  else if (lock) { try { lock.release(); } catch (e) { /* ignore */ } lock = null; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') acquire(); });
