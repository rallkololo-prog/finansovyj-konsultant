/* engine.js — пересчёт аналитики на произвольный период (клиент).
   Порт build_block() из build_data.py: те же формулы, чтобы любые даты в календаре
   давали те же цифры, что и предрасчитанные active/full. */
(function () {
  const FIN = window.FIN;
  const M = FIN.meta;
  const CATS = M.categories;
  const CAT = {};
  CATS.forEach((c, i) => (CAT[c] = i));
  const SPEND_CATS = M.spend_cats;
  const CONSUMPTION = M.consumption;
  const ALL_MONTHS = M.months_all;
  const DAY = 86400000;

  function dt(iso) {
    return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  }
  function wd(iso) {
    return (new Date(dt(iso)).getUTCDay() + 6) % 7;
  }

  // подготовка строк один раз
  const ROWS = FIN.tx.map((r, i) => {
    const iso = r[0];
    return {
      id: i, iso, mm: iso.slice(0, 7), t: dt(iso), wd: wd(iso),
      h: r[1], min: r[2], a: r[3], b: r[4], ci: r[5], k: r[6], desc: r[7], src: r[8] || 0,
    };
  });

  const byDate = ROWS.slice().sort((x, y) => x.t - y.t || x.id - y.id);

  function median(vals) {
    if (!vals.length) return 0;
    const s = vals.slice().sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function cv(vals) {
    const v = vals.filter(x => x > 0);
    if (v.length < 2) return null;
    const mu = v.reduce((s, x) => s + x, 0) / v.length;
    if (!mu) return null;
    const sd = Math.sqrt(v.reduce((s, x) => s + (x - mu) ** 2, 0) / v.length);
    return sd / mu;
  }
  function monthsBetween(from, to) {
    return ALL_MONTHS.filter(mm => mm >= from.slice(0, 7) && mm <= to.slice(0, 7));
  }
  const r2 = x => Math.round(x * 100) / 100;
  const r1 = x => Math.round(x * 10) / 10;

  // overrides: {brand: catName} — подтверждённые пользователем категории
  function computeBlock(from, to, overrides, srcFilter) {
    overrides = overrides || {};
    const ovc = {};
    Object.keys(overrides).forEach(b => {
      const name = overrides[b];
      if (typeof CAT[name] === "number") ovc[b] = CAT[name];
    });
    const catOf = r => (typeof ovc[r.b] === "number" ? ovc[r.b] : r.ci);

    const months = monthsBetween(from, to);
    const days = Math.round((dt(to) - dt(from)) / DAY) + 1;
    const perMonthDiv = days / 30.4375;

    const srcOk = r => !srcFilter || srcFilter === "all" || (srcFilter === "tb" ? r.src === 0 : r.src === 1);
    const inRange = byDate.filter(r => r.iso >= from && r.iso <= to && srcOk(r));
    const spend = inRange.filter(r => (r.k === "purchase" || r.k === "fee") && r.a < 0);

    const catMonth = {}, catCnt = {}, brandMonth = {}, brandCnt = {};
    const brandCat = {}, brandTotal = {}, brandN = {}, brandRows = {}, catVals = {};
    const monthTotal = {}, monthCnt = {}, monthCat = {};
    const wdSum = new Array(7).fill(0), wdCnt = new Array(7).fill(0);
    const hSum = new Array(24).fill(0), hCnt = new Array(24).fill(0);
    const bump = (o, k, v) => { o[k] = (o[k] || 0) + v; };
    const push = (o, k, v) => { (o[k] = o[k] || []).push(v); };

    spend.forEach(r => {
      const amt = -r.a, mm = r.mm, c = catOf(r);
      catMonth[c] = catMonth[c] || {}; catMonth[c][mm] = (catMonth[c][mm] || 0) + amt;
      catCnt[c] = catCnt[c] || {}; catCnt[c][mm] = (catCnt[c][mm] || 0) + 1;
      brandMonth[r.b] = brandMonth[r.b] || {}; brandMonth[r.b][mm] = (brandMonth[r.b][mm] || 0) + amt;
      brandCnt[r.b] = brandCnt[r.b] || {}; brandCnt[r.b][mm] = (brandCnt[r.b][mm] || 0) + 1;
      brandCat[r.b] = c;
      brandTotal[r.b] = (brandTotal[r.b] || 0) + amt;
      brandN[r.b] = (brandN[r.b] || 0) + 1;
      push(brandRows, r.b, { t: r.t, iso: r.iso, amt, id: r.id });
      push(catVals, c, amt);
      monthTotal[mm] = (monthTotal[mm] || 0) + amt;
      monthCnt[mm] = (monthCnt[mm] || 0) + 1;
      monthCat[mm] = monthCat[mm] || {}; monthCat[mm][c] = (monthCat[mm][c] || 0) + amt;
      wdSum[r.wd] += amt; wdCnt[r.wd] += 1;
      if (r.h >= 0) { hSum[r.h] += amt; hCnt[r.h] += 1; }
    });

    const total = Object.keys(brandTotal).reduce((s, b) => s + brandTotal[b], 0);

    const categories = {};
    SPEND_CATS.forEach(c => {
      const ci = CAT[c];
      const vals = catVals[ci] || [];
      const s = vals.reduce((x, y) => x + y, 0);
      const monthly = months.map(mm => r2((catMonth[ci] || {})[mm] || 0));
      categories[c] = {
        total: r2(s), cnt: vals.length,
        avg: vals.length ? r2(s / vals.length) : 0,
        median: r2(median(vals)), max: vals.length ? r2(Math.max.apply(null, vals)) : 0,
        per_month: r2(s / perMonthDiv), per_year: r2(s / perMonthDiv * 12),
        share: total ? r1(s / total * 100) : 0,
        cv: cv(monthly),
        series: monthly,
        counts: months.map(mm => (catCnt[ci] || {})[mm] || 0),
        series_all: ALL_MONTHS.map(mm => r2((catMonth[ci] || {})[mm] || 0)),
      };
    });

    const brands = {};
    Object.keys(brandTotal).forEach(b => {
      const rows = brandRows[b].slice().sort((x, y) => x.t - y.t);
      const gaps = [];
      for (let i = 1; i < rows.length; i++) gaps.push(Math.round((rows[i].t - rows[i - 1].t) / DAY));
      const amts = rows.map(x => x.amt);
      brands[b] = {
        cat: CATS[brandCat[b]], total: r2(brandTotal[b]), cnt: rows.length,
        avg: r2(brandTotal[b] / rows.length), median: r2(median(amts)), max: r2(Math.max.apply(null, amts)),
        gap_med: gaps.length ? r2(median(gaps)) : null,
        cv_amount: cv(amts),
        per_month: r2(brandTotal[b] / perMonthDiv),
        first: rows[0].iso, last: rows[rows.length - 1].iso,
        series: months.map(mm => r2((brandMonth[b] || {})[mm] || 0)),
        counts: months.map(mm => (brandCnt[b] || {})[mm] || 0),
        ids: rows.map(x => x.id),
      };
    });

    // регулярные списания
    const recurring = [];
    Object.keys(brands).forEach(b => {
      const info = brands[b];
      if (info.cnt < 3 || info.cv_amount === null || !info.gap_med) return;
      const g = info.gap_med;
      let period = null;
      if (g >= 25 && g <= 36) period = "месяц";
      else if (g >= 55 && g <= 75) period = "2 месяца";
      else if (g >= 12 && g <= 18) period = "2 недели";
      else if (g >= 6 && g <= 9) period = "неделя";
      else if (g >= 85 && g <= 100) period = "квартал";
      if (!period || info.cv_amount > 0.45) return;
      const perYear = { "неделя": 52, "2 недели": 26, "месяц": 12, "квартал": 4, "2 месяца": 6 }[period];
      recurring.push({
        brand: b, cat: info.cat, period, typical: info.median,
        yearly: r2(info.median * perYear), cnt: info.cnt,
        first: info.first, last: info.last, cv: info.cv_amount,
        total: info.total, ready: months.length < 2 ? true : info.last >= months[months.length - 2],
      });
    });
    recurring.sort((a, b) => b.yearly - a.yearly);

    // мелкие траты
    const small = spend.filter(r => -r.a <= 500 && catOf(r) !== CAT["Комиссии банка"]);
    const smallTotal = small.reduce((s, r) => s + -r.a, 0);
    const smallMonth = {};
    small.forEach(r => { smallMonth[r.mm] = (smallMonth[r.mm] || 0) + -r.a; });
    const byCat = {};
    small.forEach(r => {
      const c = CATS[catOf(r)];
      byCat[c] = (byCat[c] || 0) + -r.a;
    });
    Object.keys(byCat).forEach(c => (byCat[c] = r2(byCat[c])));
    const smallBlock = {
      limit: 500, cnt: small.length, total: r2(smallTotal),
      avg: small.length ? r2(smallTotal / small.length) : 0,
      per_month: r2(smallTotal / perMonthDiv),
      per_year: r2(smallTotal / perMonthDiv * 12),
      per_5y: r2(smallTotal / perMonthDiv * 60),
      per_day: r2(smallTotal / days),
      cnt_per_day: r2(small.length / days),
      share: total ? r1(smallTotal / total * 100) : 0,
      by_cat: byCat,
      series: months.map(mm => r2(smallMonth[mm] || 0)),
      counts: months.map(mm => small.filter(r => r.mm === mm).length),
    };

    const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
    const weekday = WD.map((name, i) => ({
      wd: name, sum: r2(wdSum[i]), cnt: wdCnt[i],
      avg: wdCnt[i] ? r2(wdSum[i] / wdCnt[i]) : 0,
    }));
    const hours = Array.from({ length: 24 }, (_, i) => ({ h: i, sum: r2(hSum[i]), cnt: hCnt[i] }));

    const moy = {};
    months.forEach(mm => {
      const n = +mm.slice(5);
      moy[n] = moy[n] || [0, 0];
      moy[n][0] += monthTotal[mm] || 0;
      moy[n][1] += 1;
    });
    const mood = Array.from({ length: 12 }, (_, i) => ({
      m: i + 1,
      avg: moy[i + 1] ? r2(moy[i + 1][0] / moy[i + 1][1]) : 0,
    }));

    // аномалии
    const anomalies = [];
    CONSUMPTION.forEach(c => {
      const vals = (catVals[CAT[c]] || []);
      if (vals.length < 8) return;
      const mMed = median(vals);
      const logs = vals.map(v => Math.log1p(v));
      const lm = median(logs);
      const mad = median(logs.map(v => Math.abs(v - lm))) || 0.05;
      spend.forEach(r => {
        if (catOf(r) !== CAT[c]) return;
        const amt = -r.a;
        if (amt >= 2500 && amt > Math.max(3 * mMed, mMed + 1500)) {
          anomalies.push({
            id: r.id, date: r.iso, amount: r2(amt), brand: r.b, cat: c,
            median: r2(mMed), ratio: mMed ? r1(amt / mMed) : null,
            score: r1((Math.log1p(amt) - lm) / (1.4826 * mad)),
          });
        }
      });
    });
    anomalies.sort((a, b) => b.amount - a.amount);
    const biggest = anomalies.slice(0, 15);

    const actVals = months.map(mm => monthTotal[mm] || 0).filter(v => v > 0);
    const medMonth = actVals.length ? median(actVals) : 0;
    const spikes = months.filter(mm => medMonth && (monthTotal[mm] || 0) > medMonth * 1.3)
      .map(mm => ({ month: mm, spend: r2(monthTotal[mm]), ratio: r2(monthTotal[mm] / medMonth) }));

    const half = Math.floor(months.length / 2);
    const firstM = new Set(months.slice(0, half)), secondM = new Set(months.slice(half));
    const brandTrend = [];
    Object.keys(brands).forEach(b => {
      const info = brands[b];
      if (info.cnt < 4) return;
      let f = 0, s = 0;
      months.forEach(mm => {
        const v = (brandMonth[b] || {})[mm] || 0;
        if (firstM.has(mm)) f += v; else if (secondM.has(mm)) s += v;
      });
      if (Math.max(f, s) < 2000) return;
      brandTrend.push({
        brand: b, cat: info.cat, first: r2(f), second: r2(s), delta: r2(s - f),
        pct: f > 0 ? r1((s - f) / f * 100) : null,
      });
    });
    brandTrend.sort((a, b) => b.delta - a.delta);

    // дубли
    const buckets = {};
    spend.forEach(r => {
      const key = r.b + "|" + Math.round(-r.a * 100);
      (buckets[key] = buckets[key] || []).push(r);
    });
    const dups = [];
    Object.keys(buckets).forEach(key => {
      const rows = buckets[key].sort((x, y) => x.t - y.t);
      const a = Math.round(-rows[0].a);
      for (let i = 1; i < rows.length; i++) {
        if ((rows[i].t - rows[i - 1].t) / DAY <= 2 && a >= 200) {
          dups.push({ id: rows[i].id, date: rows[i].iso, amount: a, brand: rows[i].b, cat: CATS[catOf(rows[i])], prev: rows[i - 1].iso });
        }
      }
    });
    dups.sort((a, b) => (a.date < b.date ? 1 : -1));

    // доходы / инвестиции / переводы
    const income = {}, invest = {}, p2p = {}, cash = {};
    inRange.forEach(r => {
      const mm = r.mm;
      if ((r.k === "in_in" || r.k === "salary" || r.k === "bonus" || r.k === "cashback" || r.k === "interest") && r.a > 0) income[mm] = (income[mm] || 0) + r.a;
      else if (r.k === "invest_out" || r.k === "invest_in") invest[mm] = (invest[mm] || 0) + -r.a;
      else if (r.k === "p2p" || r.k === "ext_bank") p2p[mm] = (p2p[mm] || 0) + -r.a;
      else if (r.k === "cash_out") cash[mm] = (cash[mm] || 0) + -r.a;
    });

    const reports = {};
    const brandNames = Object.keys(brandTotal);
    months.forEach(mm => {
      const cats = SPEND_CATS.map(c => [c, r2((monthCat[mm] || {})[c] || 0)]).sort((x, y) => y[1] - x[1]);
      const bs = brandNames.map(b => [b, r2((brandMonth[b] || {})[mm] || 0)]).sort((x, y) => y[1] - x[1]);
      reports[mm] = {
        spend: r2(monthTotal[mm] || 0), cnt: monthCnt[mm] || 0,
        check: monthCnt[mm] ? r2(monthTotal[mm] / monthCnt[mm]) : 0,
        income: r2(income[mm] || 0), invest: r2(invest[mm] || 0), p2p: r2(p2p[mm] || 0),
        top_cats: cats.slice(0, 4).filter(x => x[1] > 0),
        top_brands: bs.slice(0, 4).filter(x => x[1] > 0),
        anomalies: anomalies.filter(a => a.date.slice(0, 7) === mm).length,
      };
    });
    months.forEach((mm, i) => {
      const prev = i ? months[i - 1] : null;
      reports[mm].prev_spend = prev ? reports[prev].spend : null;
      reports[mm].delta = prev ? r2(reports[mm].spend - reports[prev].spend) : null;
    });

    const sumVals = o => r2(Object.keys(o).reduce((s, k) => s + o[k], 0));

    return {
      label: from === to ? "один день" : from + "…" + to,
      from, to, months, days,
      totals: {
        spend: r2(total), cnt: spend.length,
        avg: spend.length ? r2(total / spend.length) : 0,
        per_month: r2(total / perMonthDiv), per_year: r2(total / perMonthDiv * 12),
        income: sumVals(income), invest: sumVals(invest), p2p: sumVals(p2p), cash: sumVals(cash),
      },
      categories, brands, recurring, small: smallBlock,
      weekday, hours, moy: mood,
      anomalies: anomalies.slice(0, 40), biggest, spikes, brand_trend: brandTrend.slice(0, 25), dups: dups.slice(0, 30),
      reports,
      series: {
        total: months.map(mm => r2(monthTotal[mm] || 0)),
        income: months.map(mm => r2(income[mm] || 0)),
        invest: months.map(mm => r2(invest[mm] || 0)),
        p2p: months.map(mm => r2(p2p[mm] || 0)),
        cash: months.map(mm => r2(cash[mm] || 0)),
        check: months.map(mm => monthCnt[mm] ? r2(monthTotal[mm] / monthCnt[mm]) : 0),
        cnt: months.map(mm => monthCnt[mm] || 0),
      },
    };
  }

  function profileOf(b) {
    const tot = b.totals.spend;
    const regTotal = b.recurring.reduce((s, r) => s + r.yearly, 0);
    const brandTotals = Object.keys(b.brands).map(k => b.brands[k].total).sort((x, y) => y - x);
    const hhi = tot ? brandTotals.reduce((s, v) => s + (v / tot) ** 2, 0) * 10000 : 0;
    return {
      regular_share: tot ? r1(regTotal / tot * 100) : 0,
      variable_share: tot ? r1(100 - regTotal / tot * 100) : 0,
      regular_yearly: r2(regTotal),
      hhi: Math.round(hhi),
      top10_share: tot ? r1(brandTotals.slice(0, 10).reduce((s, v) => s + v, 0) / tot * 100) : 0,
      stability_cv: cv(b.series.total),
      avg_check: b.totals.avg,
      avg_check_median: r2(median(b.small ? [] : [])),
      uncategorized_share: b.categories["Прочее"] ? b.categories["Прочее"].share : 0,
      cash_share: tot ? r1(b.totals.cash / (tot + b.totals.cash) * 100) : 0,
    };
  }

  // средняя медиана чека отдельно (нужна профилю)
  function medianCheck(b) {
    const vals = [];
    b.__rows = null;
    return vals;
  }

  // ---- рекомендации -------------------------------------------------------
  const REC_DEFS = [
    { cat: "Продукты", pct: 10, title: "Сравнивать магазины внутри недели",
      why: "Основная категория. Разница между сетями и «магазином у дома» по одному и тому же набору доходит до 20–30%; 10% — осторожная оценка при сохранении привычного рациона.",
      confidence: "средняя", effort: "средняя" },
    { cat: "Кофе и фастфуд", pct: 25, title: "Сократить кофе и фастфуд на четверть",
      why: "Самая частая категория по количеству операций. Отказ от 1–2 покупок в неделю почти не меняет образ жизни, но экономит заметную сумму.",
      confidence: "высокая", effort: "низкая" },
    { cat: "Доставка еды", pct: 30, title: "Заменить часть доставки готовкой",
      why: "Средний чек доставки в несколько раз выше среднего чека продуктов. 30% заказов — реалистичная замена домашней едой.",
      confidence: "средняя", effort: "средняя" },
    { cat: "Ставки и азартные игры", pct: 100, title: "Разобраться с пополнениями ЦУПИС",
      why: "Платежи в НКО «Мобильная карта» — это единый ЦУПИС, через который пополняются счёта букмекеров и казино. Это не покупка товара: деньги уходят без возврата.",
      confidence: "средняя", effort: "низкая" },
    { cat: "Кикшеринг", pct: 25, title: "Меньше поездок на самокатах",
      why: "Очень много мелких поездок. Часть маршрутов в 1–2 км дешевле пройти пешком или проехать на общественном транспорте.",
      confidence: "средняя", effort: "низкая" },
    { cat: "Маркетплейсы", pct: 20, title: "Сократить импульсивные заказы",
      why: "Заказы с небольшим чеком и высокой частотой — типичный признак импульсивных покупок «на сдачу».",
      confidence: "средняя", effort: "средняя" },
    { cat: "Табак", pct: 100, title: "Отказ от табачных изделий",
      why: "Единственная категория, где полный отказ не ухудшает качество жизни, а расходы прекращаются полностью.",
      confidence: "высокая", effort: "средняя" },
    { cat: "Такси и каршеринг", pct: 20, title: "Сократить такси на 20%",
      why: "Поездки заметны в бюджете; часть можно заменить общественным транспортом.",
      confidence: "низкая", effort: "низкая" },
    { cat: "Подписки и сервисы", pct: 40, title: "Пересмотреть подписки",
      why: "Часть подписок могла стать неактуальной. Банковская выписка не доказывает, что сервис не используется, — это кандидаты на проверку.",
      confidence: "низкая", effort: "низкая" },
    { cat: "Комиссии банка", pct: 50, title: "Проверить банковские комиссии",
      why: "Платы за обслуживание и оповещения списываются регулярно; часть можно отключить.",
      confidence: "высокая", effort: "низкая" },
    { cat: "Прочее", pct: 10, title: "Разобрать нераспознанные траты",
      why: "Часть операций не удалось отнести к категории. Если отметить их вручную, точность остальных рекомендаций вырастет.",
      confidence: "низкая", effort: "низкая" },
  ];
  const CONF_W = { "высокая": 1.0, "средняя": 0.88, "низкая": 0.72 };
  const EFFORT_W = { "низкая": 1.0, "средняя": 0.95, "высокая": 0.85 };

  function buildRecs(b, stopped) {
    stopped = stopped || {};
    const monthsN = b.months.length || 1;
    const recs = REC_DEFS.map(def => {
      const k = b.categories[def.cat];
      if (!k) return null;
      const saveMonth = k.per_year / 12 * def.pct / 100;
      const isStopped = !!stopped[def.cat];
      const ids = Object.keys(b.brands)
        .filter(br => b.brands[br].cat === def.cat)
        .map(br => b.brands[br])
        .sort((x, y) => y.total - x.total)
        .slice(0, 3)
        .flatMap(x => x.ids.slice(-20));
      return {
        cat: def.cat, pct: def.pct, title: def.title, why: def.why,
        confidence: def.confidence, effort: def.effort,
        base_year: r2(k.per_year), base_month: r2(k.per_month),
        save_month: r2(saveMonth), save_year: r2(saveMonth * 12), save_5y: r2(saveMonth * 60),
        cnt_year: Math.round(k.cnt * 12 / monthsN), avg_check: k.avg,
        stopped: isStopped, stop_note: isStopped ? stopped[def.cat] : null,
        ids: ids.slice(0, 60),
      };
    }).filter(Boolean);

    recs.forEach(r => {
      const freq = Math.min(1, r.cnt_year / 120);
      r.score = r.stopped ? -1 : r2(r.save_year * CONF_W[r.confidence] * EFFORT_W[r.effort] * (0.9 + 0.2 * freq));
    });
    // прекращённые привычки не должны возглавлять список экономии
    recs.sort((a, b2) => b2.score - a.score);
    recs.forEach((r, i) => {
      r.rank = i + 1;
      if (r.stopped) r.priority = "низкий";
      else r.priority = i < 3 ? "высокий" : (i < 7 ? "средний" : "низкий");
    });
    return recs;
  }

  function totalSaving(recs) {
    return recs.reduce((s, r) => s + (r.stopped ? 0 : r.save_year), 0);
  }

  window.ENGINE = {
    ROWS, ALL_MONTHS, CATS, CAT, SPEND_CATS, CONSUMPTION,
    computeBlock, buildRecs, totalSaving, profileOf, median, cv, r1, r2,
  };
})();
