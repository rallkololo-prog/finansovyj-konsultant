"""Разбор выписки Сбербанка (Vypiska_po_sche_*.pdf) из sber_runs.json.

Структура страницы (координаты из PDF):
  строка операции:  x=45 дата ДД.ММ.ГГГГ · x=96 время ЧЧ:ММ · x=145 категория · x>=460 сумма
  строка деталей:   x=45 дата обработки · x=96 код авторизации · x=145 описание (+ переносы)
Сумма с плюсом — пополнение, без знака — списание.
"""
import json, re, sys

SRC = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\geo\Desktop\Cloude\Moi rascheti\sber_runs.json"
OUT = sys.argv[2] if len(sys.argv) > 2 else r"C:\Users\geo\Desktop\Cloude\Moi rascheti\sber_transactions.json"

DATE = re.compile(r"^\d{2}\.\d{2}\.\d{4}$")
TIME = re.compile(r"^\d{2}:\d{2}$")
AMT = re.compile(r"^([+-]?)(\d[\d\s\u00a0]*)[.,](\d{2})$")
CODE = re.compile(r"^\d{6}$")

runs = json.load(open(SRC, encoding="utf-8"))

by_page = {}
for r in runs:
    if "Продолжение на следующей странице" in r["t"]:
        continue
    by_page.setdefault(r["p"], []).append(r)


def lines_of(items):
    """Кластеризация рунов в строки с допуском 3 pt."""
    items = sorted(items, key=lambda r: -r["y"])
    lines, cur, cy = [], [], None
    for r in items:
        if cy is None or abs(r["y"] - cy) <= 3.0:
            cur.append(r)
            cy = r["y"] if cy is None else cy
        else:
            lines.append(sorted(cur, key=lambda x: x["x"]))
            cur, cy = [r], r["y"]
    if cur:
        lines.append(sorted(cur, key=lambda x: x["x"]))
    return lines


def pick(line, lo, hi):
    return " ".join(r["t"] for r in line if lo <= r["x"] < hi).strip()


def parse_amount(line):
    for r in line:
        if r["x"] < 455:
            continue
        m = AMT.match(r["t"].strip())
        if not m:
            continue
        sign = -1.0 if m.group(1) == "-" else 1.0
        value = float(m.group(2).replace(" ", "").replace("\u00a0", "") + "." + m.group(3))
        # у списаний плюса нет: знак определяется наличием "+" в строке
        return sign * value, ("+" in line[0]["t"] if False else None)
    return None, None


ops = []
for p in sorted(by_page):
    page_lines = lines_of(by_page[p])
    cur = None
    for line in page_lines:
        d = pick(line, 40, 90)
        t = pick(line, 90, 140)
        cat = pick(line, 140, 455)
        amt_txt = " ".join(r["t"] for r in line if r["x"] >= 455).strip()
        is_start = DATE.match(d) and TIME.match(t)
        if is_start:
            m = AMT.match(amt_txt.replace("\u00a0", " "))
            if not m:
                # сумма могла склеиться с соседним руном — пробуем найти любой денежный токен
                mny = re.search(r"([+-]?)\s*(\d[\d\s]*)[.,](\d{2})", amt_txt)
                if not mny:
                    continue
                m = mny
            sign = 1.0 if m.group(1) == "+" else -1.0
            value = float(m.group(2).replace(" ", "").replace("\u00a0", "") + "." + m.group(3))
            cur = {
                "page": p, "op_date": d, "op_time": t, "category_raw": cat,
                "amount": sign * value, "desc": "", "auth": "", "post_date": "",
            }
            ops.append(cur)
        elif cur is not None:
            # строка деталей: дата обработки, код, описание
            pd = pick(line, 40, 90)
            code = pick(line, 90, 140)
            desc = pick(line, 140, 620)
            if DATE.match(pd) and not cur["post_date"]:
                cur["post_date"] = pd
            if CODE.match(code) and not cur["auth"]:
                cur["auth"] = code
            if desc:
                cur["desc"] = (cur["desc"] + " " + desc).strip()

# чистка описаний
for o in ops:
    o["desc"] = re.sub(r"\s+", " ", o["desc"]).strip()
    o["desc"] = re.sub(r"\s*В сумму операции включена комиссия [\d,\s]+руб\.?", "", o["desc"]).strip()

pos = sum(o["amount"] for o in ops if o["amount"] > 0)
neg = -sum(o["amount"] for o in ops if o["amount"] < 0)
print(f"ops {len(ops)}  +{pos:,.2f}  -{neg:,.2f}")
print("первая:", ops[0]["op_date"], ops[0]["category_raw"], ops[0]["amount"])
print("последняя:", ops[-1]["op_date"], ops[-1]["category_raw"], ops[-1]["amount"])

json.dump(ops, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print("saved", OUT)
