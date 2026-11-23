"""Картинки для сообщества ВК: обложка 1590×400 и пост 1080×1080.

Скриншот взят из приложения с выдуманными (демо) операциями — персональных данных нет.
Запуск:  python tools/make-cover.py
"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "dist", "vk-shots", "cover-src2.png")
OUT = os.path.join(ROOT, "dist", "vk-assets")

PAPER = (243, 241, 236)
CARD = (255, 253, 249)
INK = (25, 24, 19)
INK_2 = (95, 90, 78)
MUTED = (124, 119, 103)
GREEN = (28, 107, 88)
LINE = (227, 222, 210)
AMBER = (168, 121, 26)

F_SB = r"C:\Windows\Fonts\seguisb.ttf"
F_RG = r"C:\Windows\Fonts\segoeui.ttf"


def font(path, size):
    return ImageFont.truetype(path, size)


def shot(height):
    """Дашборд без шапки страницы: KPI + графики."""
    im = Image.open(SRC).convert("RGB").crop((292, 166, 1270, 760))
    k = height / im.size[1]
    return im.resize((int(im.size[0] * k), height), Image.LANCZOS)


def place_card(base, img, xy, radius=16, pad=8):
    x, y = xy
    w, h = img.size
    # тень
    sh = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([x - 4, y - 4, x + w + 4, y + h + 4], radius + 4, fill=INK + (46,))
    base.alpha_composite(sh.filter(ImageFilter.GaussianBlur(18)), (0, 12))
    # карточка-подложка
    card = Image.new("RGBA", (w + pad * 2, h + pad * 2), CARD + (255,))
    card.paste(img, (pad, pad))
    mask = Image.new("L", card.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, card.size[0] - 1, card.size[1] - 1], radius + 6, fill=255)
    card.putalpha(mask)
    base.alpha_composite(card, (x - pad, y - pad))
    ImageDraw.Draw(base).rounded_rectangle(
        [x - pad, y - pad, x + w + pad - 1, y + h + pad - 1], radius + 6, outline=LINE + (255,), width=2)


def glow(base, box, color=GREEN, alpha=18, blur=70):
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse(box, fill=color + (alpha,))
    base.alpha_composite(layer.filter(ImageFilter.GaussianBlur(blur)))


def cover():
    W, H = 1590, 400
    base = Image.new("RGBA", (W, H), PAPER + (255,))
    glow(base, [W - 700, -300, W + 260, 600])
    d = ImageDraw.Draw(base)

    img = shot(292)
    place_card(base, img, (W - 64 - img.size[0], (H - img.size[1]) // 2))

    x = 72
    d.text((x, 78), "ПРИЛОЖЕНИЕ ВКОНТАКТЕ", font=font(F_SB, 17), fill=GREEN)
    d.text((x, 108), "Куда уходят деньги", font=font(F_SB, 60), fill=INK)
    d.text((x, 190), "Разбор выписок Т-Банка и Сбера", font=font(F_RG, 26), fill=INK_2)
    d.text((x, 232), "Категории, подписки, необязательные траты —", font=font(F_RG, 20), fill=MUTED)
    d.text((x, 260), "без регистрации и без отправки файлов", font=font(F_RG, 20), fill=MUTED)
    d.rounded_rectangle([x, 312, x + 190, 358], 23, fill=CARD + (255,), outline=LINE + (255,), width=2)
    d.ellipse([x + 20, 329, x + 30, 339], fill=GREEN + (255,))
    d.text((x + 42, 322), "Файл не покидает браузер", font=font(F_RG, 17), fill=INK_2)

    out = os.path.join(OUT, "cover-1590x400.png")
    base.convert("RGB").save(out, optimize=True)
    print("cover:", out)


def post():
    W, H = 1080, 1080
    base = Image.new("RGBA", (W, H), PAPER + (255,))
    glow(base, [-300, -460, 760, 340], alpha=20)
    d = ImageDraw.Draw(base)

    d.text((72, 66), "ПРИЛОЖЕНИЕ ВКОНТАКТЕ", font=font(F_SB, 19), fill=GREEN)
    d.text((72, 96), "Куда уходят деньги", font=font(F_SB, 58), fill=INK)
    d.text((72, 172), "Загрузите PDF-выписку Т-Банка или Сбера —", font=font(F_RG, 24), fill=INK_2)
    d.text((72, 204), "и увидите, на что ушли деньги", font=font(F_RG, 24), fill=INK_2)

    img = shot(556)
    place_card(base, img, ((W - img.size[0]) // 2, 250), radius=16)

    y = 250 + img.size[1] + 46
    items = [("Файл не покидает браузер", GREEN), ("Без регистрации", INK), ("Есть демо-режим", AMBER)]
    x = 72
    for text, color in items:
        f = font(F_RG, 21)
        tw = d.textlength(text, font=f)
        d.rounded_rectangle([x, y, x + tw + 46, y + 50], 25, fill=CARD + (255,), outline=LINE + (255,), width=2)
        d.ellipse([x + 18, y + 21, x + 27, y + 30], fill=color + (255,))
        d.text((x + 36, y + 12), text, font=f, fill=INK_2)
        x += tw + 46 + 12

    f = font(F_RG, 20)
    tail = "Т-Банк · Сбер · разбор в браузере"
    d.text(((W - d.textlength(tail, font=f)) / 2, y + 86), tail, font=f, fill=MUTED)

    out = os.path.join(OUT, "post-1080x1080.png")
    base.convert("RGB").save(out, optimize=True)
    print("post:", out)


if __name__ == "__main__":
    cover()
    post()
