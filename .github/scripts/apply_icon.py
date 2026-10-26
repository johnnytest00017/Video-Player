"""Replace the default Capacitor launcher icons with the app icon (run after `npx cap add android`)."""
from pathlib import Path
from PIL import Image, ImageDraw

ASSETS = Path("assets")
RES = Path("android/app/src/main/res")
BG = "#050507"

icon = Image.open(ASSETS / "icon.png").convert("RGBA")
fore = Image.open(ASSETS / "icon-foreground.png").convert("RGBA")


def rounded(img, radius_ratio):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, *img.size], radius=int(img.size[0] * radius_ratio), fill=255)
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(img, mask=mask)
    return out


count = 0
for path in sorted(RES.glob("mipmap-*/ic_launcher*.png")):
    size = Image.open(path).size
    if path.name == "ic_launcher_foreground.png":
        out = fore.resize(size, Image.LANCZOS)
    elif path.name == "ic_launcher_round.png":
        out = rounded(icon.resize(size, Image.LANCZOS), .5)
    else:
        out = rounded(icon.resize(size, Image.LANCZOS), .22)
    out.save(path)
    count += 1
print(f"Replaced {count} launcher icon files")

for xml in RES.glob("values/ic_launcher_background.xml"):
    xml.write_text(f'<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">{BG}</color>\n</resources>\n')
    print("Set adaptive icon background", xml)
