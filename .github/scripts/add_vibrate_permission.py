#!/usr/bin/env python3
"""Adds <uses-permission android:name="android.permission.VIBRATE"/> to the generated Android manifest.

Without this permission Android silently ignores every vibration the web code asks for (the haptics in v3.3).
Run it AFTER the Android project exists (after `npx cap add android` / `npx cap sync android`) and BEFORE the Gradle build.
Safe to run more than once. Usage:  python .github/scripts/add_vibrate_permission.py [path/to/AndroidManifest.xml]
"""
import pathlib
import sys

PERM = '<uses-permission android:name="android.permission.VIBRATE" />'


def find_manifest():
    if len(sys.argv) > 1:
        return pathlib.Path(sys.argv[1])
    hits = sorted(pathlib.Path('.').glob('**/app/src/main/AndroidManifest.xml'))
    if not hits:
        sys.exit('AndroidManifest.xml not found - run this after the Android project has been created.')
    return hits[0]


def main():
    path = find_manifest()
    text = path.read_text(encoding='utf-8')
    if 'android.permission.VIBRATE' in text:
        print(f'{path}: VIBRATE permission already present')
        return
    marker = '<application'
    i = text.find(marker)
    if i < 0:
        sys.exit(f'{path}: no <application> element found')
    line_start = text.rfind('\n', 0, i) + 1
    indent = text[line_start:i] if not text[line_start:i].strip() else '    '
    text = text[:line_start] + f'{indent}{PERM}\n' + text[line_start:]
    path.write_text(text, encoding='utf-8')
    print(f'{path}: added VIBRATE permission')


if __name__ == '__main__':
    main()
