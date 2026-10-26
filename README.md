# Video Player

Android video player (Capacitor) with an **ambient glow**, subtitles, black-bar crop and full control over how the video sits in its **display**.

## Features

- **Frame control** — the display and the video are separate: set the display height, then zoom, move and stretch the video inside it. Pinch to zoom, two fingers to move; *Move & zoom* mode adds one-finger drag and a handle to resize the display. Whatever the video does not cover is filled by the ambient background.
- **Ambient background** — Ambilight glow, live Stretch fill, an optional Extended (outpainted) video, or off.
- **Crop** — automatic black-bar detection and four draggable cut lines.
- **Subtitles** — SRT with Arabic main line + translation line, size and delay controls.
- **Cinema layout** — fullscreen or landscape hides the controls while playing; the Android back button closes panels first.
- Double-tap left / right to skip, middle for fullscreen; keyboard shortcuts on desktop (Space, ← →, F).

## Project layout

```
www/
  index.html          markup only
  css/                base · player · editors · sheet
  js/
    main.js           entry point
    layout.js         frame engine (crop + fit + zoom/move/stretch → one transform)
    frame.js          gestures, Move & zoom mode, display handle
    crop.js           crop editor + auto-detect
    ambilight.js · stretch.js · extended.js · background.js    backgrounds + draw loop
    subtitles.js · media.js · player.js                        content + transport
    settings.js       tabbed settings sheet
    state.js · ui.js · native.js · util.js · dom.js · config.js
assets/               app icon (SVG + PNG masters)
.github/              CI build + Android theme / icon patch scripts
```

## Build the APK (GitHub Actions)

Push to `main` (or run **Build Android APK** manually under *Actions*). Download the `video-player-debug-apk` artifact and install `app-debug.apk`.

## Update from Termux

```sh
cd ~/projects/Video-Player
unzip -o ~/storage/downloads/<new-zip>.zip -d .
git add -A
git commit -m "Describe the change"
git push origin main
```

Use a GitHub personal access token as the password when asked; never commit it.

## Develop in a browser

```sh
cd www && python3 -m http.server 8000     # then open http://localhost:8000
```

ES modules need a server (not `file://`).

## Notes

- Package ID `com.ambientvideoplayer.app` stays fixed so new builds update the installed app.
- This workflow builds a **debug** APK for personal use.
- Settings (display, ambient, preferences) are kept in the WebView's local storage.
- Third-party code: see `THIRD_PARTY_NOTICES.md`.
