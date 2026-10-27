/* Opening the video, subtitles and extended video. */
import { video, videoFile, srtFile, extFile, prompt, pickVideo, pickSrt, pickExt, addSrt } from './dom.js';
import { S, view, VIEW_DEFAULTS, prefs, emit, on } from './state.js';
import { parseSRT, setCues, syncAddSrt } from './subtitles.js';
import { setCrop } from './crop.js';
import { exitCropEdit } from './crop.js';
import { applyLayout } from './layout.js';
import { resetBackground } from './background.js';
import * as ext from './extended.js';

let videoURL = null;

export function openVideo(file) {
  if (!file) return;
  if (videoURL) URL.revokeObjectURL(videoURL);
  videoURL = URL.createObjectURL(file);
  if (S.cropEditing) exitCropEdit();
  if (!prefs.keepView) Object.assign(view, VIEW_DEFAULTS);   // new videos start un-zoomed unless “Keep frame” is on
  setCrop({}, '');
  if (S.videoLoaded && S.extLoaded) ext.clear();       // an extended clip belongs to one video
  video.src = videoURL;
  video.load();
  S.videoLoaded = true; S.videoName = file.name;
  resetBackground();
  applyLayout();
  emit('video-opened');
  emit('media');
}

export async function openSrt(file) {
  if (!file) return;
  try {
    const list = parseSRT(await file.text());
    if (!list.length) throw new Error('empty');
    setCues(list);
    S.srtLoaded = true; S.srtName = file.name;
    emit('media');
  } catch (e) {
    alert('Could not read that SRT file. Please choose a valid .srt file.');
  }
}

export function removeSrt() {
  setCues([]);
  S.srtLoaded = false; S.srtName = '';
  emit('media');
}

videoFile.addEventListener('change', () => { openVideo(videoFile.files && videoFile.files[0]); videoFile.value = ''; });
srtFile.addEventListener('change', () => { openSrt(srtFile.files && srtFile.files[0]); srtFile.value = ''; });

export const pickVideoFile = () => videoFile.click();
export const pickSrtFile = () => srtFile.click();
export const pickExtFile = () => extFile.click();
pickVideo.addEventListener('click', pickVideoFile);
pickSrt.addEventListener('click', pickSrtFile);
pickExt.addEventListener('click', pickExtFile);
addSrt.addEventListener('click', pickSrtFile);

/* start screen: visible until a video is open; buttons show what is already loaded */
function syncPrompt() {
  prompt.classList.toggle('hidden', S.videoLoaded);
  pickVideo.classList.toggle('done', S.videoLoaded);
  pickSrt.classList.toggle('done', S.srtLoaded);
  pickExt.classList.toggle('done', S.extLoaded);
  syncAddSrt();
}
on('media', syncPrompt);
syncPrompt();
