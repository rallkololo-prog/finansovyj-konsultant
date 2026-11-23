# -*- coding: utf-8 -*-
"""data/data.js — данные и аналитика для модуля «Финансовый консультант»."""
import json
import os, os, statistics, math
from collections import defaultdict
from datetime import date

BASE = r"C:\Users\geo\Desktop\Cloude\Moi rascheti"

def load():
    tb = json.load(open(BASE + r"\tx_classified.json", encoding="utf-8"))
    for t in tb:
        t["src"] = "tb"
    sb = json.load(open(BASE + r"\sber_classified.json", encoding="utf-8"))
    for t in sb:
        t["src"] = "sber"
    txs = tb + sb
    for i, t in enumerate(txs):
        d, m, y = t["d"].split(".")
        t["iso"] = f"{y}-{m}-{d}"
        t["dt"] = date(int(y), int(m), int(d))
        hh, mi = (t["t"].split(":") if t["t"] else ["-1", "0"])
        t["h"] = int(hh) if hh != "-1" else -1
        t["min"] = int(hh) * 60 + int(mi) if t["h"] >= 0 else -1
    txs.sort(key=lambda t: (t["iso"], t["min"]), reverse=True)
    for i, t in enumerate(txs):
        t["id"] = i
    return txs

TXS = load()

CATS = ["Продукты", "Кофе и фастфуд", "Доставка еды", "Такси и каршеринг", "Кикшеринг",
        "Транспорт", "Путешествия", "Табак", "Маркетплейсы", "Одежда и обувь", "Дом и ремонт", "Питомцы",
        "Здоровье и аптеки", "Связь и интернет", "Подписки и сервисы", "Страхование",
        "Развлечения", "Ставки и азартные игры", "Красота и уход", "Образование",
        "Госуслуги и налоги", "Цветы и подарки", "Комиссии банка", "Снятие наличных",
        "Прочее", "Переводы людям", "Переводы в другие банки", "Между своими счетами",
        "Инвестиции и вклады", "Доходы и пополнения"]
CAT = {c: i for i, c in enumerate(CATS)}
SPEND_CATS = [c for c in CATS if c not in ("Снятие наличных", "Переводы людям", "Переводы в другие банки",
                                          "Между своими счетами", "Инвестиции и вклады", "Доходы и пополнения")]
CONSUMPTION = [c for c in SPEND_CATS if c != "Комиссии банка"]

ALL_MONTHS = []
y, m = 2020, 10
while (y, m) <= (2026, 11):
    ALL_MONTHS.append(f"{y:04d}-{m:02d}")
    m += 1
    if m == 13:
        m = 1; y += 1

ACTIVE_START, ACTIVE_END = "2026-02-01", "2026-11-23"
ACTIVE_DAYS = (date(2026, 11, 23) - date(2026, 2, 1)).days + 1     # 296
FULL_DAYS = (date(2026, 11, 23) - date(2020, 10, 2)).days + 1      # 2244
ACTIVE_MONTHS = ALL_MONTHS[ALL_MONTHS.index(ACTIVE_START[:7]):]
ACTIVE_MONTHS_LIST = [mm for mm in ALL_MONTHS if mm >= ACTIVE_START[:7]]

def months_list(start, end):
    return [mm for mm in ALL_MONTHS if start[:7] <= mm <= end[:7]]

def cv(vals):
    vals = [v for v in vals if v > 0]
    if len(vals) < 2:
        return None
    mu = statistics.mean(vals)
    return round(statistics.pstdev(vals) / mu, 3) if mu else None

def med(v):
    return round(statistics.median(v), 2) if v else 0.0

