import json, re
from collections import Counter

RUNS = r"C:\Users\geo\Desktop\Cloude\Moi rascheti\runs.json"
OUT = r"C:\Users\geo\Desktop\Cloude\Moi rascheti\transactions.json"
runs = json.load(open(RUNS, encoding="utf-8"))

# group by page, then by y
by_page = {}
for z in runs:
    by_page.setdefault(z["p"], []).append(z)

def bucket(x):
    if x < 120: return 0
    if x < 195: return 1
    if x < 290: return 2
    if x < 385: return 3
    if x < 495: return 4
    return 5

DATE = re.compile(r"^\d{2}\.\d{2}\.\d{4}$")
TIME = re.compile(r"^\d{2}:\d{2}$")

txs = []
skipped = []
for page in sorted(by_page):
    rows = {}
    for z in by_page[page]:
        rows.setdefault(round(z["y"], 1), []).append(z)
    lines = []
    for y in sorted(rows, reverse=True):
        cells = {i: [] for i in range(6)}
        for z in sorted(rows[y], key=lambda r: r["x"]):
            cells[bucket(z["x"])].append(z["t"])
        lines.append((y, {k: "".join(v).strip() for k, v in cells.items()}))

    cur = None
    for y, c in lines:
        c0 = c[0]
        if DATE.match(c0):
            if cur:
                txs.append(cur)
            cur = {"page": page, "op_date": c0, "op_time": "", "post_date": c[1],
                   "post_time": "", "amount": c[2], "amount_rub": c[3],
                   "desc": c[4], "card": c[5]}
        elif cur is not None:
            if TIME.match(c0) and not cur["op_time"]:
                cur["op_time"] = c0
            if TIME.match(c[1]) and not cur["post_time"]:
                cur["post_time"] = c[1]
            if c[4]:
                cur["desc"] = (cur["desc"] + " " + c[4]).strip()
            if c[2] and not cur["amount"]:
                cur["amount"] = c[2]
            if c[3] and not cur["amount_rub"]:
                cur["amount_rub"] = c[3]
            if c[5] and not cur["card"]:
                cur["card"] = c[5]
    if cur:
        txs.append(cur)

print("tx rows:", len(txs))

def num(s):
    s = s.replace("\u00a0", "").replace("\u202f", "").replace(" ", "").replace("₽", "")
    s = s.replace("$", "").replace("€", "")
    s = s.replace(",", ".")
    m = re.search(r"[-+]?\d+(?:\.\d+)?", s)
    return float(m.group(0)) if m else None

bad = []
total = 0.0
for t in txs:
    t["amount_v"] = num(t["amount"])
    t["rub_v"] = num(t["amount_rub"])
    if t["amount_v"] is None or t["rub_v"] is None:
        bad.append(t)
        continue
    total += t["rub_v"]

print("bad rows:", len(bad))
for b in bad[:5]:
    print("  ", b)
print("sum rub:", round(total, 2))
print("currencies:", Counter("$" in t["amount"] and "$" or ("₽" in t["amount"] and "RUB" or "?") for t in txs))
json.dump(txs, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("saved", OUT)
