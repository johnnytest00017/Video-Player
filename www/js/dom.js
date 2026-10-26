/* Element handles, looked up once. Modules are deferred, so the DOM is ready. */
const $ = id => document.getElementById(id);

export const stage = $('stage');
export const videoWrap = $('videoWrap');
export const fgLayer = $('fgLayer');
export const video = $('video');
export const extVideo = $('extVideo');
export const stretchCv = $('stretchCv');
export const ambi = $('ambi');
export const ambiFilter = $('ambiFilter');
export const ambiProj = $('ambiProj');
export const ambiNoise = $('ambiNoise');
export const gestures = $('gestures');
export const flash = $('flash');

export const cropEditor = $('cropEditor');
export const adjustEditor = $('adjustEditor');
export const adjBox = $('adjBox');
export const adjHint = $('adjHint');
export const dispHandle = $('dispHandle');

export const prompt = $('uploadPrompt');
export const bigPlay = $('bigPlay');
export const subMain = $('subMain');
export const subTrans = $('description');
export const subsBox = $('subs');
export const addSrt = $('addSrt');

export const controls = $('controls');
export const viewBadge = $('viewBadge');
export const adjustToggle = $('adjustToggle');
export const settingsToggle = $('settingsToggle');
export const fsToggle = $('fsToggle');
export const fsPath = $('fsPath');
export const seek = $('seek');
export const currentTime = $('currentTime');
export const duration = $('duration');
export const playPause = $('playPause');
export const backward = $('backward');
export const forward = $('forward');
export const backLabel = $('backLabel');
export const fwdLabel = $('fwdLabel');

export const sheet = $('sheet');
export const tabs = $('tabs');
export const sheetBody = $('sheetBody');
export const sheetClose = $('sheetClose');

export const videoFile = $('videoFile');
export const srtFile = $('srtFile');
export const extFile = $('extFile');
export const pickVideo = $('pickVideo');
export const pickSrt = $('pickSrt');
export const pickExt = $('pickExt');
export const adjFit = $('adjFit');
export const adjFill = $('adjFill');
export const adjReset = $('adjReset');
export const adjDone = $('adjDone');