def build_block(txs, months, days, label):
    spend = [t for t in txs if t["k"] in ("purchase", "fee") and t["a"] < 0]
    cat_month = defaultdict(lambda: defaultdict(float))
    cat_cnt = defaultdict(lambda: defaultdict(int))
    brand_month = defaultdict(lambda: defaultdict(float))
    brand_cnt = defaultdict(lambda: defaultdict(int))
    brand_cat, brand_total, brand_n = {}, defaultdict(float), defaultdict(int)
    brand_rows = defaultdict(list)
    cat_vals = defaultdict(list)
    month_total, month_cnt = defaultdict(float), defaultdict(int)
    month_cat = defaultdict(lambda: defaultdict(float))
    wd_sum, wd_cnt = defaultdict(float), defaultdict(int)
    h_sum, h_cnt = defaultdict(float), defaultdict(int)
    for t in spend:
        amt = -t["a"]
        mm = t["iso"][:7]
        cat_month[t["c"]][mm] += amt
        cat_cnt[t["c"]][mm] += 1
        brand_month[t["b"]][mm] += amt
        brand_cnt[t["b"]][mm] += 1
        brand_cat[t["b"]] = t["c"]
        brand_total[t["b"]] += amt
        brand_n[t["b"]] += 1
        brand_rows[t["b"]].append((t["dt"], amt, t["id"]))
        cat_vals[t["c"]].append(amt)
        month_total[mm] += amt
        month_cnt[mm] += 1
        month_cat[mm][t["c"]] += amt
        wd_sum[t["dt"].weekday()] += amt
        wd_cnt[t["dt"].weekday()] += 1
        if t["h"] >= 0:
            h_sum[t["h"]] += amt
            h_cnt[t["h"]] += 1

    total = sum(brand_total.values())
    per_month_div = days / 30.4375

    categories = {}
    for c in SPEND_CATS:
        vals = cat_vals.get(c, [])
        s = sum(vals)
        monthly_all = [round(cat_month[c].get(mm, 0), 2) for mm in ALL_MONTHS]
        monthly_act = [round(cat_month[c].get(mm, 0), 2) for mm in months]
        cnt_act = [cat_cnt[c].get(mm, 0) for mm in months]
        categories[c] = {
            "total": round(s, 2), "cnt": len(vals),
            "avg": round(s / len(vals), 2) if vals else 0,
            "median": med(vals), "max": round(max(vals), 2) if vals else 0,
            "per_month": round(s / per_month_div, 2),
            "per_year": round(s / per_month_div * 12, 2),
            "share": round(s / total * 100, 1) if total else 0,
            "cv": cv([x for x in monthly_act if x > 0]),
            "series": monthly_act, "counts": cnt_act,
            "series_all": monthly_all,
        }

    brands = {}
    for b, s in brand_total.items():
        rows = sorted(brand_rows[b], key=lambda r: r[0])
        gaps = [(rows[i][0] - rows[i - 1][0]).days for i in range(1, len(rows))]
        amts = [r[1] for r in rows]
        brands[b] = {
            "cat": brand_cat[b], "total": round(s, 2), "cnt": len(rows),
            "avg": round(s / len(rows), 2), "median": med(amts), "max": round(max(amts), 2),
            "gap_med": med(gaps) if gaps else None,
            "cv_amount": cv(amts),
            "per_month": round(s / per_month_div, 2),
            "first": rows[0][0].isoformat(), "last": rows[-1][0].isoformat(),
            "series": [round(brand_month[b].get(mm, 0), 2) for mm in months],
            "counts": [brand_cnt[b].get(mm, 0) for mm in months],
            "ids": [r[2] for r in rows],
        }

    # регулярные списания
    recurring = []
    for b, info in brands.items():
        if info["cnt"] < 3 or info["cv_amount"] is None or not info["gap_med"]:
            continue
        g = info["gap_med"]
        period = None
        if 25 <= g <= 36: period = "месяц"
        elif 55 <= g <= 75: period = "2 месяца"
        elif 12 <= g <= 18: period = "2 недели"
        elif 6 <= g <= 9: period = "неделя"
        elif 85 <= g <= 100: period = "квартал"
        if not period or info["cv_amount"] > 0.45:
            continue
        per_year = {"неделя": 52, "2 недели": 26, "месяц": 12, "квартал": 4, "2 месяца": 6}[period]
        recurring.append({
            "brand": b, "cat": info["cat"], "period": period, "typical": info["median"],
            "yearly": round(info["median"] * per_year, 2), "cnt": info["cnt"],
            "first": info["first"], "last": info["last"], "cv": info["cv_amount"],
            "total": info["total"], "ready": True if info["last"] >= months[-2] else False,
        })
    recurring.sort(key=lambda r: -r["yearly"])

    # мелкие
    base_rate = per_month_div
    small = [t for t in spend if -t["a"] <= 500 and t["c"] != "Комиссии банка"]
    small_total = sum(-t["a"] for t in small)
    small_month = defaultdict(float)
    for t in small:
        small_month[t["iso"][:7]] += -t["a"]
    small_block = {
        "limit": 500, "cnt": len(small), "total": round(small_total, 2),
        "avg": round(small_total / len(small), 2) if small else 0,
        "per_month": round(small_total / base_rate, 2),
        "per_year": round(small_total / base_rate * 12, 2),
        "per_5y": round(small_total / base_rate * 60, 2),
        "per_day": round(small_total / days, 2),
        "cnt_per_day": round(len(small) / days, 2),
        "share": round(small_total / total * 100, 1) if total else 0,
        "by_cat": {c: round(sum(-t["a"] for t in small if t["c"] == c), 2) for c in SPEND_CATS if any(t["c"] == c for t in small)},
        "series": [round(small_month.get(mm, 0), 2) for mm in months],
        "counts": [sum(1 for t in small if t["iso"][:7] == mm) for mm in months],
    }

    WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
    weekday = [{"wd": WD[i], "sum": round(wd_sum[i], 2), "cnt": wd_cnt[i],
                "avg": round(wd_sum[i] / wd_cnt[i], 2) if wd_cnt[i] else 0} for i in range(7)]
    hours = [{"h": i, "sum": round(h_sum[i], 2), "cnt": h_cnt[i]} for i in range(24)]

    # месяц года (среднее по полным месяцам периода)
    moy = defaultdict(lambda: [0.0, 0])
    for i, mm in enumerate(months):
        mnum = int(mm[5:])
        moy[mnum][0] += month_total[mm]
        moy[mnum][1] += 1
    mood = [{"m": i, "avg": round(moy[i][0] / moy[i][1], 2) if moy[i][1] else 0} for i in range(1, 13)]

    # аномалии: сумма сильно выше типичной для этой категории
    anomalies = []
    for c in CONSUMPTION:
        vals = cat_vals.get(c, [])
        if len(vals) < 8:
            continue
        m_med = statistics.median(vals)
        logs = [math.log1p(v) for v in vals]
        lm = statistics.median(logs)
        mad = statistics.median([abs(v - lm) for v in logs]) or 0.05
        for t in spend:
            if t["c"] != c:
                continue
            amt = -t["a"]
            if amt >= 2500 and amt > max(3 * m_med, m_med + 1500):
                z = (math.log1p(amt) - lm) / (1.4826 * mad)
                anomalies.append({"id": t["id"], "date": t["iso"], "amount": round(amt, 2),
                                  "brand": t["b"], "cat": c, "median": round(m_med, 2),
                                  "ratio": round(amt / m_med, 1) if m_med else None,
                                  "score": round(z, 1)})
    anomalies.sort(key=lambda a: -a["amount"])
    biggest = sorted(anomalies, key=lambda a: -a["amount"])[:15]
    # всплески месяцев
    act_vals = [month_total[mm] for mm in months if month_total[mm] > 0]
    med_month = statistics.median(act_vals) if act_vals else 0
    spikes = [{"month": mm, "spend": round(month_total[mm], 2), "ratio": round(month_total[mm] / med_month, 2)}
              for mm in months if med_month and month_total[mm] > med_month * 1.3]
    # тренд по компаниям: вторая половина периода против первой
    half = len(months) // 2
    first_m, second_m = set(months[:half]), set(months[half:])
    brand_trend = []
    for b, info in brands.items():
        if info["cnt"] < 4:
            continue
        f = sum(brand_month[b].get(mm, 0) for mm in first_m)
        s = sum(brand_month[b].get(mm, 0) for mm in second_m)
        if max(f, s) < 2000:
            continue
        brand_trend.append({"brand": b, "cat": info["cat"], "first": round(f, 2), "second": round(s, 2),
                            "delta": round(s - f, 2),
                            "pct": round((s - f) / f * 100, 1) if f > 0 else None})
    brand_trend.sort(key=lambda r: -(r["delta"]))

    # дубли
    buckets = defaultdict(list)
    for t in spend:
        buckets[(t["b"], round(-t["a"], 2))].append(t)
    dups = []
    for (b, a), rows in buckets.items():
        rows.sort(key=lambda r: r["dt"])
        for i in range(1, len(rows)):
            if (rows[i]["dt"] - rows[i - 1]["dt"]).days <= 2 and a >= 200:
                dups.append({"id": rows[i]["id"], "date": rows[i]["iso"], "amount": a,
                             "brand": b, "cat": rows[i]["c"], "prev": rows[i - 1]["iso"]})
    dups.sort(key=lambda r: r["date"], reverse=True)

    # доходы/инвестиции/переводы по месяцам
    income = defaultdict(float)
    invest = defaultdict(float)
    p2p = defaultdict(float)
    cash = defaultdict(float)
    for t in txs:
        mm = t["iso"][:7]
        if mm not in months:
            continue
        if t["k"] in ("in_in", "salary", "bonus", "cashback", "interest") and t["a"] > 0:
            income[mm] += t["a"]
        elif t["k"] in ("invest_out", "invest_in"):
            invest[mm] += -t["a"]
        elif t["k"] in ("p2p", "ext_bank"):
            p2p[mm] += -t["a"]
        elif t["k"] == "cash_out":
            cash[mm] += -t["a"]

    # отчёты по месяцам
    reports = {}
    for mm in months:
        cats = sorted(((c, round(month_cat[mm].get(c, 0), 2)) for c in SPEND_CATS), key=lambda kv: -kv[1])
        bs = sorted(((b, round(brand_month[b].get(mm, 0), 2)) for b in brand_total), key=lambda kv: -kv[1])
        reports[mm] = {
            "spend": round(month_total[mm], 2), "cnt": month_cnt[mm],
            "check": round(month_total[mm] / month_cnt[mm], 2) if month_cnt[mm] else 0,
            "income": round(income.get(mm, 0), 2),
            "invest": round(invest.get(mm, 0), 2),
            "p2p": round(p2p.get(mm, 0), 2),
            "top_cats": [[c, v] for c, v in cats[:4] if v > 0],
            "top_brands": [[b, v] for b, v in bs[:4] if v > 0],
            "anomalies": sum(1 for a in anomalies if a["date"][:7] == mm),
        }

    # сравнение месяцев внутри периода
    for i, mm in enumerate(months):
        prev = months[i - 1] if i else None
        reports[mm]["prev_spend"] = reports[prev]["spend"] if prev else None
        reports[mm]["delta"] = round(reports[mm]["spend"] - reports[prev]["spend"], 2) if prev else None

    return {
        "label": label, "months": months, "days": days,
        "totals": {
            "spend": round(total, 2), "cnt": len(spend),
            "avg": round(total / len(spend), 2) if spend else 0,
            "per_month": round(total / per_month_div, 2),
            "per_year": round(total / per_month_div * 12, 2),
            "income": round(sum(income.values()), 2),
            "invest": round(sum(invest.values()), 2),
            "p2p": round(sum(p2p.values()), 2),
            "cash": round(sum(cash.values()), 2),
        },
        "categories": categories,
        "brands": brands,
        "recurring": recurring,
        "small": small_block,
        "weekday": weekday, "hours": hours, "moy": mood,
        "anomalies": anomalies[:40], "biggest": biggest, "spikes": spikes, "brand_trend": brand_trend[:25],
        "dups": dups[:30],
        "reports": reports,
        "series": {
            "total": [round(sum(cat_month[c].get(mm, 0) for c in SPEND_CATS), 2) for mm in months],
            "income": [round(income.get(mm, 0), 2) for mm in months],
            "invest": [round(invest.get(mm, 0), 2) for mm in months],
            "p2p": [round(p2p.get(mm, 0), 2) for mm in months],
            "cash": [round(cash.get(mm, 0), 2) for mm in months],
            "check": [round(month_total[mm] / month_cnt[mm], 2) if month_cnt[mm] else 0 for mm in months],
            "cnt": [month_cnt[mm] for mm in months],
        },
    }

