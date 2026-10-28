/* A font of your own for the subtitles: pick a .ttf / .otf / .woff / .woff2 file; it is kept inside the app (IndexedDB) and used from then on. */
const DB = 'avp.subfont', STORE = 'f', KEY = 'font', FAMILY = 'AVPSubFont';
let name = '';
export const fontName = () => name;

const open = () => new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const tx = async (mode, fn) => {
  const db = await open();
  return new Promise((res, rej) => { const t = db.transaction(STORE, mode), q = fn(t.objectStore(STORE)); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); });
};

let face = null;
async function use(buf, label) {
  const f = new FontFace(FAMILY, buf);
  await f.load();
  if (face) document.fonts.delete(face);
  document.fonts.add(f); face = f; name = label;
  document.documentElement.style.setProperty('--sub-font', `"${FAMILY}"`);
}

export async function pickFont(file) {
  if (!file) return false;
  try {
    const buf = await file.arrayBuffer();
    await use(buf.slice(0), file.name.replace(/\.[^.]+$/, ''));
    try { await tx('readwrite', s => s.put({ buf, name }, KEY)); } catch (e) { alert('The font is used now, but could not be kept for next time.'); }
    return true;
  } catch (e) { alert('Could not read that font. Use a .ttf, .otf, .woff or .woff2 file.'); return false; }
}

export async function clearFont() {
  if (face) { document.fonts.delete(face); face = null; }
  name = ''; document.documentElement.style.removeProperty('--sub-font');
  try { await tx('readwrite', s => s.delete(KEY)); } catch (e) { /* ignore */ }
}

export async function restoreFont() {
  try {
    const v = await tx('readonly', s => s.get(KEY));
    if (v && v.buf) { await use(v.buf, v.name || 'Custom font'); return true; }
  } catch (e) { /* ignore */ }
  return false;
}
