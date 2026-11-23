# -*- coding: utf-8 -*-
"""Анимированная иконка для ВК (Lottie JSON, 96×96, ≤ 24 КБ).

Сюжет: человечек смотрит в телефон, а деньги не улетают — поднимаются
зелёными монетками. Палитра приложения.
"""
import json
import os

W = H = 96
FR = 30
OP = 90  # 3 секунды, цикл

INK = [0.098, 0.094, 0.075, 1]      # #191813
CREAM = [1.0, 0.992, 0.976, 1]      # #fffdf9
GREEN = [0.11, 0.42, 0.345, 1]      # #1c6b58
AMBER = [0.851, 0.643, 0.255, 1]    # #d9a441

EASE_IN = {"x": [0.35], "y": [1]}
EASE_OUT = {"x": [0.65], "y": [0]}


def shape(items, pos=(0, 0), scale=(100, 100), rot=0):
    items = items + [{
        "ty": "tr", "p": {"a": 0, "k": list(pos)}, "a": {"a": 0, "k": [0, 0]},
        "s": {"a": 0, "k": list(scale)}, "r": {"a": 0, "k": rot}, "o": {"a": 0, "k": 100},
    }]
    return {"ty": "gr", "it": items}


def ellipse(d, color):
    return [
        {"ty": "el", "p": {"a": 0, "k": [0, 0]}, "s": {"a": 0, "k": [d, d]}},
        {"ty": "fl", "c": {"a": 0, "k": color}, "o": {"a": 0, "k": 100}, "r": 1},
    ]


def rect(w, h, r, color):
    return [
        {"ty": "rc", "p": {"a": 0, "k": [0, 0]}, "s": {"a": 0, "k": [w, h]},
         "r": {"a": 0, "k": r}},
        {"ty": "fl", "c": {"a": 0, "k": color}, "o": {"a": 0, "k": 100}, "r": 1},
    ]


def layer(ind, name, shapes, ks_extra=None, ip=0, op=OP):
    ks = {
        "o": {"a": 0, "k": 100},
        "r": {"a": 0, "k": 0},
        "p": {"a": 0, "k": [0, 0, 0]},
        "a": {"a": 0, "k": [0, 0, 0]},
        "s": {"a": 0, "k": [100, 100, 100]},
    }
    if ks_extra:
        ks.update(ks_extra)
    return {"ddd": 0, "ind": ind, "ty": 4, "nm": name, "sr": 1, "ks": ks,
            "ao": 0, "shapes": shapes, "ip": ip, "op": op, "st": 0, "bm": 0}


def coin(ind, phase, start, end, color=GREEN, size=8):
    """Монетка поднимается и тает. phase сдвигает цикл, чтобы шли по очереди."""
    span = 36
    t0 = int(phase * (OP - span))
    t1 = t0 + span
    x0, y0 = start
    x1, y1 = end
    mx, my = (x0 + x1) / 2 + (4 if x1 > x0 else -4), (y0 + y1) / 2

    pos = {"a": 1, "k": [
        {"t": t0, "s": [x0, y0, 0], "e": [mx, my, 0], "i": EASE_IN, "o": EASE_OUT},
        {"t": t0 + span // 2, "s": [mx, my, 0], "e": [x1, y1, 0], "i": EASE_IN, "o": EASE_OUT},
        {"t": t1, "s": [x1, y1, 0]},
    ]}
    opa = {"a": 1, "k": [
        {"t": t0, "s": [0], "e": [90], "i": EASE_IN, "o": EASE_OUT},
        {"t": t0 + span // 4, "s": [90], "e": [90], "i": EASE_IN, "o": EASE_OUT},
        {"t": t1 - 8, "s": [90], "e": [0], "i": EASE_IN, "o": EASE_OUT},
        {"t": t1, "s": [0]},
    ]}
    scl = {"a": 1, "k": [
        {"t": t0, "s": [55, 55, 100], "e": [100, 100, 100], "i": EASE_IN, "o": EASE_OUT},
        {"t": t1, "s": [70, 70, 100]},
    ]}
    return layer(ind, "coin%d" % ind, [shape(ellipse(size, color))],
                 {"p": pos, "o": opa, "s": scl})


layers = []

# 1. монетки — самое верхнее
layers.append(coin(1, 0.00, (64, 40), (68, 14), size=8))
layers.append(coin(2, 0.35, (72, 48), (78, 20), size=7))
layers.append(coin(3, 0.62, (56, 30), (52, 10), color=AMBER, size=6))

# 2. телефон (кремовый, чуть наклонён) + две зелёные строчки на экране
# в lottie первым рисуется верхний слой, поэтому строчки идут до корпуса телефона
phone_parts = [
    shape(rect(7, 1.6, 0.8, GREEN), pos=(0, 3), rot=-14),
    shape(rect(5, 1.6, 0.8, GREEN), pos=(-0.6, 6.4), rot=-14),
    shape(rect(14, 24, 3.6, CREAM), rot=-14),
]
layers.append(layer(4, "phone", phone_parts, {
    "p": {"a": 1, "k": [
        {"t": 0, "s": [59, 54, 0], "e": [60, 53, 0], "i": EASE_IN, "o": EASE_OUT},
        {"t": 45, "s": [60, 53, 0], "e": [59, 54, 0], "i": EASE_IN, "o": EASE_OUT},
        {"t": 90, "s": [59, 54, 0]},
    ]},
}))

# 3. рука: короткий тёмный цилиндр от плеча к телефону (за телефоном)
layers.append(layer(5, "arm", [shape(rect(6, 17, 3, INK))], {
    "p": {"a": 0, "k": [49, 61, 0]}, "r": {"a": 0, "k": [28]},
}))

# 4. голова — чуть наклоняется к экрану
layers.append(layer(6, "head", [shape(ellipse(23, INK))], {
    "p": {"a": 0, "k": [37, 42, 0]},
    "r": {"a": 1, "k": [
        {"t": 0, "s": [0], "e": [6], "i": EASE_IN, "o": EASE_OUT},
        {"t": 45, "s": [6], "e": [0], "i": EASE_IN, "o": EASE_OUT},
        {"t": 90, "s": [0]},
    ]},
}))

# 5. плечи
layers.append(layer(7, "body", [shape(rect(34, 26, 11, INK))], {"p": {"a": 0, "k": [35, 71, 0]}}))

data = {
    "v": "5.12.2", "fr": FR, "ip": 0, "op": OP, "w": W, "h": H,
    "nm": "Куда уходят деньги — иконка загрузки", "ddd": 0,
    "assets": [], "layers": layers, "markers": [],
}

out_dir = os.path.join(os.path.dirname(__file__), "..", "dist", "vk-assets")
os.makedirs(out_dir, exist_ok=True)
path = os.path.join(out_dir, "icon-animated.json")
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
print(path, os.path.getsize(path), "байт")