active_tx = [t for t in TXS if t["iso"] >= ACTIVE_START]
full = build_block(TXS, ALL_MONTHS, FULL_DAYS, "весь период")
active = build_block(active_tx, ACTIVE_MONTHS_LIST, ACTIVE_DAYS, "активный период")

# профиль по активному периоду
A = active
tot = A["totals"]["spend"]
reg_total = sum(r["yearly"] for r in A["recurring"])
brand_totals = sorted((b["total"] for b in A["brands"].values()), reverse=True)
hhi = sum((v / tot) ** 2 for v in brand_totals) * 10000 if tot else 0
profile = {
    "regular_share": round(reg_total / tot * 100, 1) if tot else 0,
    "variable_share": round(100 - reg_total / tot * 100, 1) if tot else 0,
    "regular_yearly": round(reg_total, 2),
    "hhi": round(hhi),
    "top10_share": round(sum(brand_totals[:10]) / tot * 100, 1) if tot else 0,
    "stability_cv": cv([v for v in A["series"]["total"] if v > 0]),
    "avg_check": A["totals"]["avg"],
    "avg_check_median": med([-t["a"] for t in active_tx if t["k"] in ("purchase", "fee")]),
    "uncategorized_share": A["categories"]["Прочее"]["share"],
    "cash_share": round(A["totals"]["cash"] / (tot + A["totals"]["cash"]) * 100, 1) if tot else 0,
}

