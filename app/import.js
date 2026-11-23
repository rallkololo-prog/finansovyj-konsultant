/* import.js — превращает PDF-выписку в данные приложения прямо в браузере.
   Пайплайн: PDFREAD.read() → строки/колонки → операции → CLASSIFY → FIN. */
(function (g) {
  "use strict";

  const CATS = ["Продукты", "Кофе и фастфуд", "Доставка еды", "Такси и каршеринг", "Кикшеринг",
    "Транспорт", "Путешествия", "Табак", "Маркетплейсы", "Одежда и обувь", "Дом и ремонт", "Питомцы",
    "Здоровье и аптеки", "Связь и интернет", "Подписки и сервисы", "Страхование",
    "Развлечения", "Ставки и азартные игры", "Красота и уход", "Образование",
    "Госуслуги и налоги", "Цветы и подарки", "Комиссии банка", "Снятие наличных",
    "Прочее", "Переводы людям", "Переводы в другие банки", "Между своими счетами",
    "Инвестиции и вклады", "Доходы и пополнения"];
  const NON_SPEND = ["Снятие наличных", "Переводы людям", "Переводы в другие банки",
    "Между своими счетами", "Инвестиции и вклады", "Доходы и пополнения"];
  const SPEND_CATS = CATS.filter(c => NON_SPEND.indexOf(c) < 0);
  const CONSUMPTION = SPEND_CATS.filter(c => c !== "Комиссии банка");

  const DATE_RE = /^\d{2}\.\d{2}\.\d{4}$/;
  const TIME_RE = /^\d{2}:\d{2}$/;

  const num = s => {
    if (s == null) return null;
    const t = String(s).replace(/[\s\u00a0\u202f]/g, "").replace(/[₽$€]/g, "").replace(",", ".");
    const m = /[-+]?\d+(?:\.\d+)?/.exec(t);
    return m ? parseFloat(m[0]) : null;
  };

  // ---------- определение банка ----------
  function detect(pages) {
    const head = pages.slice(0, 3).map(p => p.runs.map(r => r.t).join(" ")).join(" ").toLowerCase();
    if (head.indexOf("сбербанк") >= 0 || head.indexOf("пао сбербанк") >= 0 || head.indexOf("сбербанк") >= 0) return "sber";
    if (head.indexOf("тбанк") >= 0 || head.indexOf("т-банк") >= 0 || head.indexOf("тинькофф") >= 0) return "tb";
    if (head.indexOf("выписка по счёту") >= 0 && head.indexOf("сбер") >= 0) return "sber";
    if (head.indexOf("tinkoff") >= 0 || head.indexOf("tbank") >= 0) return "tb";
    return "unknown";
  }

  // ---------- Т-Банк ----------
  function parseTb(pages) {
    const bucket = x => (x < 120 ? 0 : x < 195 ? 1 : x < 290 ? 2 : x < 385 ? 3 : x < 495 ? 4 : 5);
    const txs = [];
    for (const page of pages) {
      const rows = new Map();
      for (const r of page.runs) {
        const y = Math.round(r.y * 10) / 10;
        if (!rows.has(y)) rows.set(y, []);
        rows.get(y).push(r);
      }
      const ys = Array.from(rows.keys()).sort((a, b) => b - a);
      const lines = ys.map(y => {
        const cells = [[], [], [], [], [], []];
        rows.get(y).sort((a, b) => a.x - b.x).forEach(r => cells[bucket(r.x)].push(r.t));
        return { y, c: cells.map(v => v.join("").trim()) };
      });
      let cur = null;
      for (const { c } of lines) {
        const c0 = c[0];
        if (DATE_RE.test(c0)) {
          if (cur) txs.push(cur);
          cur = { op_date: c0, op_time: "", post_date: c[1], post_time: "", amount: c[2], amount_rub: c[3], desc: c[4], card: c[5] };
        } else if (cur) {
          if (TIME_RE.test(c0) && !cur.op_time) cur.op_time = c0;
          if (TIME_RE.test(c[1]) && !cur.post_time) cur.post_time = c[1];
          if (c[4]) cur.desc = (cur.desc + " " + c[4]).trim();
          if (c[2] && !cur.amount) cur.amount = c[2];
          if (c[3] && !cur.amount_rub) cur.amount_rub = c[3];
          if (c[5] && !cur.card) cur.card = c[5];
        }
      }
      if (cur) txs.push(cur);
    }
    return txs.map(t => {
      const a = num(t.amount_rub) != null ? num(t.amount_rub) : num(t.amount);
      return { op_date: t.op_date, op_time: t.op_time, amount: a, desc: t.desc, currency: t.amount_rub ? "rub" : "orig" };
    }).filter(t => t.amount != null && DATE_RE.test(t.op_date));
  }

  // ---------- Сбер ----------
  function parseSber(pages) {
    const AMT = /^([+-]?)(\d[\d\s\u00a0]*)[.,](\d{2})$/;
    const CODE = /^\d{6}$/;
    const ops = [];
    for (const page of pages) {
      const items = page.runs.filter(r => r.t.indexOf("Продолжение на следующей странице") < 0)
        .slice().sort((a, b) => b.y - a.y);
      const lines = [];
      let cur = [], cy = null;
      for (const r of items) {
        if (cy === null || Math.abs(r.y - cy) <= 3) {
          cur.push(r); if (cy === null) cy = r.y;
        } else {
          lines.push(cur.slice().sort((a, b) => a.x - b.x)); cur = [r]; cy = r.y;
        }
      }
      if (cur.length) lines.push(cur.slice().sort((a, b) => a.x - b.x));

      const pick = (line, lo, hi) => line.filter(r => r.x >= lo && r.x < hi).map(r => r.t).join(" ").trim();
      let op = null;
      for (const line of lines) {
        const d = pick(line, 40, 90), t = pick(line, 90, 140), cat = pick(line, 140, 455);
        const amtTxt = line.filter(r => r.x >= 455).map(r => r.t).join(" ").trim();
        if (DATE_RE.test(d) && TIME_RE.test(t)) {
          let m = AMT.exec(amtTxt.replace(/\u00a0/g, " "));
          if (!m) m = /([+-]?)\s*(\d[\d\s]*)[.,](\d{2})/.exec(amtTxt);
          if (!m) continue;
          const sign = m[1] === "+" ? 1 : -1;
          const value = parseFloat(m[2].replace(/[\s\u00a0]/g, "") + "." + m[3]);
          op = { op_date: d, op_time: t, category_raw: cat, amount: sign * value, desc: "" };
          ops.push(op);
        } else if (op) {
          const pd = pick(line, 40, 90), code = pick(line, 90, 140), desc = pick(line, 140, 620);
          if (desc) op.desc = (op.desc + " " + desc).trim();
        }
      }
    }
    return ops.map(o => {
      let d = o.desc.replace(/\s+/g, " ").trim();
      d = d.replace(/\s*В сумму операции включена комиссия [\d,\s]+руб\.?/g, "").trim();
      return { op_date: o.op_date, op_time: o.op_time, amount: Math.round(o.amount * 100) / 100, desc: d, category_raw: o.category_raw };
    });
  }

  // ---------- сборка FIN ----------
  function toFin(rows, bank) {
    const C = g.CLASSIFY;
    const tx = [];
    for (const r of rows) {
      const info = bank === "sber" ? C.classifySber(r) : C.classifyTb(r);
      const ci = CATS.indexOf(info.c);
      const iso = r.op_date.slice(6, 10) + "-" + r.op_date.slice(3, 5) + "-" + r.op_date.slice(0, 2);
      const [hh, mm] = (r.op_time || "0:0").split(":").map(Number);
      tx.push([iso, hh || 0, mm || 0, Math.round(r.amount * 100) / 100, info.b, ci < 0 ? CATS.indexOf("Прочее") : ci, info.k, info.desc, bank === "sber" ? 1 : 0]);
    }
    tx.sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : (a[1] * 60 + a[2]) < (b[1] * 60 + b[2]) ? 1 : -1));

    const years = {};
    for (const t of tx) {
      const y = t[0].slice(0, 4);
      const cat = CATS[t[5]], kind = t[6], amt = t[3];
      if (!years[y]) years[y] = { spend: 0, cnt: 0, income: 0, invest: 0, p2p: 0, cash: 0 };
      const isSpend = amt < 0 && (kind === "purchase" || kind === "fee");
      if (isSpend) { years[y].spend += -amt; years[y].cnt++; }
      if (amt > 0) years[y].income += amt;
    }
    Object.keys(years).forEach(y => { years[y].spend = Math.round(years[y].spend * 100) / 100; years[y].income = Math.round(years[y].income * 100) / 100; });

    const srcId = bank === "sber" ? "sber" : "tb";
    return rebuild(tx, [{ id: srcId, name: bank === "sber" ? "Сбер" : "Т-Банк", card: "" }]);
  }

  // Пересборка meta/years по готовому массиву операций (для объединения двух банков)
  function rebuild(tx, sources) {
    tx.sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : (a[1] * 60 + a[2]) < (b[1] * 60 + b[2]) ? 1 : -1));
    const years = {};
    for (const t of tx) {
      const y = t[0].slice(0, 4), kind = t[6], amt = t[3];
      if (!years[y]) years[y] = { spend: 0, cnt: 0, income: 0, invest: 0, p2p: 0, cash: 0 };
      if (amt < 0 && (kind === "purchase" || kind === "fee")) { years[y].spend += -amt; years[y].cnt++; }
      if (amt > 0) years[y].income += amt;
    }
    Object.keys(years).forEach(y => {
      years[y].spend = Math.round(years[y].spend * 100) / 100;
      years[y].income = Math.round(years[y].income * 100) / 100;
    });
    const months = Array.from(new Set(tx.map(t => t[0].slice(0, 7)))).sort();
    const from = months[0] + "-01";
    const lastMonth = months[months.length - 1];
    const maxDay = tx.filter(t => t[0].slice(0, 7) === lastMonth).reduce((m, t) => Math.max(m, +t[0].slice(8, 10)), 1);
    const to = lastMonth + "-" + String(maxDay).padStart(2, "0");
    const srcs = sources.map(s => Object.assign({}, s, { count: tx.filter(t => t[8] === (s.id === "sber" ? 1 : 0)).length }));
    // активный период: последние 10 месяцев (как в демо), но не раньше начала данных
    const lastIdx = months.length - 1;
    const actIdx = Math.max(0, lastIdx - 9);
    const active = [months[actIdx] + "-01", to];
    let tx_count = tx.length;
    return {
      meta: {
        categories: CATS, spend_cats: SPEND_CATS, consumption: CONSUMPTION,
        months_all: months, period: [from, to], active: active, sources: srcs,
        tx_count: tx_count, balance: null, imported: true,
      },
      tx, years,
    };
  }

  async function importFile(arrayBuffer, onStep) {
    const step = onStep || (() => { });
    step("читаю PDF…");
    const pages = await g.PDFREAD.read(arrayBuffer);
    step("определяю банк…");
    const bank = detect(pages);
    if (bank === "unknown") {
      throw new Error("Это выписка другого банка. Сейчас поддерживаются только Т-Банк и Сбер.");
    }
    step(bank === "sber" ? "разбираю выписку Сбера…" : "разбираю выписку Т-Банка…");
    const rows = bank === "sber" ? parseSber(pages) : parseTb(pages);
    if (!rows.length) {
      throw new Error("Файл прочитан, но ни одной операции не нашёл. Похоже, это не та выписка: сейчас работают только Т-Банк и Сбер.");
    }
    step("раскладываю по категориям…");
    const fin = toFin(rows, bank);
    return { bank, pages: pages.length, rows: rows.length, fin };
  }

  g.IMPORT = { importFile, detect, parseTb, parseSber, toFin, rebuild, CATS };
  if (typeof module !== "undefined" && module.exports) module.exports = g.IMPORT;
})(typeof globalThis !== "undefined" ? globalThis : this);
