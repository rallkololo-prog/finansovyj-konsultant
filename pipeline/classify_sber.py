# -*- coding: utf-8 -*-
"""Классификация операций Сбера: kind + категория + бренд в формате tx_classified.json."""
import json, re, sys
from collections import Counter

sys.path.insert(0, r"C:\Users\geo\Desktop\Cloude\Moi rascheti")
from classify import kind_of, category_of, brand_of, merchant_of, norm

SRC = r"C:\Users\geo\Desktop\Cloude\Moi rascheti\sber_transactions.json"
OUT = r"C:\Users\geo\Desktop\Cloude\Moi rascheti\sber_classified.json"

JUNK = re.compile(r"\.?\s*Операция по карте \*+\d+", re.I)
FOOT = re.compile(r"Продолжение на следующей странице", re.I)

SBER_CAT = {
    "Супермаркеты": "Продукты",
    "Рестораны и кафе": "Кофе и фастфуд",
    "Все для дома": "Дом и ремонт",
    "Одежда и аксессуары": "Одежда и обувь",
    "Коммунальные платежи, связь, интернет.": "Связь и интернет",
    "Образование": "Образование",
    "Путешествия": "Путешествия",
    "Автомобиль": "Транспорт",
    "Транспорт": "Транспорт",
    "Отдых и развлечения": "Развлечения",
    "Прочие расходы": "Прочее",
    "Прочие операции": "Прочее",
    "Оплата по QR–коду СБП": "Прочее",
    "Здоровье и красота": "Здоровье и аптеки",
    "Выдача наличных": "Снятие наличных",
}

SALARY = re.compile(r"заработная плата|аванс по заработной|отпускные|расчет при увольнении|прочие выплаты", re.I)
TRANSFERS = {"Перевод СБП", "Перевод с карты", "Перевод на карту", "Прочие операции"}
OWN = re.compile(r"sberbank onl@in|vklad-karta|p2p|перевод между своими|вклад", re.I)


def clean(desc):
    d = JUNK.sub("", desc)
    d = FOOT.sub("", d)
    return norm(d)


def kind_for(rec, desc, amount):
    cat = rec["category_raw"]
    d = desc.lower()
    if cat in ("Возврат, отмена операции", "Возврат покупки по QR–коду СБП"):
        return "refund"
    if "komissiya" in d or d.startswith("mobile bank"):
        return "fee"
    if cat == "Выдача наличных":
        return "cash_out"
    if cat == "Внесение наличных":
        return "cash_in"
    if cat in ("Перевод СБП", "Перевод с карты", "Перевод на карту"):
        return "internal" if OWN.search(desc) else "p2p"
    if amount > 0 and SALARY.search(desc):
        return "salary"
    if amount > 0 and OWN.search(desc):
        return "in_in"
    if amount > 0 and cat == "Прочие операции":
        return "p2p"
    k = kind_of(desc, amount)
    if k in ("unknown", "purchase"):
        return "purchase" if amount < 0 else "in_in"
    return k


def category_for(rec, desc, kind):
    d = desc.lower()
    if kind == "fee":
        return "Комиссии банка"
    if kind == "cash_out":
        return "Снятие наличных"
    if kind in ("p2p", "cash_in"):
        return "Переводы людям" if kind == "p2p" else "Доходы и пополнения"
    if kind in ("salary", "in_in", "refund", "interest", "bonus", "cashback"):
        return "Доходы и пополнения"
    cat = category_of(desc, kind)
    if cat != "Прочее":
        return cat
    return SBER_CAT.get(rec["category_raw"], "Прочее")


def main():
    rows = json.load(open(SRC, encoding="utf-8"))
    out = []
    for r in rows:
        desc = clean(r["desc"]) or r["category_raw"]
        kind = kind_for(r, desc, r["amount"])
        cat = category_for(r, desc, kind)
        m = merchant_of(desc)
        b = brand_of(desc, m, cat)
        d = r["op_date"]
        iso = d[6:10] + "-" + d[3:5] + "-" + d[0:2]
        out.append({
            "d": d, "iso": iso, "t": r["op_time"], "a": round(r["amount"], 2),
            "desc": desc, "m": m, "b": b, "k": kind, "c": cat,
            "raw_cat": r["category_raw"],
        })

    spend = [x for x in out if x["a"] < 0 and x["k"] in ("purchase", "fee")]
    total = -sum(x["a"] for x in spend)
    print(f"ops {len(out)} · расходы(purchase+fee) {total:,.2f} · покупок {len(spend)}")
    cats = Counter()
    sums = Counter()
    for x in spend:
        cats[x["c"]] += 1
        sums[x["c"]] += -x["a"]
    for c, s in sums.most_common():
        print(f"   {s:12,.0f} ₽  {cats[c]:5d}  {c}")
    kinds = Counter(x["k"] for x in out)
    print("kinds:", dict(kinds))
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print("saved", OUT)


if __name__ == "__main__":
    main()
