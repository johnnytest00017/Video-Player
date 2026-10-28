/* Video Player — entry point. Importing the modules wires them up; this file adds the page-level glue. */
import { video, videoWrap } from './dom.js';
import { on } from './state.js';
import { applyLayout, requestLayout } from './layout.js';
import './crop.js';
import './frame.js';
import './media.js';
import { applyBg, tick } from './background.js';
import { applySubStyle } from './subtitles.js';
import './settings.js';
import './pad.js';
import './zones.js';
import './look.js';
import { showFlash } from './player.js';

/* layout follows the display's size and the video's real dimensions */
if (window.ResizeObserver) new ResizeObserver(() => requestLayout()).observe(videoWrap);
window.addEventListener('resize', requestLayout);
window.addEventListener('orientationchange', () => setTimeout(requestLayout, 120));
['loadedmetadata', 'loadeddata', 'resize'].forEach(ev => video.addEventListener(ev, () => { applyLayout(); }));

video.addEventListener('error', () => { showFlash('Cannot play this file'); });

/* greeting on the start screen */
{
  const hr = new Date().getHours(), g = document.getElementById('greeting');
  if (g) g.textContent = hr < 5 ? 'Good night!' : hr < 12 ? 'Good morning!' : hr < 18 ? 'Good afternoon!' : 'Good evening!';
}

applySubStyle();
applyBg();
applyLayout();
tick();

/* handy for debugging on a desktop browser */
window.__avp = { applyLayout };
