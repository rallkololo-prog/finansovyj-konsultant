import re, zlib, sys

PATH = r"C:\Users\geo\Downloads\Dokument.pdf"
OUT = r"C:\Users\geo\Desktop\Cloude\Moi rascheti\dokument.txt"
data = open(PATH, "rb").read()

objs = {}
for m in re.finditer(rb"(?<![0-9])(\d+)\s+(\d+)\s+obj\b", data):
    num = int(m.group(1))
    start = m.end()
    e = data.find(b"endobj", start)
    if e >= 0:
        objs[num] = data[start:e]

def stream_bytes(body):
    i = body.find(b"stream")
    if i < 0:
        return None
    j = i + 6
    if body[j:j + 2] == b"\r\n":
        j += 2
    elif body[j:j + 1] in (b"\n", b"\r"):
        j += 1
    k = body.rfind(b"endstream")
    if k < 0:
        return None
    raw = body[j:k]
    if b"FlateDecode" in body[:i]:
        try:
            return zlib.decompress(raw)
        except Exception:
            return None
    return raw

def ref(b, key, pos=0):
    m = re.search(rb"/" + key + rb"\s+(\d+)\s+\d+\s+R", b[pos:])
    return int(m.group(1)) if m else None

# ---------- page order ----------
def walk(num, out, depth=0):
    if depth > 40:
        return
    b = objs.get(num)
    if not b:
        return
    if re.search(rb"/Type\s*/Pages", b):
        km = re.search(rb"/Kids\s*\[(.*?)\]", b, re.S)
        if km:
            for m in re.finditer(rb"(\d+)\s+\d+\s+R", km.group(1)):
                walk(int(m.group(1)), out, depth + 1)
    elif re.search(rb"/Type\s*/Page[^s]", b):
        out.append(num)

cat = next((n for n, b in objs.items() if re.search(rb"/Type\s*/Catalog", b)), None)
pages = []
if cat is not None:
    root = ref(objs[cat], b"Pages")
    if root:
        walk(root, pages)
if not pages:
    pages = sorted(n for n, b in objs.items() if re.search(rb"/Type\s*/Page[^s]", b))

