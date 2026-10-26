# Ambient Video Player — Android APK (Capacitor)

This repository wraps the supplied `ambient_video_player_v32.html` as a Capacitor Android app. The HTML is placed at `www/index.html`.

## Build APK with GitHub Actions (recommended)

1. Create a **new empty GitHub repository** (for example `ambient-video-player-android`). Do not add a README or license on GitHub, because this project already contains them.
2. In Termux, install the basics and allow storage access:

   ```sh
   pkg update
   pkg install git nodejs-lts
   termux-setup-storage
   ```

3. Extract this project ZIP into a folder Termux can access, then `cd` into the extracted `ambient-capacitor-project` folder. If the ZIP is in Downloads, one possible method is:

   ```sh
   mkdir -p ~/projects
   cd ~/projects
   unzip ~/storage/downloads/ambient-capacitor-project.zip
   cd ambient-capacitor-project
   ```

   If you extracted it somewhere else, use that folder instead.

4. Set your Git identity if you have not already:

   ```sh
   git config --global user.name "Your Name"
   git config --global user.email "you@example.com"
   ```

5. Connect it to your new GitHub repository. Replace `YOUR-USERNAME` with your GitHub username:

   ```sh
   git init
   git branch -M main
   git add .
   git commit -m "Add Ambient Video Player Capacitor app"
   git remote add origin https://github.com/YOUR-USERNAME/ambient-video-player-android.git
   git push -u origin main
   ```

   GitHub may ask you to authenticate. For HTTPS Git operations, use a GitHub personal access token when prompted for a password; do not paste your token into chat or commit it to the repository.

6. On GitHub, open **Actions** → **Build Android APK** → **Run workflow**. You can also let it run automatically after pushing to `main`.
7. When the workflow finishes successfully, open that run, scroll to **Artifacts**, and download `ambient-video-player-debug-apk`. Extract it and install `app-debug.apk` on your Android phone. Android may ask you to allow installation from the app you used to open it.

## Updating the app

Replace `www/index.html` with your updated HTML file, then commit and push:

```sh
git add www/index.html
git commit -m "Update player"
git push
```

GitHub Actions will build a fresh APK. This workflow produces a **debug APK for personal testing**, not a Play Store release. Keep the same package ID (`com.ambientvideoplayer.app`) if you want future release builds to update the installed app.

## Notes

- The app name is **Ambient Video Player**.
- Package ID: `com.ambientvideoplayer.app`.
- Capacitor packages the existing HTML; it does not rewrite the player UI.
- Test local video and SRT picking, playback, fullscreen, crop tools, and Ambilight on the device. WebView behavior can differ from a desktop browser.
- The HTML currently uses browser local storage for Ambilight settings. Capacitor's WebView supports local storage, but data may be cleared if the app is uninstalled.
