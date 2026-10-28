/* Look: accent + shell colours, the picture / circuit skin behind the controls. Applies CSS variables; the Look tab (settings.js) edits them. */
import { look, saveLook, LOOK_DEFAULTS, emit } from './state.js';
import { skin } from './dom.js';
import { layoutPads } from './pads.js';
import { refreshFx } from './petalfx.js';

const IMG_KEY = 'avp.skinimg.v1';
let img = '';
try { img = localStorage.getItem(IMG_KEY) || ''; } catch (e) { /* ignore */ }
export const hasSkinImage = () => !!img;

/* the picture behind the petals (shown through the glass petals, blurred) */
const PIMG_KEY = 'avp.petalimg.v1';
let pimg = '';
try { pimg = localStorage.getItem(PIMG_KEY) || ''; } catch (e) { /* ignore */ }
export const hasPetalImage = () => !!pimg;

const HEX = /^#[0-9a-f]{6}$/i;
/* readable text colour on top of a colour */
export function inkFor(hex) {
  const n = parseInt(hex.slice(1), 16), c = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
  return (.2126 * c[0] + .7152 * c[1] + .0722 * c[2]) > .35 ? '#17140a' : '#ffffff';
}

/* the built-in skin: faint circuit-board traces, like the clear shell of a handheld */
const CIRCUIT = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M0 30h38l14 14h34l12-12h62M0 104h26l12 12h46l10-10h66M100 0v22l10 10v34l-12 12v30l14 14v38M44 0v18l8 8M44 160v-26l-10-10v-14"/>' +
  '<circle cx="38" cy="30" r="2.4"/><circle cx="86" cy="44" r="2.4"/><circle cx="26" cy="104" r="2.4"/><circle cx="84" cy="116" r="2.4"/><circle cx="110" cy="32" r="2.4"/><circle cx="98" cy="78" r="2.4"/>' +
  '<rect x="118" y="86" width="22" height="14" rx="2"/><path d="M122 86v-4M129 86v-4M136 86v-4M122 100v4M129 100v4M136 100v4"/></svg>');

const clampN = (v, a, b, d) => (typeof v === 'number' && isFinite(v) ? Math.min(b, Math.max(a, v)) : d);

export function applyLook() {
  const accent = HEX.test(look.accent) ? look.accent : LOOK_DEFAULTS.accent;
  const shell = HEX.test(look.shell) ? look.shell : LOOK_DEFAULTS.shell;
  const r = document.documentElement.style;
  r.setProperty('--accent', accent);
  r.setProperty('--accent-ink', inkFor(accent));
  r.setProperty('--shell', shell);
  r.setProperty('--reel-face', look.reelAccent ? accent : 'var(--white)');
  r.setProperty('--ps', String(clampN(look.padScale, 50, 220, 140) / 100));
  r.setProperty('--pgap', clampN(look.padGap, -20, 400, 96) + 'px');
  r.setProperty('--pic-op', String(clampN(look.petalOp, 0, 100, 100) / 100));
  r.setProperty('--pic-blur', clampN(look.petalBlur, 0, 40, 12) + 'px');
  const mode = look.petalMode;
  document.documentElement.classList.toggle('has-petal-img', (mode === 1 && !!pimg) || mode === 2 || mode === 3);
  document.documentElement.dataset.pmode = String(mode);
  document.querySelectorAll('.pic').forEach(e => { e.style.backgroundImage = pimg && mode === 1 ? `url("${pimg}")` : 'none'; });
  r.setProperty('--ico', /^#[0-9a-f]{6}$/i.test(look.icoColor) ? look.icoColor : '#ebf1fa');
  r.setProperty('--icos', String(clampN(look.icoSize, 50, 200, 100) / 100));
  layoutPads(look.padPetals, clampN(look.icoSize, 50, 200, 100));
  refreshFx();
  const kind = look.skin === 'image' && !img ? 'none' : look.skin;
  skin.className = 'skin ' + kind;
  skin.style.backgroundImage = kind === 'circuit' ? `url("${CIRCUIT}")` : kind === 'image' ? `url("${img}")` : 'none';
  skin.style.opacity = String(look.skinOp / 100);
  skin.style.filter = look.skinBlur ? `blur(${look.skinBlur}px)` : '';
}

export function setLook(patch) {
  Object.assign(look, patch);
  saveLook(); applyLook(); emit('look');
}

/* Reads the picked picture, scales it down (the controls are small) and keeps it as a JPEG in storage. */
export function loadSkinFile(file) {
  return new Promise(resolve => {
    if (!file) return resolve(false);
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      try {
        const k = Math.min(1, 960 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        img = c.toDataURL('image/jpeg', .82);
        let saved = true;
        try { localStorage.setItem(IMG_KEY, img); } catch (e) { saved = false; }
        if (!saved) alert('The picture is used now, but it is too big to be remembered for next time.');
        setLook({ skin: 'image' });
        resolve(true);
      } catch (e) { resolve(false); }
      URL.revokeObjectURL(url);
    };
    im.onerror = () => { URL.revokeObjectURL(url); alert('Could not read that picture.'); resolve(false); };
    im.src = url;
  });
}

export function loadPetalFile(file) {
  return new Promise(resolve => {
    if (!file) return resolve(false);
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      try {
        const k = Math.min(1, 720 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        pimg = c.toDataURL('image/jpeg', .85);
        try { localStorage.setItem(PIMG_KEY, pimg); } catch (e) { alert('The picture is used now, but it is too big to be remembered for next time.'); }
        look.petalMode = 1; saveLook(); applyLook(); emit('look');
        resolve(true);
      } catch (e) { resolve(false); }
      URL.revokeObjectURL(url);
    };
    im.onerror = () => { URL.revokeObjectURL(url); alert('Could not read that picture.'); resolve(false); };
    im.src = url;
  });
}

export function clearPetalImage() {
  pimg = '';
  try { localStorage.removeItem(PIMG_KEY); } catch (e) { /* ignore */ }
  applyLook(); emit('look');
}

export function clearSkinImage() {
  img = '';
  try { localStorage.removeItem(IMG_KEY); } catch (e) { /* ignore */ }
  setLook({ skin: look.skin === 'image' ? 'none' : look.skin });
}

applyLook();