# ---- рекомендации -----------------------------------------------------------
def cat_facts(c):
    k = A["categories"][c]
    return k["total"], k["cnt"], k["per_year"], k["avg"]

def last_ids(c, n=60):
    rows = [t for t in active_tx if t["c"] == c and t["a"] < 0]
    rows.sort(key=lambda t: t["dt"], reverse=True)
    return [t["id"] for t in rows[:n]]

def make_rec(cat, pct, title, why, conf, effort):
    total, cnt, per_year, avg = cat_facts(cat)
    save_m = round(per_year / 12 * pct / 100, 2)
    return {"cat": cat, "pct": pct, "title": title, "why": why,
            "base_year": round(per_year, 2), "base_month": round(per_year / 12, 2),
            "save_month": save_m, "save_year": round(save_m * 12, 2), "save_5y": round(save_m * 60, 2),
            "cnt_year": round(cnt * 12 / (ACTIVE_DAYS / 30.4375)), "avg_check": avg,
            "confidence": conf, "effort": effort, "ids": last_ids(cat)}

recs = [
    make_rec("Продукты", 10, "Сравнивать магазины внутри недели",
             "Основная категория. Разница между сетями и «магазином у дома» по одному и тому же набору "
             "доходит до 20–30%; 10% — осторожная оценка при сохранении привычного рациона.", "средняя", "средняя"),
    make_rec("Кофе и фастфуд", 25, "Сократить кофе и фастфуд на четверть",
             "Самая частая категория по количеству операций. Отказ от 1–2 покупок в неделю почти не меняет "
             "образ жизни, но экономит заметную сумму.", "высокая", "низкая"),
    make_rec("Доставка еды", 30, "Заменить часть доставки готовкой",
             "Средний чек доставки в несколько раз выше среднего чека продуктов. 30% заказов — реалистичная "
             "замена домашней едой.", "средняя", "средняя"),
    make_rec("Ставки и азартные игры", 100, "Разобраться с пополнениями ЦУПИС",
             "Платежи в НКО «Мобильная карта» — это единый ЦУПИС, через который пополняются счета "
             "букмекеров и казино. Это не покупка товара: деньги уходят без возврата. Проверьте, "
             "действительно ли эти траты вам нужны.", "средняя", "низкая"),
    make_rec("Кикшеринг", 25, "Меньше поездок на самокатах",
             "Очень много мелких поездок. Часть маршрутов в 1–2 км дешевле пройти пешком или проехать "
             "на общественном транспорте.", "средняя", "низкая"),
    make_rec("Маркетплейсы", 20, "Сократить импульсивные заказы",
             "Заказы с небольшим чеком и высокой частотой — типичный признак импульсивных покупок "
             "«на сдачу».", "средняя", "средняя"),
    make_rec("Табак", 100, "Отказ от табачных изделий",
             "Единственная категория, где полный отказ не ухудшает качество жизни, а расходы прекращаются "
             "полностью.", "высокая", "средняя"),
    make_rec("Такси и каршеринг", 20, "Сократить такси на 20%",
             "Поездки заметны в бюджете; часть можно заменить общественным транспортом.", "низкая", "низкая"),
    make_rec("Подписки и сервисы", 40, "Пересмотреть подписки",
             "Часть подписок могла стать неактуальной. Банковская выписка не доказывает, что сервис "
             "не используется, — это кандидаты на проверку.", "низкая", "низкая"),
    make_rec("Комиссии банка", 50, "Проверить банковские комиссии",
             "Платы за обслуживание и оповещения списываются регулярно; часть можно отключить.", "высокая", "низкая"),
    make_rec("Прочее", 10, "Разобрать нераспознанные траты",
             "Часть операций не удалось отнести к категории. Если отметить их вручную, точность остальных "
             "рекомендаций вырастет.", "низкая", "низкая"),
]
CONF_W = {"высокая": 1.0, "средняя": 0.88, "низкая": 0.72}
EFFORT_W = {"низкая": 1.0, "средняя": 0.95, "высокая": 0.85}
for r in recs:
    freq = min(1.0, r["cnt_year"] / 120.0)   # насколько проблема частая
    r["score"] = round(r["save_year"] * CONF_W[r["confidence"]] * EFFORT_W[r["effort"]] * (0.9 + 0.2 * freq), 2)
