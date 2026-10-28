"""아이콘 생성: 파란 바탕 + 흰 TV 화면 + 재생 삼각형 + 받침대. `python tools/make_icons.py`"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
S = 512
BLUE = (26, 115, 232, 255)
WHITE = (255, 255, 255, 255)

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([0, 0, S - 1, S - 1], radius=112, fill=BLUE)
# TV 화면
d.rounded_rectangle([72, 104, 440, 356], radius=40, fill=WHITE)
# 재생 삼각형
d.polygon([(220, 170), (220, 290), (322, 230)], fill=BLUE)
# 받침대
d.rounded_rectangle([196, 380, 316, 408], radius=14, fill=WHITE)
d.rectangle([244, 356, 268, 384], fill=WHITE)

OUT.mkdir(exist_ok=True)
for size in (16, 32, 48, 128):
    img.resize((size, size), Image.LANCZOS).save(OUT / f"icon{size}.png")
print("ok", sorted(p.name for p in OUT.iterdir()))
