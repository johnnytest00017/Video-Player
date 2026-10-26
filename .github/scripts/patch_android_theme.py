from pathlib import Path
import re

ITEMS = """
        <item name="android:windowBackground">#000000</item>
        <item name="android:colorBackground">#000000</item>
        <item name="android:statusBarColor">@android:color/transparent</item>
        <item name="android:navigationBarColor">@android:color/transparent</item>
        <item name="android:windowDrawsSystemBarBackgrounds">true</item>
        <item name="android:enforceStatusBarContrast">false</item>
        <item name="android:enforceNavigationBarContrast">false</item>
        <item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>"""

files = list(Path("android/app/src/main/res").glob("values*/styles.xml"))
if not files:
    raise SystemExit("No Android styles.xml found")

for path in files:
    text = path.read_text()
    # Insert our items into every style the app uses (AppTheme, AppTheme.NoActionBar, ...);
    # our items go first, later duplicates in the same style are ignored by the first-wins cleanup below.
    def add(m):
        return m.group(1) + ITEMS
    new = re.sub(r'(<style\b[^>]*\bname="AppTheme(?:\.NoActionBar)?"[^>]*>)', add, text)
    # Drop the template's own conflicting items so ours win.
    for name in ("android:background",):
        new = re.sub(r'\s*<item name="%s">@null</item>' % re.escape(name), "", new)
    path.write_text(new)
    print("Patched", path)
    print(new)