recs.sort(key=lambda r: -r["score"])
for i, r in enumerate(recs):
    r["rank"] = i + 1
    r["priority"] = "высокий" if i < 3 else ("средний" if i < 7 else "низкий")

# ---- автоматические находки -------------------------------------------------
def nf(x):
    return f"{round(x):,}".replace(",", " ") + " ₽"

def cs(n):
    return f"{int(round(n)):,}".replace(",", " ")

def pl(n, one, few, many):
    n = abs(int(round(n)))
    if n % 10 == 1 and n % 100 != 11: return one
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14: return few
    return many

insights = []
_br = [(b, v) for b, v in A["brands"].items()]
_by_total = sorted(_br, key=lambda kv: -kv[1]["total"])
_by_cnt = sorted(_br, key=lambda kv: -kv[1]["cnt"])

b, v = _by_cnt[0]
insights.append({
    "title": "Самая частая покупка",
    "text": f"«{b}» — {cs(v['cnt'])} {pl(v['cnt'], 'операция', 'операции', 'операций')} на {nf(v['total'])}, в среднем {nf(v['avg'])} за раз. "
            f"Это {cs(round(v['cnt'] / len(A['months'])))} {pl(round(v['cnt'] / len(A['months'])), 'покупка', 'покупки', 'покупок')} в месяц и {nf(v['per_month'])} ежемесячно.",
    "cat": v["cat"], "brand": b,
})

