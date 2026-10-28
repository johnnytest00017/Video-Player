/* Invisible press areas (no element, just geometry, so they never block anything underneath):
     backward : from the left edge of the phone to half way between the backward petal and play, from the top of the petal to the bottom of the phone
     play     : between those two half-way lines, from the pill's bottom up to twice the pill's height above it
     forward  : mirror of backward
   A press that lands on a real control (a button, the seek bar, the settings sheet…) is left alone; anything else inside an area is sent to its key. */
import { backward, forward, playPause } from './dom.js';

const UP = 2;                       // play area reaches up this many pill-heights above the pill
const ptl = b => { const e = b.querySelector('.body'); return (e || b).getBoundingClientRect(); };

export function zoneRects() {
  const bb = ptl(backward), fb = ptl(forward), pr = playPause.getBoundingClientRect();
  const cx = r => r.left + r.width / 2, W = innerWidth, H = innerHeight;
  const xl = (cx(bb) + cx(pr)) / 2, xr = (cx(pr) + cx(fb)) / 2;
  return {
    back: { l: -1e4, r: xl, t: bb.top, b: H + 1e4, el: backward },
    fwd: { l: xr, r: W + 1e4, t: fb.top, b: H + 1e4, el: forward },
    play: { l: xl, r: xr, t: pr.top - UP * pr.height, b: pr.bottom + 5, el: playPause }
  };
}

const live = () => {
  if (document.documentElement.classList.contains('arranging')) return false;
  const sh = document.getElementById('sheet');
  if (sh && sh.getAttribute('aria-hidden') === 'false') return false;
  return !!backward.offsetParent && !!forward.offsetParent && !!playPause.offsetParent;
};
const OWN = 'button, input, a, select, textarea, summary, [role=slider], [role=switch], .sheet, .editor-bar, .crop-editor, .adjust-editor, .disp-handle';

window.addEventListener('pointerdown', e => {
  if (e.defaultPrevented || (e.pointerType === 'mouse' && e.button) || !e.isTrusted || !live()) return;
  const t = e.target;
  if (t.closest && t.closest(OWN)) return;
  const z = Object.values(zoneRects()).find(r => e.clientX >= r.l && e.clientX <= r.r && e.clientY >= r.t && e.clientY <= r.b);
  if (!z) return;
  const id = e.pointerId, btn = z.el, isPlay = btn === playPause;
  const mk = type => new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: e.pointerType, isPrimary: true, clientX: e.clientX, clientY: e.clientY, button: 0 });
  let done = false;
  const up = ev => {
    if (ev.pointerId !== id || done) return; done = true;
    window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', up, true);
    btn.classList.remove('zone-down');
    if (isPlay) { if (ev.type === 'pointerup') btn.click(); }
    else btn.dispatchEvent(mk(ev.type));
  };
  window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', up, true);
  btn.classList.add('zone-down');
  btn.dispatchEvent(mk('pointerdown'));        // haptic + (back / forward) the press-and-hold repeat start here
}, true);

window.__zones = zoneRects;
