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
import { showFlash } from './player.js';

/* layout follows the display's size and the video's real dimensions */
if (window.ResizeObserver) new ResizeObserver(() => requestLayout()).observe(videoWrap);
window.addEventListener('resize', requestLayout);
window.addEventListener('orientationchange', () => setTimeout(requestLayout, 120));
['loadedmetadata', 'loadeddata', 'resize'].forEach(ev => video.addEventListener(ev, () => { applyLayout(); }));

video.addEventListener('error', () => { showFlash('Cannot play this file'); });

applySubStyle();
applyBg();
applyLayout();
tick();

/* handy for debugging on a desktop browser */
window.__avp = { applyLayout };
