# Иконки приложения: тёмный квадрат с ₽ (как .brand-mark в интерфейсе).
# Запуск: python tools/make-icons.py  ->  app/icon-192.png, app/icon-512.png, app/icon-maskable-512.png
import os
from PIL import Image, ImageDraw, ImageFont

INK = (25, 24, 19)
CREAM = (255, 253, 249)
GREEN = (28, 107, 88)
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app")

FONTS = [
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\segoeuib.ttf",
    r"C:\Windows\Fonts\tahomabd.ttf",
    r"C:\Windows\Fonts\DejaVuSans-Bold.ttf",
]


def font(size):
    for p in FONTS:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def rounded(size, glyph_ratio, radius_ratio, path, bg=INK, maskable=False):
    S = size * 4  # рисуем крупно и уменьшаем — так края гладкие
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    box = (0, 0, S, S) if maskable else (0, 0, S - 1, S - 1)
    r = 0 if maskable else int(S * radius_ratio)
    if r:
        d.rounded_rectangle(box, radius=r, fill=bg)
    else:
        d.rectangle(box, fill=bg)

    f = font(int(S * glyph_ratio))
    text = "₽"
    l, t, rr, b = d.textbbox((0, 0), text, font=f)
    x = (S - (rr - l)) / 2 - l
    y = (S - (b - t)) / 2 - t
    d.text((x, y), text, font=f, fill=CREAM)

    # тонкая зелёная черта под знаком — узнаваемый акцент
    if not maskable:
        w = S * 0.26
        d.rounded_rectangle((S / 2 - w / 2, S * 0.775, S / 2 + w / 2, S * 0.79),
                            radius=S * 0.008, fill=GREEN)

    img = img.resize((size, size), Image.LANCZOS)
    img.save(path)
    print(os.path.basename(path), size, "px")


rounded(192, 0.60, 0.22, os.path.join(OUT, "icon-192.png"))
rounded(512, 0.60, 0.22, os.path.join(OUT, "icon-512.png"))
rounded(512, 0.44, 0.0, os.path.join(OUT, "icon-maskable-512.png"), maskable=True)
print("готово")
