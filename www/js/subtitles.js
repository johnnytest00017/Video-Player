/* SRT parsing and rendering. Arabic-script lines become the large main line; other languages the smaller line below it. */
import { video, subMain, subTrans, subsBox, addSrt } from './dom.js';
import { S, prefs, on } from './state.js';

let cues = [];
let lastCue = null;

export function parseSRT(raw) {
  const clean = raw.replace(/^﻿/, '').replace(/\r/g, '').trim();
  if (!clean) return [];
  return clean.split(/\n\s*\n/).map(block => {
    const lines = block.split('\n');
    const ti = lines.findIndex(line => line.includes('-->'));
    if (ti < 0) return null;
    const parts = lines[ti].split('-->');
    const parseTime = s => {
      const m = s.trim().replace(',', '.').match(/(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?/);
      if (!m) return NaN;
      return Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number('0.' + (m[4] || '0'));
    };
    const start = parseTime(parts[0]), end = parseTime(parts[1]);
    const text = lines.slice(ti + 1).join('\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    return Number.isFinite(start) && Number.isFinite(end) ? { start, end, text } : null;
  }).filter(Boolean).sort((a, b) => a.start - b.start);
}

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
function splitCue(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return ['', ''];
  const ar = lines.filter(l => ARABIC.test(l)), other = lines.filter(l => !ARABIC.test(l));
  if (ar.length && other.length) return [ar.join(' '), other.join(' ')];
  return [lines[0], lines.slice(1).join(' ')];
}

export function setCues(list) { cues = list; lastCue = null; updateSubtitle(); }
export const cueCount = () => cues.length;

export function updateSubtitle() {
  const t = (video.currentTime || 0) - prefs.subDelay;
  let lo = 0, hi = cues.length - 1, found = '';
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, c = cues[mid];
    if (t < c.start) hi = mid - 1;
    else if (t > c.end) lo = mid + 1;
    else { found = c.text; break; }
  }
  if (found === lastCue) return;
  lastCue = found;
  const [main, trans] = splitCue(found);
  subMain.textContent = main; subTrans.textContent = trans;
  subMain.style.opacity = main ? '1' : '0';
  subTrans.style.opacity = trans ? '1' : '0';
}

export function applySubStyle() {
  subsBox.style.setProperty('--sub-scale', String(prefs.subScale / 100));
  lastCue = null; updateSubtitle();
}

/* "Add subtitles" nudge: only while a video is open and no SRT is loaded */
export function syncAddSrt() { addSrt.classList.toggle('hidden', !(S.videoLoaded && !S.srtLoaded)); }
on('media', syncAddSrt);