# ---------- CMap ----------
def parse_cmap(b):
    s = b.decode("latin-1")
    cmap = {}
    for blk in re.findall(r"beginbfchar(.*?)endbfchar", s, re.S):
        for src, dst in re.findall(r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>", blk):
            try:
                cmap[int(src, 16)] = bytes.fromhex(dst).decode("utf-16-be", "replace")
            except Exception:
                pass
    for blk in re.findall(r"beginbfrange(.*?)endbfrange", s, re.S):
        for lo, hi, dst in re.findall(r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", blk):
            try:
                a, z, base = int(lo, 16), int(hi, 16), int(dst, 16)
                for c in range(a, min(z, a + 4095) + 1):
                    cmap[c] = chr(base + (c - a))
            except Exception:
                pass
        for lo, hi, arr in re.findall(r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[(.*?)\]", blk, re.S):
            try:
                a = int(lo, 16)
                for i, it in enumerate(re.findall(r"<([0-9A-Fa-f]*)>", arr)):
                    cmap[a + i] = bytes.fromhex(it).decode("utf-16-be", "replace")
            except Exception:
                pass
    return cmap

_fc = {}
def font_info(fnum):
    if fnum in _fc:
        return _fc[fnum]
    b = objs.get(fnum, b"")
    info = {"cmap": {}, "w": {}, "dw": 1000.0, "two": b"/Type0" in b or b"Identity-H" in b}
    tu = ref(b, b"ToUnicode")
    if tu and tu in objs:
        sb = stream_bytes(objs[tu])
        if sb:
            info["cmap"] = parse_cmap(sb)
    dm = re.search(rb"/DescendantFonts\s*\[\s*(\d+)\s+\d+\s+R", b)
    if dm:
        db = objs.get(int(dm.group(1)), b"")
        dwm = re.search(rb"/DW\s+(-?\d+(?:\.\d+)?)", db)
        if dwm:
            info["dw"] = float(dwm.group(1))
        wm = re.search(rb"/W\s*\[(.*?)\]\s*(?:/|>>)", db, re.S)
        if wm:
            txt = wm.group(1)
            seq = []
            for arr, num in re.findall(rb"\[([^\]]*)\]|(-?\d+(?:\.\d+)?)", txt):
                if arr:
                    seq.append([float(x) for x in arr.split()])
                elif num:
                    seq.append(float(num))
            i = 0
            while i < len(seq):
                if i + 1 < len(seq) and isinstance(seq[i + 1], list):
                    c = int(seq[i])
                    for k, w in enumerate(seq[i + 1]):
                        info["w"][c + k] = w
                    i += 2
                elif i + 2 < len(seq):
                    a, z, w = int(seq[i]), int(seq[i + 1]), seq[i + 2]
                    for c in range(a, min(z, a + 4095) + 1):
                        info["w"][c] = w
                    i += 3
                else:
                    break
    _fc[fnum] = info
    return info

def decode_str(raw, fi):
    if fi["two"]:
        codes = [int.from_bytes(raw[k:k + 2], "big") for k in range(0, len(raw) - 1, 2)]
    else:
        codes = list(raw)
    txt, wid = [], 0.0
    for c in codes:
        txt.append(fi["cmap"].get(c, ""))
        wid += fi["w"].get(c, fi["dw"]) / 1000.0
    return "".join(txt), wid

# ---------- tokenizer ----------
def tokenize(s):
    out = []
    i, n = 0, len(s)
    while i < n:
        ch = s[i]
        if ch in b" \t\r\n\f\x00":
            i += 1
            continue
        if ch == 0x25:
            j = s.find(b"\n", i)
            i = n if j < 0 else j + 1
            continue
        if ch == 0x28:
            depth, j = 1, i + 1
            buf = bytearray()
            while j < n:
                c = s[j]
                if c == 0x5C:
                    nx = s[j + 1] if j + 1 < n else 0
                    if nx in b"01234567":
                        k, oct_ = j + 1, b""
                        while k < n and len(oct_) < 3 and s[k:k + 1] in b"01234567":
                            oct_ += s[k:k + 1]
                            k += 1
                        buf.append(int(oct_, 8) & 0xFF)
                        j = k
                        continue
                    buf.append({0x6E: 10, 0x72: 13, 0x74: 9, 0x62: 8, 0x66: 12}.get(nx, nx))
                    j += 2
                    continue
                if c == 0x28:
                    depth += 1
                elif c == 0x29:
                    depth -= 1
                    if depth == 0:
                        j += 1
                        break
                buf.append(c)
                j += 1
            out.append(("str", bytes(buf)))
            i = j
            continue
        if ch == 0x3C:
            if i + 1 < n and s[i + 1] == 0x3C:
                out.append(("op", b"<<"))
                i += 2
                continue
            j = s.find(b">", i)
            if j < 0:
                break
            hx = re.sub(rb"[^0-9A-Fa-f]", b"", s[i + 1:j])
            if len(hx) % 2:
                hx += b"0"
            out.append(("str", bytes.fromhex(hx.decode("ascii"))))
            i = j + 1
            continue
        if ch == 0x3E and i + 1 < n and s[i + 1] == 0x3E:
            out.append(("op", b">>"))
            i += 2
            continue
        if ch == 0x5B:
            out.append(("op", b"["))
            i += 1
            continue
        if ch == 0x5D:
            out.append(("op", b"]"))
            i += 1
            continue
        if ch == 0x2F:
            m = re.match(rb"/([^\s\[\]<>()/%{}]*)", s[i:])
            if m:
                out.append(("name", m.group(1)))
                i += len(m.group(0))
                continue
        m = re.match(rb"[+-]?(\d+\.?\d*|\.\d+)", s[i:])
        if m:
            out.append(("num", float(m.group(0))))
            i += len(m.group(0))
            continue
        m = re.match(rb"[A-Za-z'\"*][A-Za-z0-9'\"*]*", s[i:])
        if m:
            out.append(("op", m.group(0)))
            i += len(m.group(0))
            continue
        i += 1
    return out

def mul(a, b):
    return [
        a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
        a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
        a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
    ]

def page_text(pnum):
    body = objs[pnum]
    res = body
    rm = re.search(rb"/Resources\s*(\d+)\s+\d+\s+R", body)
    if rm:
        res = objs.get(int(rm.group(1)), body)
    fonts = {}
    fm = re.search(rb"/Font\s*<<(.*?)>>", res, re.S)
    if fm:
        for name, num in re.findall(rb"/(\w+)\s+(\d+)\s+\d+\s+R", fm.group(1)):
            fonts[name.decode()] = font_info(int(num))
    contents = []
    cm1 = re.search(rb"/Contents\s*(\d+)\s+\d+\s+R", body)
    if cm1:
        contents = [int(cm1.group(1))]
    else:
        cm2 = re.search(rb"/Contents\s*\[(.*?)\]", body, re.S)
        if cm2:
            contents = [int(x) for x in re.findall(rb"(\d+)\s+\d+\s+R", cm2.group(1))]
    runs = []
    for cnum in contents:
        sb = stream_bytes(objs.get(cnum, b""))
        if not sb:
            continue
        stack = []
        LIST = None
        ctm = [1, 0, 0, 1, 0, 0]
        tm = [1, 0, 0, 1, 0, 0]
        tlm = [1, 0, 0, 1, 0, 0]
        gstack = []
        leading = 0.0
        cur = None
        for kind, val in tokenize(sb):
            if kind in ("num", "str", "name"):
                stack.append((kind, val))
                continue
            op = val
            if op == b"[":
                stack.append(("mark", None))
                continue
            if op == b"]":
                items = []
                while stack and stack[-1][0] != "mark":
                    items.append(stack.pop())
                if stack:
                    stack.pop()
                items.reverse()
                stack.append(("arr", items))
                continue
            try:
                if op == b"BT":
                    tm = [1, 0, 0, 1, 0, 0]
                    tlm = [1, 0, 0, 1, 0, 0]
                elif op == b"Tf":
                    if len(stack) >= 2 and stack[-2][0] == "name":
                        cur = fonts.get(stack[-2][1].decode())
                elif op == b"TL":
                    if stack:
                        leading = stack[-1][1]
                elif op in (b"Td", b"TD"):
                    if len(stack) >= 2:
                        tx, ty = stack[-2][1], stack[-1][1]
                        if op == b"TD":
                            leading = -ty
                        tlm = mul([1, 0, 0, 1, tx, ty], tlm)
                        tm = list(tlm)
                elif op == b"Tm":
                    if len(stack) >= 6:
                        tlm = [v for _k, v in stack[-6:]]
                        tm = list(tlm)
                elif op == b"T*":
                    tlm = mul([1, 0, 0, 1, 0, -leading], tlm)
                    tm = list(tlm)
                elif op == b"cm":
                    if len(stack) >= 6:
                        ctm = mul([v for _k, v in stack[-6:]], ctm)
                elif op == b"q":
                    gstack.append(list(ctm))
                elif op == b"Q":
                    if gstack:
                        ctm = gstack.pop()
                elif op in (b"Tj", b"'", b'"'):
                    if op != b"Tj":
                        tlm = mul([1, 0, 0, 1, 0, -leading], tlm)
                        tm = list(tlm)
                    if stack and cur is not None and stack[-1][0] == "str":
                        s_, w_ = decode_str(stack[-1][1], cur)
                        m = mul(tm, ctm)
                        sc = tm[0] if tm[0] else 1.0
                        runs.append((m[4], m[5], s_, w_ * sc))
                        tm = mul([1, 0, 0, 1, w_ * sc, 0], tm)
                elif op == b"TJ":
                    if stack and cur is not None and stack[-1][0] == "arr":
                        acc, adv = [], 0.0
                        sc = tm[0] if tm[0] else 1.0
                        for k, v in stack[-1][1]:
                            if k == "str":
                                s_, w_ = decode_str(v, cur)
                                acc.append(s_)
                                adv += w_ * sc
                            elif k == "num":
                                adv -= v / 1000.0 * sc
                        m = mul(tm, ctm)
                        runs.append((m[4], m[5], "".join(acc), adv))
                        tm = mul([1, 0, 0, 1, adv / sc, 0], tm)
            except Exception:
                pass
            stack = []
    runs.sort(key=lambda r: (-round(r[1], 1), r[0]))
    lines, curline, last_y = [], [], None
    for x, y, s_, w_ in runs:
        if not s_:
            continue
        if last_y is None or abs(y - last_y) > 4.0:
            if curline:
                lines.append(curline)
            curline = []
            last_y = y
        curline.append((x, y, s_, w_))
    if curline:
        lines.append(curline)
    out = []
    for ln in lines:
        ln.sort(key=lambda t: t[0])
        buf, prev_end = "", None
        for x, y, s_, w_ in ln:
            if prev_end is not None:
                gap = x - prev_end
                if gap > 1.5 and not buf.endswith(" "):
                    buf += " "
            buf += s_
            prev_end = x + w_
        out.append(buf.rstrip())
    return "\n".join(out)

res = []
for i, p in enumerate(pages, 1):
    try:
        t = page_text(p)
    except Exception as ex:
        t = "[[ERROR %r]]" % (ex,)
    res.append("===== PAGE %d =====\n%s" % (i, t))
txt = "\n".join(res)
open(OUT, "w", encoding="utf-8").write(txt)
print("pages:", len(pages), "chars:", len(txt))
print(txt[:2500])
