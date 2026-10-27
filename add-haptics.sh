#!/bin/sh
# One-time native fix: the APK has no VIBRATE permission and no Haptics plugin, which is why nothing vibrates.
# Run from the repo root. Safe to run twice.
set -e
npm install @capacitor/haptics
M=android/app/src/main/AndroidManifest.xml
if [ -f "$M" ]; then
  npx cap sync android || true
  grep -q 'android.permission.VIBRATE' "$M" || sed -i 's#</manifest>#    <uses-permission android:name="android.permission.VIBRATE" />\n</manifest>#' "$M"
  echo "Manifest checked: $M"
else
  echo "No android/ folder here (CI builds it) - package.json now lists the plugin, commit it."
fi