b, v = _by_total[0]
insights.append({
    "title": "Самая дорогая привычка",
    "text": f"«{b}» ({v['cat']}) — {nf(v['total'])} за {cs(v['cnt'])} {pl(v['cnt'], 'операцию', 'операции', 'операций')}, "
            f"{round(v['total'] / A['totals']['spend'] * 100, 1)}% всех расходов периода. "
            f"Средний чек {nf(v['avg'])}, медиана {nf(v['median'])}.",
    "cat": v["cat"], "brand": b,
})

sm = A["small"]
insights.append({
    "title": "Мелкие траты незаметно съедают пятую часть",
    "text": f"{cs(sm['cnt'])} {pl(sm['cnt'], 'покупка', 'покупки', 'покупок')} до {sm['limit']} ₽ на {nf(sm['total'])} — это {sm['share']:.1f}% всех расходов "
            f"и {nf(sm['per_year'])} в год. В среднем {round(sm['cnt_per_day'], 1)} таких покупок в день "
            f"по {nf(sm['avg'])}.",
    "cat": None, "brand": None,
})

_ev = [(c, A["categories"][c]) for c in CONSUMPTION if c in A["categories"]]
_ev = [(c, v) for c, v in _ev if v["cnt"] >= 30]
if _ev:
    c, v = max(_ev, key=lambda kv: kv[1]["avg"])
    c_prod = A["categories"].get("Продукты")
    cmp_txt = ""
    if c_prod and c_prod["cnt"]:
        cmp_txt = f" Это в {v['avg'] / c_prod['avg']:.1f} раза дороже средней покупки в «Продуктах»."
    insights.append({
        "title": "Самый дорогой средний чек",
        "text": f"«{c}» — {cs(v['cnt'])} {pl(v['cnt'], 'операция', 'операции', 'операций')} со средним чеком {nf(v['avg'])} и медианой {nf(v['median'])}.{cmp_txt}",
        "cat": c, "brand": None,
    })

