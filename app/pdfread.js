/* pdfread.js — чтение PDF целиком в браузере (и в Node для проверки).
   Возвращает страницы с позиционированными текстовыми фрагментами:
   [{ p: 1, runs: [{ x, y, sx, sy, t }, ...] }, ...]
   Работает на DecompressionStream('deflate') — без внешних библиотек. */
(function (g) {
  "use strict";

  function latin1(u8) {
    let out = "", CH = 0x8000;
    for (let i = 0; i < u8.length; i += CH) {
      out += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    }
    return out;
  }
  function bytesOf(str) {
    const a = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) a[i] = str.charCodeAt(i) & 0xff;
    return a;
  }
  async function inflate(u8, raw) {
    const ds = new g.DecompressionStream(raw ? "deflate-raw" : "deflate");
    const writer = ds.writable.getWriter();
    writer.write(u8); writer.close();
    const buf = await new Response(ds.readable).arrayBuffer();
    return new Uint8Array(buf);
  }

  function parseAmount(s) {
    const m = /[-+]?\d+(?:\.\d+)?/.exec(s);
    return m ? parseFloat(m[0]) : null;
  }

  async function read(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const src = latin1(bytes);
    const objs = new Map();          // num -> строка тела объекта
    const streams = new Map();       // num -> Uint8Array (распакованный stream)

    // 1. все объекты
    const re = /(?<![0-9])(\d+)\s+(\d+)\s+obj\b/g;
    let m;
    while ((m = re.exec(src))) {
      const num = parseInt(m[1], 10);
      const start = re.lastIndex;
      const end = src.indexOf("endobj", start);
      if (end < 0) continue;
      objs.set(num, src.slice(start, end));
    }

    // 2. распаковка всех потоков
    for (const [num, body] of objs) {
      const i = body.indexOf("stream");
      if (i < 0) continue;
      let j = i + 6;
      if (body[j] === "\r" && body[j + 1] === "\n") j += 2;
      else if (body[j] === "\n" || body[j] === "\r") j += 1;
      const k = body.lastIndexOf("endstream");
      if (k < 0 || k <= j) continue;
      const head = body.slice(0, i);
      let slice = body.slice(j, k);
      const lm = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(head);
      if (lm) {
        const L = parseInt(lm[1], 10);
        if (L > 0 && L <= slice.length) slice = slice.slice(0, L);
      } else {
        while (slice.length && (slice.charCodeAt(slice.length - 1) === 10 || slice.charCodeAt(slice.length - 1) === 13 || slice.charCodeAt(slice.length - 1) === 32)) slice = slice.slice(0, -1);
      }
      const raw = bytesOf(slice);
      if (/FlateDecode/.test(head)) {
        try { streams.set(num, await inflate(raw, false)); }
        catch (e) {
          try { streams.set(num, await inflate(raw, true)); }
          catch (e2) { streams.set(num, raw); }
        }
      } else {
        streams.set(num, raw);
      }
    }

    // 3. объекты внутри /ObjStm
    const extra = [];
    for (const [num, body] of objs) {
      if (body.indexOf("/ObjStm") < 0) continue;
      const sb = streams.get(num);
      if (!sb) continue;
      const mn = /\/N\s+(\d+)/.exec(body), mf = /\/First\s+(\d+)/.exec(body);
      if (!mn || !mf) continue;
      const N = parseInt(mn[1], 10), first = parseInt(mf[1], 10);
      const text = latin1(sb);
      const hdr = text.slice(0, first).trim().split(/\s+/).map(Number);
      const pairs = [];
      for (let i = 0; i < Math.min(hdr.length, 2 * N); i += 2) pairs.push([hdr[i], hdr[i + 1]]);
      pairs.forEach((pair, idx) => {
        const start = first + pair[1];
        const end = idx + 1 < pairs.length ? first + pairs[idx + 1][1] : text.length;
        if (!objs.has(pair[0])) extra.push([pair[0], text.slice(start, end)]);
      });
    }
    extra.forEach(([n, b]) => objs.set(n, b));

    // 4. страницы
    function refNum(body, key) {
      const r = new RegExp("/" + key + "\\s+(\\d+)\\s+\\d+\\s+R").exec(body);
      return r ? parseInt(r[1], 10) : null;
    }
    const pages = [];
    function walk(num, depth) {
      if (depth > 40 || num == null) return;
      const b = objs.get(num);
      if (!b) return;
      if (/\/Type\s*\/Page[^s]/.test(b)) { pages.push(num); return; }
      if (/\/Type\s*\/Pages/.test(b)) {
        const km = /\/Kids\s*\[(.*?)\]/s.exec(b);
        if (km) {
          const rr = /(\d+)\s+\d+\s+R/g;
          let k;
          while ((k = rr.exec(km[1]))) walk(parseInt(k[1], 10), depth + 1);
        }
      }
    }
    let cat = null;
    for (const [num, b] of objs) if (/\/Type\s*\/Catalog/.test(b)) { cat = num; break; }
    if (cat) walk(refNum(objs.get(cat), "Pages"), 0);
    if (!pages.length) {
      for (const [num, b] of objs) if (/\/Type\s*\/Page[^s]/.test(b)) pages.push(num);
    }

    // 5. шрифты и CMap
    function parseCMap(sb) {
      const s = latin1(sb), cmap = new Map();
      let blk;
      const reChar = /beginbfchar([\s\S]*?)endbfchar/g;
      while ((blk = reChar.exec(s))) {
        const rr = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g;
        let p;
        while ((p = rr.exec(blk[1]))) {
          try { cmap.set(parseInt(p[1], 16), utf16be(p[2])); } catch (e) { }
        }
      }
      const reRange = /beginbfrange([\s\S]*?)endbfrange/g;
      while ((blk = reRange.exec(s))) {
        const rr = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
        let p;
        while ((p = rr.exec(blk[1]))) {
          const a = parseInt(p[1], 16), z = parseInt(p[2], 16), base = parseInt(p[3], 16);
          for (let c = a; c <= Math.min(z, a + 4095); c++) cmap.set(c, String.fromCodePoint(base + (c - a)));
        }
      }
      return cmap;
    }
    function utf16be(hex) {
      let out = "";
      for (let i = 0; i + 3 < hex.length + 1; i += 4) {
        const code = parseInt(hex.slice(i, i + 4), 16);
        if (!isNaN(code)) out += String.fromCharCode(code);
      }
      return out;
    }

    const fontCache = new Map();
    function fontInfo(fnum) {
      if (fontCache.has(fnum)) return fontCache.get(fnum);
      const b = objs.get(fnum) || "";
      const info = { cmap: new Map(), w: new Map(), dw: 1000, two: /\/Type0/.test(b) };
      const tu = refNum(b, "ToUnicode");
      if (tu != null && streams.has(tu)) info.cmap = parseCMap(streams.get(tu));
      const dm = /\/DescendantFonts\s*\[\s*(\d+)\s+\d+\s+R/.exec(b);
      if (dm) {
        const db = objs.get(parseInt(dm[1], 10)) || "";
        const dwm = /\/DW\s+(-?\d+(?:\.\d+)?)/.exec(db);
        if (dwm) info.dw = parseFloat(dwm[1]);
        const wm = /\/W\s*\[([\s\S]*?)\]\s*(?:\/|>>)/.exec(db);
        if (wm) {
          const txt = wm[1];
          const seq = [];
          const rr = /\[([^\]]*)\]|(-?\d+(?:\.\d+)?)/g;
          let p;
          while ((p = rr.exec(txt))) {
            if (p[1] != null) seq.push(p[1].trim().split(/\s+/).filter(Boolean).map(Number));
            else if (p[2] != null) seq.push(parseFloat(p[2]));
          }
          let i = 0;
          while (i < seq.length) {
            if (i + 1 < seq.length && Array.isArray(seq[i + 1])) {
              const c = seq[i] | 0;
              seq[i + 1].forEach((w, k) => info.w.set(c + k, w));
              i += 2;
            } else if (i + 2 < seq.length) {
              const a = seq[i] | 0, z = seq[i + 1] | 0, w = seq[i + 2];
              for (let c = a; c <= Math.min(z, a + 4095); c++) info.w.set(c, w);
              i += 3;
            } else break;
          }
        }
      }
      fontCache.set(fnum, info);
      return info;
    }

    function decodeStr(raw, fi) {
      const codes = [];
      if (fi.two) { for (let i = 0; i + 1 < raw.length; i += 2) codes.push((raw[i] << 8) | raw[i + 1]); }
      else { for (let i = 0; i < raw.length; i++) codes.push(raw[i]); }
      let out = "", wid = 0;
      for (const c of codes) {
        out += fi.cmap.get(c) || "";
        wid += (fi.w.has(c) ? fi.w.get(c) : fi.dw) / 1000;
      }
      return [out, wid];
    }

    // 6. токенизатор контент-потока (по байтам latin1-строки)
    function tokenize(s) {
      const out = [];
      let i = 0;
      const n = s.length;
      while (i < n) {
        const ch = s.charCodeAt(i);
        if (ch === 32 || ch === 9 || ch === 13 || ch === 10 || ch === 12 || ch === 0) { i++; continue; }
        if (ch === 37) { const j = s.indexOf("\n", i); i = j < 0 ? n : j + 1; continue; }
        if (ch === 40) {
          let depth = 1, j = i + 1;
          const buf = [];
          while (j < n) {
            const c = s.charCodeAt(j);
            if (c === 92) {
              const nx = s.charCodeAt(j + 1);
              if (nx >= 48 && nx <= 55) {
                let k = j + 1, oc = "";
                while (k < n && oc.length < 3 && s.charCodeAt(k) >= 48 && s.charCodeAt(k) <= 55) {
                  oc += s[k]; k++;
                }
                buf.push(parseInt(oc, 8) & 0xff); j = k; continue;
              }
              const map = { 110: 10, 114: 13, 116: 9, 98: 8, 102: 12 };
              buf.push(map[nx] != null ? map[nx] : nx); j += 2; continue;
            }
            if (c === 40) depth++;
            else if (c === 41) { depth--; if (depth === 0) { j++; break; } }
            buf.push(c); j++;
          }
          out.push(["str", Uint8Array.from(buf)]); i = j; continue;
        }
        if (ch === 60) {
          if (s.charCodeAt(i + 1) === 60) { out.push(["op", "<<"]); i += 2; continue; }
          const j = s.indexOf(">", i);
          if (j < 0) break;
          let hx = s.slice(i + 1, j).replace(/[^0-9A-Fa-f]/g, "");
          if (hx.length % 2) hx += "0";
          out.push(["str", hexBytes(hx)]); i = j + 1; continue;
        }
        if (ch === 62 && s.charCodeAt(i + 1) === 62) { out.push(["op", ">>"]); i += 2; continue; }
        if (ch === 91) { out.push(["op", "["]); i++; continue; }
        if (ch === 93) { out.push(["op", "]"]); i++; continue; }
        if (ch === 47) {
          const mm = /^\/([^\s\[\]<>()\/%{}]*)/.exec(s.slice(i, i + 200));
          if (mm) { out.push(["name", mm[1]]); i += mm[0].length; continue; }
        }
        const mn = /^[+-]?(\d+\.?\d*|\.\d+)/.exec(s.slice(i, i + 60));
        if (mn) { out.push(["num", parseFloat(mn[0])]); i += mn[0].length; continue; }
        const mo = /^[A-Za-z'"*][A-Za-z0-9'"*]*/.exec(s.slice(i, i + 40));
        if (mo) { out.push(["op", mo[0]]); i += mo[0].length; continue; }
        i++;
      }
      return out;
    }
    function hexBytes(hx) {
      const a = new Uint8Array(hx.length / 2);
      for (let i = 0; i < a.length; i++) a[i] = parseInt(hx.substr(i * 2, 2), 16);
      return a;
    }

    function mul(a, b) {
      return [
        a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
        a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
        a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
      ];
    }

    // 7. страница → фрагменты
    function pageRuns(pnum) {
      const body = objs.get(pnum) || "";
      let res = body;
      const rm = /\/Resources\s+(\d+)\s+\d+\s+R/.exec(body);
      if (rm) res = objs.get(parseInt(rm[1], 10)) || body;

      const fonts = new Map();
      const fm = /\/Font\s*<<([\s\S]*?)>>/.exec(res);
      if (fm) {
        const rr = /\/(\w+)\s+(\d+)\s+\d+\s+R/g;
        let p;
        while ((p = rr.exec(fm[1]))) fonts.set(p[1], fontInfo(parseInt(p[2], 10)));
      }

      const contents = [];
      const c1 = /\/Contents\s+(\d+)\s+\d+\s+R/.exec(body);
      if (c1) contents.push(parseInt(c1[1], 10));
      else {
        const c2 = /\/Contents\s*\[([\s\S]*?)\]/.exec(body);
        if (c2) {
          const rr = /(\d+)\s+\d+\s+R/g;
          let p;
          while ((p = rr.exec(c2[1]))) contents.push(parseInt(p[1], 10));
        }
      }

      const runs = [];
      for (const cnum of contents) {
        const sb = streams.get(cnum);
        if (!sb) continue;
        const text = latin1(sb);
        let stack = [], ctm = [1, 0, 0, 1, 0, 0], tm = [1, 0, 0, 1, 0, 0], tlm = [1, 0, 0, 1, 0, 0], gs = [];
        let leading = 0, cur = null;

        const toks = tokenize(text);
        for (const [kind, val] of toks) {
          if (kind !== "op") { stack.push([kind, val]); continue; }
          const op = val;
          if (op === "[") { stack.push(["mark", null]); continue; }
          if (op === "]") {
            const items = [];
            while (stack.length && stack[stack.length - 1][0] !== "mark") items.push(stack.pop());
            if (stack.length) stack.pop();
            items.reverse();
            stack.push(["arr", items]);
            continue;
          }
          if (op === "BT") { tm = [1, 0, 0, 1, 0, 0]; tlm = [1, 0, 0, 1, 0, 0]; }
          else if (op === "Tf") {
            if (stack.length >= 2 && stack[stack.length - 2][0] === "name") cur = fonts.get(stack[stack.length - 2][1]) || null;
          }
          else if (op === "TL") { if (stack.length) leading = stack[stack.length - 1][1]; }
          else if (op === "Td" || op === "TD") {
            if (stack.length >= 2) {
              const tx = stack[stack.length - 2][1], ty = stack[stack.length - 1][1];
              if (op === "TD") leading = -ty;
              tlm = mul([1, 0, 0, 1, tx, ty], tlm); tm = tlm.slice();
            }
          }
          else if (op === "Tm") {
            if (stack.length >= 6) {
              tlm = stack.slice(-6).map(x => x[1]); tm = tlm.slice();
            }
          }
          else if (op === "T*") { tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm.slice(); }
          else if (op === "cm") { if (stack.length >= 6) ctm = mul(stack.slice(-6).map(x => x[1]), ctm); }
          else if (op === "q") gs.push(ctm.slice());
          else if (op === "Q") { if (gs.length) ctm = gs.pop(); }
          else if (op === "Tj" || op === "'" || op === '"') {
            if (op !== "Tj") { tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm.slice(); }
            const top = stack[stack.length - 1];
            if (top && top[0] === "str" && cur) {
              const [s_, w_] = decodeStr(top[1], cur);
              const mm = mul(tm, ctm);
              runs.push({ x: Math.round(mm[4] * 100) / 100, y: Math.round(mm[5] * 100) / 100, sx: mm[0], sy: mm[3], t: s_ });
              const sc = tm[0] || 1;
              tm = mul([1, 0, 0, 1, w_ * sc, 0], tm);
            }
          }
          else if (op === "TJ") {
            const top = stack[stack.length - 1];
            if (top && top[0] === "arr" && cur) {
              let acc = "", adv = 0;
              const sc = tm[0] || 1;
              for (const [k, v] of top[1]) {
                if (k === "str") { const [s_, w_] = decodeStr(v, cur); acc += s_; adv += w_ * sc; }
                else if (k === "num") adv -= v / 1000 * sc;
              }
              const mm = mul(tm, ctm);
              runs.push({ x: Math.round(mm[4] * 100) / 100, y: Math.round(mm[5] * 100) / 100, sx: mm[0], sy: mm[3], t: acc });
              tm = mul([1, 0, 0, 1, adv / sc, 0], tm);
            }
          }
          stack = [];
        }
      }
      return runs;
    }

    const out = [];
    pages.forEach((pnum, idx) => {
      const runs = pageRuns(pnum).filter(r => r.t && r.t.trim());
      out.push({ p: idx + 1, runs });
    });
    return out;
  }

  g.PDFREAD = { read };
  if (typeof module !== "undefined" && module.exports) module.exports = { read };
})(typeof globalThis !== "undefined" ? globalThis : this);