_wd = sorted(A["weekday"], key=lambda x: -x["sum"])
if _wd and _wd[0]["sum"] > 0:
    w0, w1 = _wd[0], _wd[-1]
    insights.append({
        "title": "День недели с самыми большими тратами",
        "text": f"Больше всего денег уходит в {w0['wd']} ({nf(w0['sum'])}), меньше всего — в {w1['wd']} "
                f"({nf(w1['sum'])}). Разница {w0['sum'] / max(w1['sum'], 1):.1f} раза.",
        "cat": None, "brand": None,
    })

_h = [x for x in A["hours"] if x["sum"] > 0]
if _h:
    hours_sorted = sorted(_h, key=lambda x: -x["sum"])
    h0 = hours_sorted[0]
    late = sum(x["sum"] for x in _h if x["h"] >= 22 or x["h"] < 5)
    insights.append({
        "title": "Время суток",
        "text": f"Пик трат — {h0['h']:02d}:00 ({nf(h0['sum'])}). После 22:00 ушло {nf(late)} — "
                f"{late / A['totals']['spend'] * 100:.1f}% всех расходов.",
        "cat": None, "brand": None,
    })

_grow = [x for x in A["brand_trend"]
         if x["first"] >= 3000 and x["second"] >= 15000 and (x["pct"] or 0) > 0]
if _grow:
    x = max(_grow, key=lambda r: r["pct"])
    _bi = A["brands"].get(x["brand"], {})
    insights.append({
        "title": "Быстрее всего растут траты здесь",
        "text": f"«{x['brand']}»: {nf(x['first'])} в первой половине периода → {nf(x['second'])} во второй "
                f"(+{x['pct']:.0f}%). Всего {nf(_bi.get('total', 0))} за {cs(_bi.get('cnt', 0))} {pl(_bi.get('cnt', 0), 'операцию', 'операции', 'операций')}.",
        "cat": x.get("cat"), "brand": x["brand"],
    })

if recs:
    top = recs[0]
    insights.append({
        "title": "Главный резерв экономии",
        "text": f"«{top['title']}» — до {nf(top['save_year'])} в год. Основание: {cs(top['cnt_year'])} {pl(top['cnt_year'], 'операция', 'операции', 'операций')} "
                f"на {nf(top['base_year'])} в год, предлагаемое сокращение {top['pct']}%. "
                f"Достоверность: {top['confidence']}.",
        "cat": top["cat"], "brand": None,
    })

# сценарии: годовые базы по категориям
scen = {c: {"year": round(A["categories"][c]["per_year"], 2),
            "month": round(A["categories"][c]["per_month"], 2),
            "cnt": A["categories"][c]["cnt"]} for c in CONSUMPTION}

# ---- сведения об источниках (карта и дата первой операции) -------------------
CARDS, SRC_FROM = {}, {}
for _src, _path in (("tb", "transactions.json"), ("sber", "sber_transactions.json")):
    if not os.path.exists(_path):
        continue
    try:
        _rows = json.load(open(_path, encoding="utf-8"))
    except Exception:
        continue
    for _r in _rows:
        if _r.get("card"):
            CARDS[_src] = _r["card"]
            break
    _dates = sorted(_r["op_date"][6:10] + "-" + _r["op_date"][3:5] + "-" + _r["op_date"][0:2]
                    for _r in _rows if _r.get("op_date"))
    if _dates:
        SRC_FROM[_src] = _dates[0]

# ---- упаковка ---------------------------------------------------------------
tx_rows = []
for t in TXS:
    tx_rows.append([t["iso"], t["h"], t["min"], round(t["a"], 2), t["b"], CAT[t["c"]], t["k"], t["desc"],
                   0 if t["src"] == "tb" else 1])

data = {
    "meta": {
        "period": [TXS[-1]["iso"], TXS[0]["iso"]],
        "active": [ACTIVE_START, ACTIVE_END],
        "months_all": ALL_MONTHS,
        "months_active": ACTIVE_MONTHS_LIST,
        "categories": CATS, "spend_cats": SPEND_CATS, "consumption": CONSUMPTION,
        "tx_count": len(TXS),
        "sources": [
            {"id": "tb", "name": "Т-Банк", "card": CARDS.get("tb", ""),
             "count": sum(1 for t in TXS if t["src"] == "tb"),
             "from": SRC_FROM.get("tb", "")},
            {"id": "sber", "name": "Сбер", "card": CARDS.get("sber", ""),
             "count": sum(1 for t in TXS if t["src"] == "sber"),
             "from": SRC_FROM.get("sber", "")},
        ],
        "src_from": SRC_FROM,
        "days_all": FULL_DAYS, "days_active": ACTIVE_DAYS,
    },
    "tx": tx_rows,
    "full": full,
    "active": active,
    "profile": profile,
    "recs": recs, "insights": insights,
    "scenarios": scen,
    "years": {},
}

# по годам (весь период)
years = ["2020", "2021", "2022", "2023", "2024", "2025", "2026"]
data["years"] = {}
for yy in years:
    ms = [mm for mm in ALL_MONTHS if mm.startswith(yy)]
    sub = [t for t in TXS if t["iso"].startswith(yy)]
    data["years"][yy] = {
        "spend": round(sum(-t["a"] for t in sub if t["k"] in ("purchase", "fee") and t["a"] < 0), 2),
        "income": round(sum(t["a"] for t in sub if t["a"] > 0 and t["k"] in ("in_in", "salary", "bonus", "cashback", "interest")), 2),
        "invest": round(sum(-t["a"] for t in sub if t["k"] in ("invest_out", "invest_in")), 2),
        "p2p": round(sum(-t["a"] for t in sub if t["k"] in ("p2p", "ext_bank")), 2),
        "cash": round(sum(-t["a"] for t in sub if t["k"] == "cash_out"), 2),
        "cnt": sum(1 for t in sub if t["k"] in ("purchase", "fee")),
        "months": ms,
    }

os.makedirs(BASE + r"\app\data", exist_ok=True)
with open(BASE + r"\app\data\data.js", "w", encoding="utf-8") as f:
    f.write("window.FIN=")
    json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")

rep = []
rep.append(f"ACTIVE: {ACTIVE_START}..{ACTIVE_END}, spend {A['totals']['spend']:,.0f}, cnt {A['totals']['cnt']}, "
           f"per year {A['totals']['per_year']:,.0f}, per month {A['totals']['per_month']:,.0f}")
rep.append(f"FULL: spend {full['totals']['spend']:,.0f}, cnt {full['totals']['cnt']}, per year {full['totals']['per_year']:,.0f}")
rep.append(f"anomalies active: {len(A['anomalies'])}, dups: {len(A['dups'])}, recurring: {len(A['recurring'])}, "
           f"small: {A['small']['total']:,.0f} ({A['small']['cnt']})")
rep.append(f"profile: regular {profile['regular_share']}%, hhi {profile['hhi']}, cv {profile['stability_cv']}, top10 {profile['top10_share']}%")
rep.append("top brands:")
for b, v in sorted(A["brands"].items(), key=lambda kv: -kv[1]["total"])[:15]:
    rep.append(f"  {b[:32]:34s} {v['total']:10,.0f} {v['cnt']:4d} ср {v['avg']:8,.0f} gap {v['gap_med']}")
rep.append("recs:")
for r in recs:
    rep.append(f"  {r['title'][:44]:46s} {r['save_month']:8,.0f}/мес {r['save_year']:10,.0f}/год {r['confidence']}")
rep.append("anomaly sample:")
for a in A["anomalies"][:10]:
    rep.append(f"  {a['date']} {a['amount']:9,.0f} {a['brand'][:30]} {a['cat']} z={a['score']}")
open(BASE + r"\build_report.txt", "w", encoding="utf-8").write("\n".join(rep))
print("ok", os.path.getsize(BASE + r"\app\data\data.js"))
