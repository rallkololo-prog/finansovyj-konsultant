/* Финансовый консультант — интерфейс */
(function () {
"use strict";

const F = window.FIN;
const M = F.meta;
/* ---------------------------------------------------------------
   Платные функции: пока выключены. Включать только вместе с VK Pay / оплатой
   на платформах vk.ru и m.vk.ru, и помнить про правило 5.4.1 — в мобильных
   приложениях iOS/Android интерфейса оплаты быть не должно.
   canSell() — единственное место, где проверяется, можно ли вообще показывать оплату.
   --------------------------------------------------------------- */
const PRO = {
  enabled: false,      // станет true, когда появятся платные функции и серверная проверка оплаты
  trialDays: 0,        // пробный период, если основная функциональность станет платной (правило 5.4.3)
  priceLabel: ""       // «99 ₽ в месяц» — текст, который увидит пользователь
};
function canSell() {
  const p = window.VKCTX || {};
  if (!PRO.enabled || !PRO.priceLabel) return false;
  return !p.isMobileApp;   // iOS/Android: оплаты не показываем
}

const HAS_DATA = !!(F.tx && F.tx.length);
const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

const MONTHS_RU = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MONTHS_FULL = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

const PALETTE = ["#1c6b58", "#b4552a", "#2f5f8f", "#a8791a", "#6b4c8a", "#3f7a4e",
                 "#a8322a", "#2a7d8f", "#8a6a3f", "#7d3f6b", "#4a6b2a", "#8f5a2a",
                 "#2f7f6f", "#6f5a2a", "#5a3f7d", "#8f2a4a", "#3a7a6a"];

function catColor(c) {
  const idx = M.categories.indexOf(c);
  if (c === "Прочее") return "#9d968a";
  if (c === "Комиссии банка") return "#8a857a";
  return PALETTE[Math.max(0, idx) % PALETTE.length];
}

function money(v, dec) {
  const n = Math.abs(v);
  const s = dec ? nf2.format(n) : nf.format(Math.round(n));
  return (v < 0 ? "−" : "") + s + " ₽";
}
function short(v) {
  const n = Math.abs(v);
  let s;
  if (n >= 1e6) s = (n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(".", ",") + " млн";
  else if (n >= 1e3) s = (n / 1e3).toFixed(0) + " тыс";
  else s = nf.format(Math.round(n));
  return (v < 0 ? "−" : "") + s;
}
function pct(v, dec = 0) {
  if (v === null || v === undefined) return "—";
  return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(dec) + "%";
}
function monthLabel(mm, full) {
  const [y, m] = mm.split("-");
  const name = full ? MONTHS_FULL[+m - 1] : MONTHS_RU[+m - 1];
  return name + " " + y;
}
function fmtDate(iso) {
  if (!iso) return "—";
  return iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4);
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function weekdayName(d) {
  return ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"][d];
}
function plural(n, one, few, many) {
  n = Math.abs(Math.round(n));
  if (n % 10 === 1 && n % 100 !== 11) return one;
  if (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14)) return few;
  return many;
}

const E = window.ENGINE;

// пользователь подтвердил, что ставки прекращены: такие траты не входят в потенциал экономии
const STOPPED = {
  "Ставки и азартные игры": "ставки прекращены — по вашим словам, этих расходов больше не будет",
};

const LS_KEY = "fin.overrides.v1";
function loadOverrides() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch (e) { return {}; }
}
function saveOverrides(o) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch (e) {}
}
const overrides = loadOverrides();

const ACTIVE_RANGE = { from: M.active[0], to: M.active[1] };
const FULL_RANGE = { from: M.period[0], to: M.period[1] };

const START_PAGE = HAS_DATA ? "overview" : "import";
const state = {
  page: START_PAGE,
  from: ACTIVE_RANGE.from,
  to: ACTIVE_RANGE.to,
  preset: "active",
  src: "all",
  txFilter: { cat: "all", brand: "all", q: "", min: 0, kind: "spend" },
  scen: { cats: new Set(), pct: 20 },
  cmpCat: null,
  reportMonth: null,
  reportCompare: null,
};

let _block = null, _blockKey = "";
function B() {
  const key = state.from + "|" + state.to + "|" + state.src + "|" + JSON.stringify(overrides);
  if (!_block || _blockKey !== key) {
    _block = E.computeBlock(state.from, state.to, overrides, state.src);
    _blockKey = key;
  }
  return _block;
}
function isFull() { return state.from === FULL_RANGE.from && state.to === FULL_RANGE.to; }
function DAYS() { return Math.round((new Date(state.to) - new Date(state.from)) / 86400000) + 1; }
function shortPeriod() { return DAYS() < 14; }

function isActive() { return state.from === ACTIVE_RANGE.from && state.to === ACTIVE_RANGE.to; }
function rangeDays() { return B().days; }

let _recsKey = "", _recsCache = null;
function RECS() {
  const key = _blockKey + "|" + state.page + "|" + state.src;
  if (!_recsCache || _recsKey !== key) {
    _recsCache = E.buildRecs(B(), STOPPED);
    _recsKey = key;
  }
  return _recsCache;
}
function totalSave() { return E.totalSaving(RECS()); }
function SCEN() {
  const b = B(), out = {};
  E.CONSUMPTION.forEach(c => {
    const k = b.categories[c];
    out[c] = { year: k.per_year, month: k.per_month, cnt: k.cnt };
  });
  return out;
}
function yearsList() {
  const ys = Object.keys(F.years).filter(y => F.years[y].spend > 0);
  return ys.length ? ys : Object.keys(F.years);
}

function presetRange(id) {
  if (/^\d{4}$/.test(id)) {
    const lo = M.period[0], hi = M.period[1];
    const from = id + "-01-01", to = id + "-12-31";
    return { from: from < lo ? lo : from, to: to > hi ? hi : to };
  }
  const maxISO = M.period[1];
  const now = maxISO;                      // «сегодня» по выписке
  const ym = now.slice(0, 7);
  const day = n => ym + "-" + String(n).padStart(2, "0");
  const shift = (iso, dm) => {
    const [y, m] = iso.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + dm, 1));
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(last).padStart(2, "0");
  };
  switch (id) {
    case "active": return ACTIVE_RANGE;
    case "full": return FULL_RANGE;
    case "month": return { from: ym + "-01", to: maxISO };
    case "prev": return { from: shift(ym + "-01", -1).slice(0, 8) + "01", to: shift(ym + "-01", -1) };
    case "3m": return { from: shift(ym + "-01", -2).slice(0, 8) + "01", to: maxISO };
    case "year": return { from: "2026-01-01", to: maxISO };
    case "2025": return { from: "2025-01-01", to: "2025-12-31" };
    default: return { from: state.from, to: state.to };
  }
}

function setRange(from, to) {
  if (!from || !to) return;
  if (from > to) { const t = from; from = to; to = t; }
  const lo = M.period[0], hi = M.period[1];
  if (from < lo) from = lo;
  if (to > hi) to = hi;
  state.from = from;
  state.to = to;
  state.preset = "custom";
  if (from === ACTIVE_RANGE.from && to === ACTIVE_RANGE.to) state.preset = "active";
  if (from === FULL_RANGE.from && to === FULL_RANGE.to) state.preset = "full";
  state.reportMonth = null;
  state.reportCompare = null;
  render();
}

/* ------------------------------ SVG charts ------------------------------ */
function svgLine(values, labels, o) {
  o = o || {};
  const w = o.w || 760, h = o.h || 180, pl = 46, pr = 12, pt = 14, pb = 26;
  const max = Math.max.apply(null, values.concat([1])) * 1.12;
  const n = values.length;
  const X = i => pl + (n > 1 ? i * (w - pl - pr) / (n - 1) : 0);
  const Y = v => pt + (1 - v / max) * (h - pt - pb);
  let grid = "";
  for (let k = 0; k <= 3; k++) {
    const v = max * k / 3, y = Y(v);
    grid += `<line class="gridline" x1="${pl}" y1="${y.toFixed(1)}" x2="${w - pr}" y2="${y.toFixed(1)}"/>`;
    grid += `<text x="${pl - 7}" y="${(y + 3.5).toFixed(1)}" text-anchor="end">${short(v)}</text>`;
  }
  const pts = values.map((v, i) => [X(i), Y(v)]);
  let d = "";
  pts.forEach((p, i) => { d += (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); });
  const area = d + `L${pts[pts.length - 1][0].toFixed(1)} ${h - pb}L${pts[0][0].toFixed(1)} ${h - pb}Z`;
  let ticks = "";
  const step = o.tickEvery || Math.ceil(n / 8);
  labels.forEach((lb, i) => {
    const show = o.tickEvery ? !!lb : ((i % step === 0 || i === n - 1) && lb);
    if (show) {
      ticks += `<text x="${X(i).toFixed(1)}" y="${h - 8}" text-anchor="middle">${lb}</text>`;
    }
  });
  let dots = "";
  pts.forEach((p, i) => {
    dots += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="8" fill="transparent" class="pt" data-i="${i}">
      <title>${labels[i]}: ${money(values[i])}</title></circle>`;
  });
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img">
    ${grid}
    <path d="${area}" fill="${o.fill || "rgba(28,107,88,.10)"}" stroke="none"/>
    <path d="${d}" fill="none" stroke="${o.color || "#1c6b58"}" stroke-width="2" stroke-linejoin="round"/>
    ${dots}${ticks}
  </svg>`;
}

function svgBars(values, labels, o) {
  o = o || {};
  const w = o.w || 760, h = o.h || 170, pl = 40, pr = 10, pt = 12, pb = 24;
  const max = Math.max.apply(null, values.concat([1])) * 1.12;
  const n = values.length;
  const gap = o.gap || 0.22;
  const bw = (w - pl - pr) / n * (1 - gap);
  const Y = v => pt + (1 - v / max) * (h - pt - pb);
  let grid = "";
  for (let k = 0; k <= 3; k++) {
    const v = max * k / 3, y = Y(v);
    grid += `<line class="gridline" x1="${pl}" y1="${y.toFixed(1)}" x2="${w - pr}" y2="${y.toFixed(1)}"/>`;
    grid += `<text x="${pl - 6}" y="${(y + 3.5).toFixed(1)}" text-anchor="end">${short(v)}</text>`;
  }
  let bars = "";
  values.forEach((v, i) => {
    const x = pl + i * (w - pl - pr) / n + ((w - pl - pr) / n - bw) / 2;
    const y = Y(v), bh = Math.max(1, h - pb - y);
    const col = o.colors ? o.colors[i] : (o.color || "#1c6b58");
    bars += `<rect class="bar" data-i="${i}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${col}">
      <title>${labels[i]}: ${money(v)}</title></rect>`;
  });
  let ticks = "";
  // на узком экране подписи сливаются: показываем каждую N-ю, последнюю — только если она не липнет к предыдущей
  const step = n <= 8 ? 1 : n <= 14 ? 2 : 3;
  let lastShown = -99;
  labels.forEach((lb, i) => {
    const isLast = i === n - 1;
    if (i % step !== 0 && !isLast) return;
    if (isLast && i - lastShown < step) return;
    lastShown = i;
    ticks += `<text x="${(pl + i * (w - pl - pr) / n + (w - pl - pr) / n / 2).toFixed(1)}" y="${h - 7}" text-anchor="middle">${lb}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img">${grid}${bars}${ticks}</svg>`;
}

function donut(items, total) {
  const w = 210, h = 210, r = 82, cx = w / 2, cy = h / 2, sw = 26;
  let a0 = -Math.PI / 2, paths = "";
  items.forEach(it => {
    const frac = total ? it.value / total : 0;
    const a1 = a0 + frac * Math.PI * 2;
    const large = (a1 - a0) > Math.PI ? 1 : 0;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    if (frac > 0.001) {
      paths += `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}"
        fill="none" stroke="${it.color}" stroke-width="${sw}"><title>${it.label}: ${money(it.value)} (${(frac * 100).toFixed(1)}%)</title></path>`;
    }
    a0 = a1;
  });
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" style="max-width:260px;margin:0 auto">${paths}
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" style="font-size:11px;fill:#8a857a">всего</text>
    <text x="${cx}" y="${cy + 15}" text-anchor="middle" style="font-size:15px;font-weight:600;fill:#191813">${short(total)}</text></svg>`;
}

function hbars(rows, opts) {
  opts = opts || {};
  const max = Math.max.apply(null, rows.map(r => r.value).concat([1]));
  return `<div class="hbar-list">` + rows.map(r => `
    <div class="hbar-row ${r.click ? "clickable" : ""}" ${r.click ? `data-act="${r.click}"` : ""}>
      <div class="hbar-top"><span>${r.label}${r.sub ? ` <span class="t-muted t-small">${r.sub}</span>` : ""}</span>
      <span class="t-muted">${opts.fmt ? opts.fmt(r.value) : money(r.value)}</span></div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${Math.max(2, r.value / max * 100).toFixed(1)}%;background:${r.color || "#1c6b58"}"></div></div>
    </div>`).join("") + `</div>`;
}

/* ------------------------------ shared bits ------------------------------ */
function kpi(label, value, sub, cls) {
  return `<div class="card kpi ${cls || ""}">
    <div class="label">${label}</div>
    <div class="value">${value}</div>
    ${sub ? `<div class="sub">${sub}</div>` : ""}
  </div>`;
}

function note(text, cls, ico) {
  return `<div class="note ${cls || ""}"><div class="ico">${ico || "◐"}</div><div>${text}</div></div>`;
}

function yearsBefore2025() {
  return ["2020", "2021", "2022", "2023", "2024"].reduce((a, y) => {
    const v = F.years[y] || { spend: 0, cnt: 0 };
    return { spend: a.spend + v.spend, cnt: a.cnt + v.cnt };
  }, { spend: 0, cnt: 0 });
}

function srcTotals(src, y1, y2) {
  let spend = 0, cnt = 0;
  for (const t of F.tx) {
    const srcIdx = t[8] || 0;
    if (src === "tb" && srcIdx !== 0) continue;
    if (src === "sber" && srcIdx !== 1) continue;
    const y = +t[0].slice(0, 4);
    if (y < y1 || y > y2) continue;
    if (t[3] < 0 && (t[6] === "purchase" || t[6] === "fee")) { spend -= t[3]; cnt++; }
  }
  return { spend, cnt };
}

function ruDate(iso) {
  if (!iso) return "—";
  const m = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const d = +iso.slice(8, 10), mo = +iso.slice(5, 7), y = iso.slice(0, 4);
  return `${d} ${m[mo - 1]} ${y}`;
}
function srcFrom(srcId) {
  const first = (F.tx || []).filter(t => (srcId === "sber" ? t[8] === 1 : t[8] === 0)).map(t => t[0]).sort();
  return first.length ? first[0] : "";
}

function lastBetDate() {
  const iso = (F.tx || []).filter(t => M.categories[t[5]] === "Ставки и азартные игры").map(t => t[0]).sort();
  return iso.length ? fmtDate(iso[iso.length - 1]) : "";
}

function periodNote() {
  const b = B();
  const srcLbl = state.src === "tb" ? "Т-Банк" : state.src === "sber" ? "Сбер" : "оба банка";
  if (isActive()) {
    if (state.src === "sber") {
      return note(`Показаны операции <b>только по карте Сбера</b> за февраль — ноябрь 2026: ${money(b.totals.spend)}.
        В 2026 году эта карта почти перестала использоваться — основные траты ушли на карту Т-Банка
        (${money(srcTotals("tb", 2026, 2026).spend)} за тот же год). Поэтому рекомендации по одному Сберу описывают прошлое, а не текущие привычки.`, "grey", "ⓘ");
    }
    const tb = srcTotals("tb", 2020, 2024), sb = srcTotals("sber", 2022, 2024);
    const tb25 = srcTotals("tb", 2025, 2025), sb25 = srcTotals("sber", 2025, 2025);
    if (state.src === "all" && (M.sources || []).length < 2) {
      const only = (M.sources || [])[0];
      return note(`Показаны операции из загруженной выписки${only ? ` (${esc(only.name)})` : ""}:
        ${fmtDate(state.from)} — ${fmtDate(state.to)}. Рекомендации и привычки считаются по активному периоду
        (${ruDate(state.from)} — ${ruDate(state.to)}), а не за всю историю — иначе старые разовые траты искажали бы картину.`, "grey", "ⓘ");
    }
    if (state.src === "all") {
      return note(`В выписках <b>два банка</b>: ${M.sources.map(x => `${esc(x.name)} (с ${ruDate(srcFrom(x.id))})`).join(" и ")}.
        До 2026 года основные покупки шли через Сбер — ${money(sb25.spend)} за 2025-й против ${money(tb25.spend)} по Т-Банку.
        С февраля 2026 карты поменялись ролями: Т-Банк ${money(srcTotals("tb", 2026, 2026).spend)} за 2026-й против ${money(srcTotals("sber", 2026, 2026).spend)} у Сбера.
        Привычки и рекомендации считаются по <b>активному периоду</b> (${ruDate(state.from)} — ${ruDate(state.to)}), когда работали обе карты.`, "grey", "ⓘ");
    }
    return note(`Привычки, рекомендации и сценарии считаются по <b>активному периоду</b> (${ruDate(state.from)} — ${ruDate(state.to)})
      и только по карте <b>Т-Банка</b>. Раньше трат по ней было мало: ${money(tb.spend)} за 2020–2024 и ${money(tb25.spend)} за 2025-й,
      но с февраля 2026 она стала основной — ${money(srcTotals("tb", 2026, 2026).spend)} за десять месяцев.`, "grey", "ⓘ");
  }
  if (isFull()) {
    const rng = `${fmtDate(state.from)} — ${fmtDate(state.to)}`;
    return note(`Показан весь период выписок (${rng}, ${srcLbl}). Всего ${nf.format(b.totals.cnt)}
      ${plural(b.totals.cnt, "покупка", "покупки", "покупок")} на ${money(b.totals.spend)}.
      Из них ${money(srcTotals("tb", 2020, 2026).spend)} по карте Т-Банка и ${money(srcTotals("sber", 2022, 2026).spend)} по карте Сбера.`, "grey", "ⓘ");
  }
  const thin = b.months.filter(m => m < "2026-02").length > 0 && state.src === "tb";
  return note(`Выбран свой период: ${fmtDate(state.from)} — ${fmtDate(state.to)} · ${b.days} ${plural(b.days, "день", "дня", "дней")} · ${srcLbl}.
    Все цифры на страницах — только по операциям внутри этих дат, включая рекомендации и сценарии.
    ${thin ? "Внимание: до февраля 2026 карта Т-Банка почти не использовалась — траты того времени шли через Сбер и другие банки, поэтому картина будет неполной. Переключите источник на «Оба банка», чтобы увидеть полную картину. " : ""}
    Суммы «в месяц» и «в год» пересчитаны как средний темп за выбранные дни, а не как факт за календарный месяц.`, "grey", "ⓘ");
}

function catLink(cat) {
  return `<span class="link" data-act="cat" data-cat="${esc(cat)}">${esc(cat)}</span>`;
}
function brandLink(b) {
  return `<span class="link" data-act="brand" data-brand="${esc(b)}">${esc(b)}</span>`;
}

/* ------------------------------ router ------------------------------ */
const PAGES = [
  { id: "import", title: "Загрузить выписку", crumb: "Данные" },
  { id: "overview", title: "Обзор", crumb: "Главное" },
  { id: "improve", title: "Что можно улучшить", crumb: "Рекомендации" },
  { id: "scen", title: "А что, если бы я экономил", crumb: "Сценарии" },
  { id: "data", title: "Мои данные", crumb: "Профиль" },
  { id: "split", title: "Разделить счёт", crumb: "Калькулятор" },
  { id: "savings", title: "Накопления", crumb: "Планирование" },
  { id: "habits", title: "Финансовые привычки", crumb: "Поведение" },
  { id: "costly", title: "Самые дорогие привычки", crumb: "Рейтинг" },
  { id: "stream", title: "Стриминги и подписки", crumb: "Проверка" },
  { id: "subs", title: "Регулярные списания", crumb: "Проверка" },
  { id: "unknown", title: "Непонятные траты", crumb: "Проверка" },
  { id: "anom", title: "Аномалии и необычные платежи", crumb: "Проверка" },
  { id: "reports", title: "Отчёт за месяц", crumb: "Отчёты" },
  { id: "profile", title: "Финансовый профиль", crumb: "Профиль" },
  { id: "tx", title: "Операции", crumb: "Журнал" },
  { id: "help", title: "Как пользоваться", crumb: "Справка" },
];

/* ---------------- загрузка выписки ---------------- */
function importedInfo() {
  try {
    const raw = localStorage.getItem("fin.dataset.v1");
    if (!raw) return null;
    const d = JSON.parse(raw);
    return { meta: d.meta, tx: d.tx, bytes: raw.length };
  } catch (e) { return null; }
}

function pageImport() {
  const imp = importedInfo();
  const demo = !imp;
  const sp = imp ? imp.meta.sources || [] : [];
  return `
  <div class="section" style="margin-top:0">
    ${note(`Файл разбирается <b>прямо в браузере</b>: он не загружается на сервер и никуда не отправляется.
      <b>Сейчас поддерживаются только два банка: Т-Банк и Сбер.</b> Т-Банк — «Справка о движении средств»,
      Сбер — «Выписка по счёту дебетовой карты», скачанные в PDF из приложения или интернет-банка.
      Выписку другого банка приложение вежливо отклонит. Сканы и фотографии не подойдут — в них нет текстового слоя.`, "grey", "ⓘ")}
  </div>

  ${imp ? `<div class="card" style="background:linear-gradient(160deg,#1e5b4d,#173f36);border-color:#173f36;color:#eef5f1">
    <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#a8c6bb">сейчас в приложении</div>
    <div style="font-size:26px;font-weight:600;margin-top:6px">${nf.format(imp.tx.length)} операций из вашего файла</div>
    <div style="font-size:13px;color:#c8dbd3;margin-top:6px">
      ${sp.map(x => `${esc(x.name)} — ${nf.format(x.count || 0)}`).join(" · ")}
      &nbsp;·&nbsp; ${fmtDate((imp.meta.period[0] || ""))} — ${fmtDate((imp.meta.period[1] || ""))}
    </div>
    <div class="filters" style="margin-top:14px">
      <button class="btn" data-act="pick-file">Загрузить другой файл</button>
      <button class="btn ghost" data-act="reset-data" style="color:#dbe7e1;border-color:#3c6b5f">Очистить данные</button>
    </div>
  </div>` : ""}

  <div class="card dropzone" id="dropzone">
    <div class="dropicon">PDF</div>
    <div class="drop-t">Перетащите файл выписки сюда</div>
    <div class="t-small t-muted" style="margin-top:4px">или выберите его на диске</div>
    <div class="t-small" style="margin-top:6px"><a class="link" data-act="page" data-page="help">Не знаете, где взять выписку? Инструкция для Т-Банка и Сбера</a></div>
    <div class="drop-banks">
      <span class="bk ok">Т-Банк</span>
      <span class="bk ok">Сбер</span>
      <span class="bk no">другие банки — скоро</span>
    </div>
    <div class="filters" style="justify-content:center;margin-top:14px">
      <button class="btn" data-act="pick-file">Выбрать PDF</button>
      ${demo && window.__DEMO ? '<button class="btn ghost" data-act="try-demo">Посмотреть на примере</button>' : ""}
    </div>
    <div class="t-small t-muted" id="importStatus" style="margin-top:12px;min-height:18px">${demo ? "файл ещё не загружен" : "выберите второй файл, чтобы объединить банки"}</div>
    <input type="file" id="fileInput" accept="application/pdf,.pdf" hidden>
  </div>

  <div class="card">
    <div class="section-head"><h2>Перенести данные на другое устройство</h2>
      <div class="hint">один файл JSON: операции, ваши уточнения категорий, доходы и цели</div></div>
    <div class="t-small t-muted" style="margin-bottom:12px">
      Приложение хранит всё в браузере этого устройства. Если открыть его на телефоне или другом компьютере,
      там будет пусто — сохраните файл здесь и загрузите его там. Файл содержит ваши операции, держите его в тайне.
    </div>
    <div class="filters">
      <button class="btn" data-act="export-data">Сохранить данные в файл</button>
      <button class="btn ghost" data-act="import-data">Загрузить файл данных</button>
    </div>
    <div class="t-small t-muted" id="jsonStatus" style="margin-top:10px;min-height:18px"></div>
    <input type="file" id="jsonInput" accept="application/json,.json" hidden>
  </div>

  <div class="card">
    <div class="section-head"><h2>Как это работает</h2></div>
    <div class="kvr"><span class="k">1. Разбор PDF</span><span class="v">достаю текст с координатами, без чужих сервисов</span></div>
    <div class="kvr"><span class="k">2. Операции</span><span class="v">дата, время, сумма, описание, карта — построчно из таблицы</span></div>
    <div class="kvr"><span class="k">3. Категории</span><span class="v">те же правила, что в демо: магазины, подписки, переводы</span></div>
    <div class="kvr"><span class="k">4. Пересчёт</span><span class="v">все разделы считаются заново по вашим данным</span></div>
    <div class="t-small t-muted" style="margin-top:12px">
      Если вы загрузите второй банк, операции объединятся: Т-Банк и Сбер будут в одном списке, с фильтром по банку.
      Переводы между своими картами останутся переводами и не станут расходом — это заложено в правилах категорий.
    </div>
  </div>`;
}

function bindImport() {
  const dz = document.getElementById("dropzone");
  const input = document.getElementById("fileInput");
  const st = document.getElementById("importStatus");
  if (input) input.addEventListener("change", () => {
    if (input.files && input.files[0]) handleImportFile(input.files[0]);
  });
  const jinput = document.getElementById("jsonInput");
  if (jinput) jinput.addEventListener("change", () => {
    if (jinput.files && jinput.files[0]) importData(jinput.files[0]);
  });
  if (!dz) return;
  ["dragenter", "dragover"].forEach(ev => dz.addEventListener(ev, e => {
    e.preventDefault(); dz.classList.add("over");
  }));
  ["dragleave", "drop"].forEach(ev => dz.addEventListener(ev, e => {
    e.preventDefault(); dz.classList.remove("over");
  }));
  dz.addEventListener("drop", e => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleImportFile(f);
  });
  if (st && !st.textContent.trim()) st.textContent = "файл ещё не загружен";
}

async function handleImportFile(file) {
  const st = () => document.getElementById("importStatus");
  const say = (t) => { const el = st(); if (el) el.textContent = t; };
  if (!/\.pdf$/i.test(file.name)) { say("нужен файл PDF"); return; }
  say("читаю файл: " + file.name + " (" + Math.round(file.size / 1024) + " КБ)");
  try {
    const buf = await file.arrayBuffer();
    const res = await IMPORT.importFile(buf, say);
    say("сохраняю…");
    const key = res.bank === "sber" ? 1 : 0;
    let fin = res.fin;
    let sources = [{ id: res.bank === "sber" ? "sber" : "tb", name: res.bank === "sber" ? "Сбер" : "Т-Банк", card: "" }];
    try {
      const prevRaw = localStorage.getItem("fin.dataset.v1");
      if (prevRaw) {
        const prev = JSON.parse(prevRaw);
        const other = (prev.tx || []).filter(t => t[8] !== key);
        if (other.length) {
          const merged = other.concat(res.fin.tx);
          const prevSrc = (prev.meta.sources || []).filter(s => s.id !== sources[0].id);
          fin = IMPORT.rebuild(merged, sources.concat(prevSrc));
        }
      }
    } catch (e) { }
    const raw = JSON.stringify(fin);
    try {
      localStorage.setItem("fin.dataset.v1", raw);
    } catch (e) {
      say("файл разобран, но не помещается в хранилище браузера (" + Math.round(raw.length / 1024) + " КБ). Показываю без сохранения.");
      window.FIN = fin;
      state.page = "overview"; render();
      return;
    }
    say("готово: " + nf.format(fin.tx.length) + " операций, обновляю страницу…");
    setTimeout(() => location.reload(), 600);
  } catch (e) {
    console.error(e);
    say("не получилось разобрать файл: " + (e && e.message ? e.message : e));
  }
}

/* ------------------------------ перенос данных ------------------------------ */
const DATA_KEYS = ["fin.dataset.v1", "fin.overrides.v1", "fin.mydata.v1", "fin.split.v1", "fin.savings.v1"];

function exportData() {
  const out = { app: "finansovyj-konsultant", v: 1, at: new Date().toISOString(), data: {} };
  DATA_KEYS.forEach(k => {
    const raw = localStorage.getItem(k);
    if (raw == null) return;
    try { out.data[k] = JSON.parse(raw); } catch (e) { out.data[k] = raw; }
  });
  const blob = new Blob([JSON.stringify(out)], { type: "application/json" });
  const a = document.createElement("a");
  const d = new Date();
  const p2 = n => String(n).padStart(2, "0");
  a.href = URL.createObjectURL(blob);
  a.download = `finansy-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  say2("файл сохранён — теперь его можно загрузить на другом устройстве");
}

function say2(t) {
  const el = document.getElementById("jsonStatus");
  if (el) el.textContent = t;
}

function importData(file) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const obj = JSON.parse(String(fr.result));
      const data = (obj && obj.data) || obj;
      let n = 0;
      DATA_KEYS.forEach(k => {
        if (!data || !(k in data)) return;
        const v = data[k];
        localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
        n++;
      });
      if (!n) { say2("в файле нет данных этого приложения"); return; }
      say2("загружено, обновляю страницу…");
      setTimeout(() => location.reload(), 700);
    } catch (e) {
      say2("не удалось прочитать файл: " + (e && e.message ? e.message : e));
    }
  };
  fr.readAsText(file);
}

function navBadges() {
  if (!HAS_DATA) return {};
  const b = B();
  return {
    improve: RECS().length,
    subs: b.recurring.length,
    stream: servicesList(b).length,
    unknown: unknownList(b).length,
    anom: b.anomalies.length + b.dups.length,
  };
}

function renderNav() {
  if (!HAS_DATA) {
    document.getElementById("nav").innerHTML = PAGES.filter(p => p.id === "import" || p.id === "help").map(p =>
      `<button class="nav-item ${state.page === p.id ? "active" : ""}" data-act="page" data-page="${p.id}">
        <span>${p.title}</span></button>`).join("");
    return;
  }
  const badges = navBadges();
  document.getElementById("nav").innerHTML = PAGES.map(p =>
    `<button class="nav-item ${state.page === p.id ? "active" : ""}" data-act="page" data-page="${p.id}">
      <span>${p.title}</span>${badges[p.id] ? `<span class="badge">${badges[p.id]}</span>` : ""}
    </button>`).join("");
}

function renderChrome() {
  const p = PAGES.find(x => x.id === state.page);
  document.getElementById("pageTitle").textContent = p.title;
  document.getElementById("crumb").textContent = p.crumb;
  const b = B();
  const bs = document.getElementById("brandSub");
  if (bs) {
    if (HAS_DATA) {
      const y1 = (Array.isArray(M.period) ? M.period[0] : "").slice(0, 4);
      const y2 = (Array.isArray(M.period) ? M.period[1] : "").slice(0, 4);
      const names = (M.sources || []).map(x => x.name).join(" · ");
      bs.textContent = `${names || "выписки"} · ${y1}–${y2}`;
    } else {
      bs.textContent = "ваши выписки";
    }
  }
  if (!HAS_DATA) {
    document.getElementById("periodPill").innerHTML = "";
    document.getElementById("dataNote").innerHTML = "нет загруженных данных";
    renderNav();
    return;
  }
  document.getElementById("periodPill").innerHTML = `
    <div class="datebar">
      <div class="seg srcseg">
        ${[["all", "Оба банка"], ["tb", "Т-Банк"], ["sber", "Сбер"]].map(([id, lbl]) =>
          `<button class="btn ${state.src === id ? "active" : ""}" data-act="src" data-s="${id}">${lbl}</button>`).join("")}
      </div>
      <div class="seg presets">
        ${[["active", "Активный"], ["month", "Этот месяц"], ["prev", "Прошлый"], ["3m", "3 месяца"],
           ["full", "Всё"]].map(([id, lbl]) =>
          `<button class="btn ${state.preset === id ? "active" : ""}" data-act="preset" data-p="${id}">${lbl}</button>`).join("")}
        <select class="yearsel" data-act="preset-year" title="Показать конкретный год">
          <option value="">год…</option>
          ${yearsList().map(y => `<option value="${y}" ${state.preset === y ? "selected" : ""}>${y}</option>`).join("")}
        </select>
      </div>
      <div class="dates">
        <input type="date" id="dateFrom" min="${M.period[0]}" max="${M.period[1]}" value="${state.from}">
        <span class="dash">—</span>
        <input type="date" id="dateTo" min="${M.period[0]}" max="${M.period[1]}" value="${state.to}">
      </div>
      <div class="rangelbl">${b.days} ${plural(b.days, "день", "дня", "дней")} · ${money(b.totals.spend)}</div>
    </div>`;
  const srcList = (M.sources || []).filter(s => state.src === "all" || s.id === state.src);
  const pFrom = Array.isArray(M.period) ? M.period[0] : (M.period && M.period.from);
  const pTo = Array.isArray(M.period) ? M.period[1] : (M.period && M.period.to);
  document.getElementById("dataNote").innerHTML =
    `<b>${nf.format(M.tx_count || (F.tx ? F.tx.length : 0))}</b> ${plural(M.tx_count || 0, "операция", "операции", "операций")} в ${srcList.length > 1 ? "двух выписках" : "выписке"}<br>` +
    srcList.map(s => `${s.card ? "карта " + s.card + " " : ""}(${esc(s.name)}): ${nf.format(s.count || 0)}`).join("<br>") +
    `<br>${fmtDate(pFrom || "")} — ${fmtDate(pTo || "")}`;
  renderNav();
}

/* ------------------------------ инсайты ------------------------------ */
function buildInsights(b) {
  const out = [];
  const brandList = Object.keys(b.brands).map(k => [k, b.brands[k]]);
  if (!brandList.length) return [];
  const byCnt = brandList.slice().sort((x, y) => y[1].cnt - x[1].cnt);
  const byTotal = brandList.slice().sort((x, y) => y[1].total - x[1].total);
  const monthsN = b.months.length || 1;

  let [bn, bv] = byCnt[0];
  out.push({
    title: "Самая частая покупка",
    text: `«${bn}» — ${nf.format(bv.cnt)} ${plural(bv.cnt, "операция", "операции", "операций")} на ${money(bv.total)}, в среднем ${money(bv.avg)} за раз. `
      + `Это ${nf.format(Math.round(bv.cnt / monthsN))} ${plural(bv.cnt / monthsN, "покупка", "покупки", "покупок")} в месяц и ${money(bv.per_month)} ежемесячно.`,
    cat: bv.cat, brand: bn,
  });

  [bn, bv] = byTotal[0];
  out.push({
    title: "Самая дорогая привычка",
    text: `«${bn}» (${bv.cat}) — ${money(bv.total)} за ${nf.format(bv.cnt)} ${plural(bv.cnt, "операцию", "операции", "операций")}, `
      + `${(bv.total / b.totals.spend * 100).toFixed(1)}% всех расходов периода. Средний чек ${money(bv.avg)}, медиана ${money(bv.median)}.`,
    cat: bv.cat, brand: bn,
  });

  const sm = b.small;
  out.push({
    title: "Мелкие траты незаметно съедают часть бюджета",
    text: `${nf.format(sm.cnt)} ${plural(sm.cnt, "покупка", "покупки", "покупок")} до ${sm.limit} ₽ на ${money(sm.total)} — это ${sm.share.toFixed(1)}% всех расходов `
      + `и ${money(sm.per_year)} в год. В среднем ${sm.cnt_per_day.toFixed(1)} таких покупок в день по ${money(sm.avg)}.`,
    cat: null, brand: null,
  });

  const ev = E.CONSUMPTION.map(c => [c, b.categories[c]]).filter(([c, v]) => v.cnt >= 30);
  if (ev.length) {
    const [c, v] = ev.slice().sort((x, y) => y[1].avg - x[1].avg)[0];
    const prod = b.categories["Продукты"];
    const cmp = prod && prod.cnt ? ` Это в ${(v.avg / prod.avg).toFixed(1)} раза дороже средней покупки в «Продуктах».` : "";
    out.push({
      title: "Самый дорогой средний чек",
      text: `«${c}» — ${nf.format(v.cnt)} ${plural(v.cnt, "операция", "операции", "операций")} со средним чеком ${money(v.avg)} и медианой ${money(v.median)}.${cmp}`,
      cat: c, brand: null,
    });
  }

  const wd = b.weekday.slice().sort((x, y) => y.sum - x.sum);
  if (wd[0] && wd[0].sum > 0) {
    const w0 = wd[0], w1 = wd[wd.length - 1];
    out.push({
      title: "День недели с самыми большими тратами",
      text: `Больше всего денег уходит в ${w0.wd} (${money(w0.sum)}), меньше всего — в ${w1.wd} (${money(w1.sum)}). `
        + `Разница ${(w0.sum / Math.max(w1.sum, 1)).toFixed(1)} раза.`,
      cat: null, brand: null,
    });
  }

  const hh = b.hours.filter(x => x.sum > 0);
  if (hh.length) {
    const h0 = hh.slice().sort((x, y) => y.sum - x.sum)[0];
    const late = hh.filter(x => x.h >= 22 || x.h < 5).reduce((s, x) => s + x.sum, 0);
    out.push({
      title: "Время суток",
      text: `Пик трат — ${String(h0.h).padStart(2, "0")}:00 (${money(h0.sum)}). После 22:00 ушло ${money(late)} — `
        + `${(late / b.totals.spend * 100).toFixed(1)}% всех расходов.`,
      cat: null, brand: null,
    });
  }

  const grow = b.brand_trend.filter(x => x.first >= 3000 && x.second >= 15000 && (x.pct || 0) > 0);
  if (grow.length) {
    const x = grow.slice().sort((a, b2) => b2.pct - a.pct)[0];
    const bi = b.brands[x.brand] || {};
    out.push({
      title: "Быстрее всего растут траты здесь",
      text: `«${x.brand}»: ${money(x.first)} в первой половине периода → ${money(x.second)} во второй (+${Math.round(x.pct)}%). `
        + `Всего ${money(bi.total || 0)} за ${nf.format(bi.cnt || 0)} ${plural(bi.cnt || 0, "операцию", "операции", "операций")}.`,
      cat: x.cat, brand: x.brand,
    });
  }

  const recs = RECS();
  const top = recs.filter(r => !r.stopped)[0];
  if (top) {
    out.push({
      title: "Главный резерв экономии",
      text: `«${top.title}» — до ${money(top.save_year)} в год. Основание: ${nf.format(top.cnt_year)} ${plural(top.cnt_year, "операция", "операции", "операций")} `
        + `на ${money(top.base_year)} в год, предлагаемое сокращение ${top.pct}%. Достоверность: ${top.confidence}.`,
      cat: top.cat, brand: null,
    });
  }
  return out;
}

/* ------------------------------ сервисы и подписки ------------------------------ */
const SERVICE_INFO = {
  "Яндекс Плюс": { what: "Яндекс Плюс — музыка, кино, кэшбэк баллами", type: "музыка и кино", url: "https://plus.yandex.ru", digital: true },
  "Сервисы VK": { what: "Сервисы VK — музыка, VK Combo и подписки", type: "музыка и сервисы", url: "https://vk.com", digital: true },
  "T-Bank.T- Bundle": { what: "T-Bundle — пакет сервисов Т-Банка (кино, музыка, скидки)", type: "банковская подписка", url: "https://www.tbank.ru", digital: true },
  "Аеза": { what: "Aéza — аренда VPS/серверов (хостинг)", type: "хостинг", url: "https://aeza.ru", digital: true },
  "Yota": { what: "Yota — мобильная связь и интернет", type: "связь", url: "https://www.yota.ru", digital: false },
  "Билайн": { what: "Билайн — мобильная связь", type: "связь", url: "https://www.beeline.ru", digital: false },
  "mBank.MTS": { what: "МТС — мобильная связь", type: "связь", url: "https://www.mts.ru", digital: false },
  "mBank.t2": { what: "t2 (Tele2) — мобильная связь", type: "связь", url: "https://t2.ru", digital: false },
  "Steam.Balance": { what: "Steam — пополнение кошелька игровой платформы", type: "игры", url: "https://store.steampowered.com", digital: true },
  "YM *game center": { what: "Yandex Games / game center — игровые покупки", type: "игры", url: "https://yandex.ru/games", digital: true },
};

function serviceBrands(b) {
  const names = new Set(Object.keys(SERVICE_INFO));
  const out = [];
  Object.keys(b.brands).forEach(br => {
    const info = b.brands[br];
    if (names.has(br) || info.cat === "Подписки и сервисы") out.push(br);
  });
  return out;
}

function servicesList(b) {
  return serviceBrands(b).map(br => {
    const info = b.brands[br];
    const meta = SERVICE_INFO[br] || { what: "сервис/платформа", type: "сервис", digital: true };
    const rows = E.ROWS.filter(r => r.b === br && r.iso >= state.from && r.iso <= state.to && r.a < 0 && (r.k === "purchase" || r.k === "fee"));
    const cntByAmt = {};
    rows.forEach(r => { const k = Math.round(-r.a); cntByAmt[k] = (cntByAmt[k] || 0) + 1; });
    let modeAmt = 0, modeCnt = 0;
    Object.keys(cntByAmt).forEach(k => {
      if (cntByAmt[k] > modeCnt) { modeCnt = cntByAmt[k]; modeAmt = +k; }
    });
    const regular = modeCnt >= 3 ? modeAmt * modeCnt : 0;
    const lastRow = rows.slice().sort((x, y) => (x.iso < y.iso ? 1 : -1))[0];
    return {
      brand: br, meta, cat: info.cat,
      total: info.total, cnt: rows.length || info.cnt,
      median: info.median, regular, oneoff: info.total - regular, modeAmt, modeCnt,
      per_month: info.per_month, per_year: info.per_month * 12,
      first: info.first, last: info.last,
      active: lastRow ? (new Date(M.period[1]) - new Date(lastRow.iso)) / 86400000 < 70 : false,
      ids: info.ids,
    };
  }).sort((a, b2) => b2.total - a.total);
}

/* ------------------------------ непонятные траты ------------------------------ */
const UNKNOWN_INFO = {
  "Аеза": {
    find: "Aéza (aeza.ru) — российский хостинг VPS и выделенных серверов.",
    oks: "—",
    verdict: "Цифровой сервис с ежемесячной оплатой — это подписка, а не «прочее».",
    suggest: ["Подписки и сервисы"], url: "https://aeza.ru",
  },
};

function unknownList(b) {
  return Object.keys(b.brands)
    .filter(br => b.brands[br].cat === "Прочее" && !overrides[br])
    .map(br => ({ brand: br, info: b.brands[br], research: UNKNOWN_INFO[br] || null }))
    .sort((x, y) => y.info.total - x.info.total);
}

/* ------------------------------ pages ------------------------------ */

function pageStream() {
  const b = B();
  const all = servicesList(b);
  const digital = all.filter(s => s.meta.digital);
  const telco = all.filter(s => !s.meta.digital);
  const sum = list => list.reduce((s, x) => s + x.total, 0);
  const monthly = list => list.reduce((s, x) => s + x.per_month, 0);
  const yandex = all.find(s => s.brand === "Яндекс Плюс");

  const row = s => `<tr class="link" data-act="brand" data-brand="${esc(s.brand)}">
    <td class="name">${esc(s.brand)}<div class="t-small t-muted">${s.meta.what}</div></td>
    <td><span class="chip">${s.meta.type}</span></td>
    <td class="num">${s.cnt}</td>
    <td class="num">${money(s.total)}</td>
    <td class="num t-muted">${s.regular ? money(s.regular) + ` <span class="t-small">(${s.modeCnt}×${money(s.modeAmt)})</span>` : "—"}</td>
    <td class="num">${money(s.per_month)}</td>
    <td class="num t-muted">${fmtDate(s.last)}</td>
    <td>${s.active ? `<span class="chip green">списывается</span>` : `<span class="chip">давно не было</span>`}</td>
  </tr>`;

  return `
  ${note(`Здесь только цифровые подписки и платформы: стриминги, музыка, кино, хостинг, игры — и отдельно связь.
    Выписка видит факт списания, но не знает, пользуетесь ли вы сервисом, поэтому это карта трат, а не приговор.
    «Регулярная часть» — самая частая сумма платежа: если она повторяется 3+ раза, это похоже на автопродление,
    остальное — разовые покупки внутри сервиса.`, "grey", "ⓘ")}

  <div class="section">
    <div class="grid g4">
      ${kpi("Цифровые сервисы", money(sum(digital)), `${digital.length} ${plural(digital.length, "сервис", "сервиса", "сервисов")}`)}
      ${kpi("В среднем в месяц", money(monthly(digital)), `${money(monthly(digital) * 12)} в год`, "accent")}
      ${kpi("Регулярные автоплатежи", money(digital.reduce((s, x) => s + x.regular, 0)), "то, что списывается само")}
      ${kpi("Связь и интернет", money(sum(telco)), `${telco.length} ${plural(telco.length, "оператор", "оператора", "операторов")}`)}
    </div>
  </div>

  <div class="section">
    <div class="card">
      <div class="section-head"><h2>Цифровые подписки и платформы</h2>
        <div class="hint">клик по строке открывает операции</div></div>
      ${digital.length ? `<table>
        <thead><tr><th>Сервис</th><th>Тип</th><th class="num">Списаний</th><th class="num">Всего</th>
        <th class="num">Из них регулярно</th><th class="num">В месяц</th><th class="num">Последнее</th><th>Статус</th></tr></thead>
        <tbody>${digital.map(row).join("")}</tbody>
      </table>` : `<div class="empty">за выбранный период цифровых подписок не было</div>`}
    </div>
  </div>

  ${yandex ? `<div class="section"><div class="two-col">
    <div class="card">
      <div class="section-head" style="margin-bottom:6px"><h2>Что внутри Яндекс Плюса</h2></div>
      ${yandex.modeCnt >= 3 ? `<div class="kv"><span class="k">Похоже на автопродление</span>
        <span class="v">${money(yandex.modeAmt)} × ${yandex.modeCnt} = ${money(yandex.regular)}</span></div>` : ""}
      <div class="kv"><span class="k">Разовые покупки в сервисе</span><span class="v">${money(yandex.oneoff)}</span></div>
      <div class="kv"><span class="k">Всего за период</span><span class="v">${money(yandex.total)} за ${yandex.cnt} ${plural(yandex.cnt, "платёж", "платежа", "платежей")}</span></div>
      <div class="t-small t-muted" style="margin-top:10px;line-height:1.6">
        Одна и та же строка «Оплата в Сервисы Яндекса» — это и ежемесячная подписка, и покупка фильма.
        Разделить их по выписке можно только по сумме: ${money(yandex.modeAmt)} — типичный размер подписки,
        остальное — покупки. Поэтому «Плюс» не выглядит в подписках одной аккуратной строкой.
      </div>
    </div>
    <div class="card">
      <div class="section-head" style="margin-bottom:6px"><h2>Связь и интернет</h2></div>
      ${telco.length ? `<table><tbody>${telco.map(s => `<tr class="link" data-act="brand" data-brand="${esc(s.brand)}">
        <td class="name">${esc(s.brand)}<div class="t-small t-muted">${s.meta.what}</div></td>
        <td class="num">${money(s.total)}</td><td class="num t-muted">${s.cnt} платежей</td>
      </tr>`).join("")}</tbody></table>` : `<div class="empty">не найдено</div>`}
      <div class="t-small t-muted" style="margin-top:10px;line-height:1.6">
        Связь не относится к подпискам, но это тоже регулярные списания — держим рядом, чтобы не потерять.
      </div>
    </div>
  </div></div>` : ""}

  <div class="section">
    <div class="card">
      <div class="section-head"><h2>Подписки, которые могли остаться без внимания</h2>
        <div class="hint">кандидаты на проверку, а не «вы этим не пользуетесь»</div></div>
      ${digital.filter(s => s.total < 4000).slice(0, 8).map(s => `<div class="list-item">
        <div><div class="t">${s.brand}</div><div class="s">${s.meta.what} · последнее ${fmtDate(s.last)}</div></div>
        <div class="a">${money(s.per_month)}<div class="s" style="text-align:right">в месяц</div></div>
      </div>`).join("") || `<div class="empty">не найдено</div>`}
    </div>
  </div>`;
}

function pageUnknown() {
  const b = B();
  const list = unknownList(b);
  const unk = b.categories["Прочее"];
  const confirmed = Object.keys(overrides).map(br => ({ br, cat: overrides[br] }));

  return `
  ${note(`Это операции, которые не удалось уверенно отнести к категории. Для компаний с ИНН и ОГРНИП я искал
    вид деятельности в открытых источниках (ЕГРИП/ЕГРЮЛ, сайты, 2ГИС) и показываю, что нашёл, — но выписка не говорит,
    что именно вы купили. Если отметить категорию, все цифры приложения пересчитаются, а выбор сохранится в браузере.`, "grey", "ⓘ")}

  <div class="section">
    <div class="grid g4">
      ${kpi("Нераспознано", money(unk.total), `${nf.format(unk.cnt)} ${plural(unk.cnt, "операция", "операции", "операций")}`)}
      ${kpi("Доля расходов", unk.share.toFixed(1) + "%", "от всех трат периода")}
      ${kpi("Компаний без категории", list.length, "по ним есть вопросы")}
      ${kpi("Вы уже подтвердили", confirmed.length, "категорий задано вручную", confirmed.length ? "green" : "")}
    </div>
  </div>

  ${confirmed.length ? `<div class="section"><div class="card">
    <div class="section-head" style="margin-bottom:6px"><h2>Ваши уточнения</h2>
      <div class="hint">применяются ко всем расчётам</div></div>
    ${confirmed.map(x => `<div class="list-item">
      <div><div class="t">${x.br}</div><div class="s">отнесено к «${x.cat}» вручную</div></div>
      <div class="a"><button class="btn" data-act="unk-reset" data-brand="${esc(x.br)}">сбросить</button></div>
    </div>`).join("")}
  </div></div>` : ""}

  <div class="section">
    <div class="section-head"><h2>Что это за траты</h2>
      <div class="hint">отсортировано по сумме · нажмите категорию, чтобы подтвердить</div></div>
    <div class="grid" style="gap:10px">
      ${list.slice(0, 24).map(x => {
        const r = x.research;
        const cats = r ? r.suggest.slice() : [];
        if (!cats.includes("Прочее")) cats.push("Прочее");
        return `<div class="card unk">
          <div class="unk-head">
            <div>
              <div class="unk-name">${esc(x.brand)}</div>
              <div class="t-small t-muted">${x.info.cnt} ${plural(x.info.cnt, "операция", "операции", "операций")} ·
                ${fmtDate(x.info.first)} — ${fmtDate(x.info.last)} · средний чек ${money(x.info.avg)}</div>
            </div>
            <div class="unk-sum">${money(x.info.total)}</div>
          </div>
          ${r ? `<div class="unk-body">
            <div class="unk-row"><span class="unk-k">Что нашлось</span><span>${r.find}</span></div>
            ${r.oks !== "—" ? `<div class="unk-row"><span class="unk-k">Вид деятельности</span><span>${r.oks}</span></div>` : ""}
            <div class="unk-row"><span class="unk-k">Вывод</span><span>${r.verdict}</span></div>
            <div class="unk-row"><span class="unk-k">Источник</span><span><a href="${r.url}" target="_blank" rel="noopener">открыть</a></span></div>
          </div>` : `<div class="unk-body"><div class="unk-row"><span class="unk-k">Поиск</span>
            <span>По этому названию не удалось найти однозначную компанию в открытых источниках — нужно ваше решение.</span></div></div>`}
          <div class="chips" style="margin-top:10px">
            <span class="t-small t-muted" style="align-self:center">отнести к:</span>
            ${cats.map(c => `<button class="chip clickable" data-act="unk-set" data-brand="${esc(x.brand)}" data-cat="${esc(c)}">${c}</button>`).join("")}
          </div>
          <div class="filters unk-actions">
            <select data-act="unk-choose" data-brand="${esc(x.brand)}" title="Любая категория">
              <option value="">другая категория…</option>
              ${M.categories.filter(c => !cats.includes(c)).map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}
            </select>
            <button class="btn sm" data-act="unk-tx" data-brand="${esc(x.brand)}">Показать операции (${x.info.cnt})</button>
          </div>
        </div>`;
      }).join("") || `<div class="empty">все траты распознаны</div>`}
    </div>
  </div>`;
}

function pageOverview() {
  const b = B();
  const t = b.totals;
  const cats = M.spend_cats.map(c => ({ c, v: b.categories[c].total })).filter(x => x.v > 0).sort((a, b2) => b2.v - a.v);
  const top = cats.slice(0, 7);
  const rest = cats.slice(7).reduce((s, x) => s + x.v, 0);
  const donutItems = top.map(x => ({ label: x.c, value: x.v, color: catColor(x.c) }));
  if (rest > 0) donutItems.push({ label: "Остальные категории", value: rest, color: "#cfc8b8" });

  const mActive = b.months;
  const labels = mActive.map(mm => MONTHS_RU[+mm.slice(5) - 1] + (mm.slice(5) === "01" || mm === mActive[0] ? " " + mm.slice(2, 4) : ""));
  const recsTop = RECS().slice(0, 3);

  const isDemo = (function () { try { return localStorage.getItem("fin.demo.v1") === "1"; } catch (e) { return false; } })();
  return `
  ${isDemo ? note(`Это <b>демонстрационные данные</b>: операции выдуманы, чтобы показать, как всё выглядит.
    Загрузите свою выписку — раздел «Загрузить выписку» — и увидите свои цифры.`, "grey", "ⓘ") : ""}
  ${periodNote()}

  <div class="section" style="margin-top:16px">
    <div class="grid g4">
      ${kpi("Расходы за период", money(t.spend), `${nf.format(t.cnt)} ${plural(t.cnt, "покупка", "покупки", "покупок")}`)}
      ${kpi("В среднем в месяц", money(t.per_month),
        shortPeriod() ? `${DAYS()} дн. — цифра условная` : `прогноз ${money(t.per_year)} в год`, "accent")}
      ${kpi("Средний чек", money(t.avg), `средняя сумма одной покупки`)}
      ${kpi("Потенциал экономии", shortPeriod() ? "—" : money(totalSave()),
        shortPeriod() ? "период короче двух недель — выводов о привычках не делаем"
          : `в год по ${RECS().filter(r => !r.stopped).length} рекомендациям${isActive() ? "" : " за выбранный период"}`, "warn")}
    </div>
  </div>

  <div class="section">
    <div class="two-col">
      <div class="card">
        <div class="section-head" style="margin-bottom:6px">
          <h2>Расходы по месяцам</h2>
          <div class="hint">${money(t.per_month)} в среднем, ${money(t.per_year)} в год</div>
        </div>
        ${svgLine(b.series.total, labels, { h: 190, color: "#1c6b58" })}
        ${(() => {
          const vals = b.series.total;
          let mi = 0, ma = 0;
          vals.forEach((v, i) => { if (v > vals[ma]) ma = i; if (v < vals[mi] || !vals[mi]) mi = i; });
          return `<div class="kv"><span class="k">Самый дорогой месяц</span><span class="v">${monthLabel(b.months[ma], true)} — ${money(vals[ma])}</span></div>
            <div class="kv"><span class="k">Самый спокойный месяц</span><span class="v">${monthLabel(b.months[mi], true)} — ${money(vals[mi])}</span></div>
            <div class="kv"><span class="k">Медиана месяца</span><span class="v">${money(median(vals.filter(v => v > 0)))}</span></div>
            <div class="kv"><span class="k">В среднем за день</span><span class="v">${money(t.spend / b.days)} · ${(t.cnt / b.days).toFixed(1)} ${plural(t.cnt / b.days, "покупка", "покупки", "покупок")}</span></div>
            <div class="kv"><span class="k">Больше всего ушло в</span><span class="v">${topBrands(b, 1)[0] ? topBrands(b, 1)[0].b + " — " + money(topBrands(b, 1)[0].total) : "—"}</span></div>
            <div class="kv"><span class="k">Чаще всего покупали в</span><span class="v">${(() => { const t2 = Object.entries(b.brands).sort((x, y) => y[1].cnt - x[1].cnt)[0]; return t2 ? t2[0] + " — " + t2[1].cnt + " раз" : "—"; })()}</span></div>`;
        })()}
      </div>
      <div class="card">
        <div class="section-head" style="margin-bottom:6px"><h2>Куда уходят деньги</h2></div>
        ${donut(donutItems, t.spend)}
        <div class="legend" style="margin-top:4px">
          ${donutItems.map(i => `<span><i style="background:${i.color}"></i>${i.label} · ${(i.value / t.spend * 100).toFixed(0)}%</span>`).join("")}
        </div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><h2>Что заметила система</h2><div class="hint">найдено автоматически по вашим операциям</div></div>
    <div class="grid g2">
      ${buildInsights(b).map((x, i) => `
        <div class="card ins">
          <div class="ins-n">${String(i + 1).padStart(2, "0")}</div>
          <div class="ins-t">${x.title}</div>
          <div class="ins-x">${x.text}</div>
          ${(x.cat || x.brand) ? `<div class="chips" style="margin-top:9px">${x.cat ? catLink(x.cat) : ""}${x.brand ? brandLink(x.brand) : ""}</div>` : ""}
        </div>`).join("")}
    </div>
  </div>

  <div class="section">
    <div class="section-head"><h2>Три вывода, которые стоят денег</h2><div class="hint">нажмите на сумму, чтобы увидеть операции</div></div>
    <div class="grid g3">
      ${recsTop.map(r => `
        <div class="card clickable" data-act="rec" data-i="${RECS().indexOf(r)}" style="cursor:pointer">
          <div class="chip ${r.confidence === "высокая" ? "green" : "amber"}">${r.confidence} достоверность</div>
          <div style="font-size:14.5px;font-weight:600;margin:9px 0 5px">${r.title}</div>
          <div style="font-size:12.5px;color:var(--muted);line-height:1.5">${r.why}</div>
          <div style="font-size:19px;font-weight:600;margin-top:12px">${money(r.save_year)} <span style="font-size:12px;font-weight:400;color:var(--muted)">в год</span></div>
        </div>`).join("")}
    </div>
  </div>

  <div class="section">
    <div class="two-col">
      <div class="card">
        <div class="section-head" style="margin-bottom:4px"><h2>Крупнейшие категории</h2><div class="hint">доля от всех расходов</div></div>
        <table>
          <thead><tr><th>Категория</th><th class="num">Сумма</th><th class="num">Покупок</th><th class="num">Средний чек</th></tr></thead>
          <tbody>${cats.slice(0, 9).map(x => `<tr class="link">
            <td class="name">${catLink(x.c)}</td>
            <td class="num">${money(x.v)}</td>
            <td class="num t-muted">${b.categories[x.c].cnt}</td>
            <td class="num t-muted">${money(b.categories[x.c].avg)}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="card">
        <div class="section-head" style="margin-bottom:4px"><h2>Крупнейшие компании</h2><div class="hint">${b.brands ? "" : ""}сумма за период</div></div>
        ${hbars(topBrands(b, 8).map(x => ({ label: esc(x.b), value: x.total, sub: `${x.cnt} шт`, click: "brand:" + x.b })), { fmt: v => money(v) })}
      </div>
    </div>
  </div>

  <div class="section">
    <div class="card">
      <div class="section-head" style="margin-bottom:8px"><h2>Что происходит с деньгами в целом</h2></div>
      <div class="grid g4">
        <div><div class="kpi"><div class="label">Доходы в период</div><div class="value sm">${money(t.income)}</div></div></div>
        <div><div class="kpi"><div class="label">Ушло в инвестиции и вклады</div><div class="value sm">${money(t.invest)}</div></div></div>
        <div><div class="kpi"><div class="label">Переводы людям и в другие банки</div><div class="value sm">${money(t.p2p)}</div></div></div>
        <div><div class="kpi"><div class="label">Снято наличными</div><div class="value sm">${money(t.cash)}</div></div></div>
      </div>
      ${note(`Переводы между своими счетами, пополнения вкладов и брокерского счёта здесь <b>не считаются расходами</b> —
        это перемещение собственных денег. Возвраты покупок вычтены из расходов соответствующего периода,
        кэшбэк и проценты не считаются доходом.`, "grey", "ⓘ")}
    </div>
  </div>`;
}

function topBrands(b, n) {
  return Object.entries(b.brands).map(([k, v]) => ({ b: k, ...v })).sort((x, y) => y.total - x.total).slice(0, n);
}

function pageImprove() {
  const b = B();
  const totalSave = E.totalSaving(RECS());
  const recs = RECS();
  const stoppedRecs = recs.filter(r => r.stopped);
  const trend = b.brand_trend.filter(r => r.delta > 0).slice(0, 5);
  const subs = b.recurring.slice(0, 6);
  const an = b.anomalies.slice(0, 6);
  const YR = F.years || {};
  const y2026 = YR["2026"] || YR[Object.keys(YR).sort().pop()] || { spend: 0, cnt: 0 };
  const y2025 = YR["2025"] || { spend: 0, cnt: 0 };

  return `
  ${shortPeriod() ? note(`Выбран период всего ${DAYS()} ${DAYS() === 1 ? "день" : "дня"}. Для выводов о привычках этого мало:
    одна-две покупки не показывают закономерность (пункт 16.12 ТЗ). Выберите хотя бы две недели или месяц — тогда рекомендации
    будут опираться на статистику, а не на случай.`, "grey", "ⓘ") : ""}
  <div class="card" style="background:linear-gradient(160deg,#1e5b4d,#173f36);border-color:#173f36;color:#eef5f1;padding:22px">
    <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#a8c6bb">итог по рекомендациям</div>
    <div style="display:flex;align-items:flex-end;gap:26px;flex-wrap:wrap;margin-top:8px">
      <div>
        <div style="font-size:38px;font-weight:600;letter-spacing:-.02em;line-height:1">${money(totalSave)}</div>
        <div style="font-size:12.5px;color:#b9cfc7;margin-top:6px">потенциальная экономия за год при выполнении всех пунктов</div>
      </div>
      <div style="margin-left:auto;display:flex;gap:28px">
        <div><div style="font-size:12px;color:#a8c6bb">в месяц</div><div style="font-size:17px;font-weight:600">${money(totalSave / 12)}</div></div>
        <div><div style="font-size:12px;color:#a8c6bb">за 5 лет</div><div style="font-size:17px;font-weight:600">${money(totalSave * 5)}</div></div>
      </div>
    </div>
    <div style="font-size:12px;color:#b9cfc7;margin-top:14px;max-width:720px;line-height:1.55">
      Это математический расчёт: суммы берутся из ваших фактических операций, но никто не гарантирует,
      что сократить расходы удастся ровно на столько. Одна и та же операция не учитывается в двух рекомендациях.
      ${stoppedRecs.length ? `<br><br><b style="color:#dfe9e4">Ставки исключены из потенциала:</b> вы отметили, что больше не играете
      (${lastBetDate() ? "последнее списание " + lastBetDate() : "ставок в выписке нет"}), поэтому ${stoppedRecs.map(r => money(r.save_year)).join(", ")} в год сюда не входят —
      экономить на том, что уже прекратилось, нельзя.` : ""}
    </div>
  </div>

  <div class="section">
    <div class="section-head"><h2>Топ возможностей экономии</h2>
      <div class="hint">сортировка по годовой экономии · клик открывает операции, на которых построен расчёт</div></div>
    <div class="grid" style="gap:10px">
      ${recs.map((r, i) => {
        const cls = r.stopped ? "done" : (r.priority === "высокий" ? "hi" : r.priority === "средний" ? "mid" : "lo");
        return `<div class="rec ${cls}" data-act="rec" data-i="${i}">
          <div class="pri">${r.rank}</div>
          <div>
            <div class="title">${r.title}</div>
            <div class="why">${r.stopped ? `${r.stop_note}. В потенциал экономии эта строка не входит — трат больше нет.` : r.why}</div>
            <div class="meta">
              <span class="chip">${r.cat}</span>
              ${r.stopped ? `<span class="chip green">ставки прекращены</span>` : ""}
              <span class="chip ${r.priority === "высокий" ? "red" : r.priority === "средний" ? "amber" : ""}">приоритет: ${r.priority}</span>
              <span class="chip ${r.confidence === "высокая" ? "green" : r.confidence === "средняя" ? "amber" : ""}">достоверность: ${r.confidence}</span>
              <span class="chip blue">${nf.format(r.cnt_year)} операций в год</span>
              <span class="chip">сокращение ${r.pct}%</span>
            </div>
          </div>
          <div class="save">
            <div class="v">${r.stopped ? "0 ₽" : money(r.save_year)}</div>
            <div class="l">${r.stopped ? "уже не тратится" : `в год · ${money(r.save_month)}/мес`}</div>
          </div>
        </div>`;
      }).join("")}
    </div>
    <div class="t-small t-muted" style="margin-top:10px;line-height:1.6">
      Как считается приоритет: годовая экономия, скорректированная на достоверность данных, простоту выполнения
      и частоту проблемы. Высокий — первые три пункта, средний — 4–7, низкий — остальные.
    </div>
  </div>

  <div class="section">
    <div class="three-col">
      <div class="card">
        <div class="section-head" style="margin-bottom:6px"><h2>Быстрорастущие расходы</h2></div>
        <div class="t-small t-muted" style="margin-bottom:10px">вторая половина активного периода против первой</div>
        ${trend.map(r => `<div class="list-item">
          <div><div class="t">${brandLink(r.brand)}</div><div class="s">${r.cat} · ${r.first ? "было " + money(r.first) : "не было в первой половине"}</div></div>
          <div class="a" style="color:${r.first === 0 ? "#a8791a" : "#a8322a"}">${r.first === 0 ? "новая" : pct(r.pct)}</div>
        </div>`).join("") || `<div class="empty">нет данных</div>`}
      </div>

      <div class="card">
        <div class="section-head" style="margin-bottom:6px"><h2>Регулярные списания</h2></div>
        <div class="t-small t-muted" style="margin-bottom:10px">кандидаты на проверку, а не доказанные подписки</div>
        ${subs.map(r => `<div class="list-item">
          <div><div class="t">${brandLink(r.brand)}</div><div class="s">${r.period} · ${r.cnt} списаний</div></div>
          <div class="a">${money(r.yearly)}<div class="s" style="text-align:right">в год</div></div>
        </div>`).join("") || `<div class="empty">не найдено</div>`}
      </div>

      <div class="card">
        <div class="section-head" style="margin-bottom:6px"><h2>Необычные платежи</h2></div>
        <div class="t-small t-muted" style="margin-bottom:10px">сумма сильно выше типичной для категории</div>
        ${an.map(a => `<div class="list-item">
          <div><div class="t">${brandLink(a.brand)}</div><div class="s">${a.cat} · обычно ${money(a.median)}</div></div>
          <div class="a">${money(a.amount)}<div class="s" style="text-align:right">×${a.ratio}</div></div>
        </div>`).join("") || `<div class="empty">не найдено</div>`}
      </div>
    </div>
  </div>

  <div class="section">
    <div class="two-col">
      <div class="card" style="align-self:start">
        <div class="section-head" style="margin-bottom:6px"><h2>Расходы по годам</h2></div>
        <div class="t-small t-muted" style="margin-bottom:10px">2020 и 2026 — неполные годы</div>
        ${svgBars(Object.keys(F.years).map(y => F.years[y].spend),
          Object.keys(F.years).map(y => y),
          { h: 170, color: "#1c6b58", colors: Object.keys(F.years).map(y => y === "2026" ? "#b4552a" : "#9db8ad") })}
        <div class="t-small t-muted" style="margin-top:8px">
          В 2026 году (по 23 ноября) израсходовано ${money(y2026.spend)} против ${money(y2025.spend)} за весь 2025-й.
          ${state.src === "all"
            ? "Траты почти не выросли — карты просто поменялись ролями: до 2026 платили Сбером, с февраля 2026 — картой Т-Банка."
            : state.src === "sber"
              ? "В 2026 году карта Сбера почти перестала использоваться: траты ушли на карту Т-Банка."
              : "С февраля 2026 карта Т-Банка стала основной: до этого платили картой Сбера."}
        </div>
      </div>
      <div class="card">
        <div class="section-head" style="margin-bottom:6px"><h2>Год к году</h2>
          <div class="hint">все годы выписки · клик по строке открывает год</div></div>
        <table>
          <thead><tr><th>Год</th><th>Расходы</th><th>Покупок</th><th class="num">Средний чек</th><th class="num">Δ</th></tr></thead>
          <tbody>${(() => {
            const ys = Object.keys(F.years);
            return ys.map((y, i) => {
              const r = F.years[y], prev = i > 0 ? F.years[ys[i - 1]] : null;
              const partial = y === "2020" || y === M.period[1].slice(0, 4);
              const d = prev && prev.spend >= 5000 ? (r.spend - prev.spend) / prev.spend * 100 : null;
              return `<tr class="yrow" data-act="preset" data-p="${y}" style="cursor:pointer" title="Показать ${y} год">
                <td>${y}${partial ? ` <span class="chip" style="font-size:10px">неполный</span>` : ""}</td>
                <td>${money(r.spend)}</td>
                <td class="t-muted t-small">${nf.format(r.cnt)}</td>
                <td class="num">${r.cnt ? money(r.spend / r.cnt) : "—"}</td>
                <td class="num" style="color:${d === null ? "var(--muted)" : d > 0 ? "#a8322a" : "#1c6b58"}">${d === null ? "—" : (d > 0 ? "+" : "") + d.toFixed(0) + "%"}</td></tr>`;
            }).join("");
          })()}</tbody>
        </table>
        <div class="t-small t-muted" style="margin-top:10px">${state.src === "all"
          ? "Это полные суммы за каждый год по обеим картам. 2026-й — по 23 ноября, поэтому сравнивать его с целыми годами нельзя."
          : state.src === "sber"
            ? "Только карта Сбера: пик пришёлся на 2024–2025, в 2026-м ею почти перестали платить."
            : "Только карта Т-Банка: до 2026 она использовалась мало, поэтому 2026-й кажется резким скачком."}</div>
      </div>
    </div>
  </div>`;
}

function pageScen() {
  const scen = SCEN();
  const cats = M.consumption.filter(c => scen[c] && scen[c].year > 0);
  if (!state.scen.cats.size) {
    state.scen.cats.add(cats[0]);
    state.scen.cats.add("Продукты");
  }
  const pctv = state.scen.pct;
  const selected = [...state.scen.cats].filter(c => scen[c]);
  const curMonth = selected.reduce((s, c) => s + scen[c].month, 0);
  const saveMonth = curMonth * pctv / 100;
  const maxV = Math.max.apply(null, cats.map(c => scen[c].month).concat([1]));

  return `
  <div class="note blue"><div class="ico">✓</div><div>
    Выберите категории и процент. Считаем по фактическим расходам активного периода,
    пересчитанным на месяц и год. Это <b>математический сценарий</b>, а не обещание: экономия случится только если
    вы действительно сократите траты. Суммы за 5 лет даны без учёта процентов и инфляции.
  </div></div>

  <div class="section">
    <div class="two-col">
      <div class="card">
        <div class="section-head" style="margin-bottom:10px"><h2>Категории</h2>
          <div class="hint">${selected.length} выбрано · ${money(curMonth)}/мес</div></div>
        <div class="cat-pick">
          ${cats.map(c => `<button class="btn sm ${state.scen.cats.has(c) ? "active" : ""}" data-act="scen-cat" data-cat="${esc(c)}">
            ${esc(c)} <span style="opacity:.6">${short(scen[c].month)}</span></button>`).join("")}
        </div>
        <div style="margin-top:16px">
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <div class="label" style="font-size:12px;color:var(--muted)">Сокращение расходов</div>
            <div class="slider-val" id="pctVal">${pctv}%</div>
          </div>
          <input type="range" min="0" max="100" step="1" value="${pctv}" id="pctRange" data-act="pct">
          <div class="seg" style="margin-top:10px">
            ${[5, 10, 15, 20, 30].map(p => `<button class="btn sm ${pctv === p ? "active" : ""}" data-act="pct-set" data-p="${p}">${p}%</button>`).join("")}
          </div>
        </div>
        <div style="margin-top:16px">
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <div class="label" style="font-size:12px;color:var(--muted)">Своё значение (0–100%)</div>
            <input type="text" inputmode="numeric" id="pctCustom" style="width:76px;text-align:right" value="${pctv}" data-act="pct-custom">
          </div>
        </div>
      </div>

      <div class="scen-result">
        <div class="small">Экономия за месяц</div>
        <div class="big">${money(saveMonth)}</div>
        <div class="small">при сокращении на ${pctv}% по ${selected.length} категориям</div>
        <hr>
        <div class="scen-row"><span>За год</span><b>${money(saveMonth * 12)}</b></div>
        <div class="scen-row"><span>За 5 лет</span><b>${money(saveMonth * 60)}</b></div>
        <div class="scen-row"><span>Расходы сейчас</span><b>${money(curMonth * 12)} / год</b></div>
        <div class="scen-row"><span>После оптимизации</span><b>${money((curMonth - saveMonth) * 12)} / год</b></div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="card">
      <div class="section-head" style="margin-bottom:6px"><h2>Сейчас и после оптимизации</h2>
        <div class="hint">в месяц, по выбранным категориям</div></div>
      ${selected.length ? selected.map(c => `
        <div class="hbar-row">
          <div class="hbar-top"><span>${esc(c)}</span>
            <span class="t-muted">${money(scen[c].month)} → <b style="color:#1c6b58">${money(scen[c].month * (1 - pctv / 100))}</b></span></div>
          <div class="hbar-track" style="height:11px"><div class="hbar-fill" style="width:${(scen[c].month / maxV * 100).toFixed(1)}%"></div></div>
          <div class="hbar-track" style="height:5px;margin-top:2px"><div class="hbar-fill" style="width:${(scen[c].month * (1 - pctv / 100) / maxV * 100).toFixed(1)}%;background:#a8791a"></div></div>
        </div>`).join("") : `<div class="empty">выберите хотя бы одну категорию</div>`}
      <div class="legend" style="margin-top:12px">
        <span><i style="background:#1c6b58"></i>сейчас</span>
        <span><i style="background:#a8791a"></i>после сокращения на ${pctv}%</span>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="card">
      <div class="section-head" style="margin-bottom:8px"><h2>Сколько это накоплений</h2></div>
      <div class="grid g3" style="margin-top:10px">
        <div class="kv"><span class="k">Через год</span><span class="v">${money(saveMonth * 12)}</span></div>
        <div class="kv"><span class="k">Через 3 года</span><span class="v">${money(saveMonth * 36)}</span></div>
        <div class="kv"><span class="k">Через 5 лет</span><span class="v">${money(saveMonth * 60)}</span></div>
      </div>
      <div style="margin-top:14px">
      ${note(`«А что, если бы я экономил» — это сравнение с гипотетическим сценарием. Мы не считаем, что вы уже потеряли эти деньги:
        до сокращения расходов экономии не существует. Суммы за 5 лет — арифметика (месячная экономия × 60),
        без инвестиционного дохода и без учёта инфляции.`, "grey", "ⓘ")}
      </div>
    </div>
  </div>

  <div class="section">
    <div class="card">
      <div class="section-head"><h2>Накопленная экономия за 5 лет</h2>
        <div class="hint">если сокращение сохранится все 60 месяцев</div></div>
      ${(() => {
        const N = 60;
        const vals = Array.from({ length: N }, (_, i) => saveMonth * (i + 1));
        const labs = Array.from({ length: N }, (_, i) => (i + 1) % 12 === 0 ? (i + 1) / 12 + " г" : "");
        return svgLine(vals, labs, { h: 190, color: "#1c6b58", tickEvery: 12 });
      })()}
      <div class="grid g3" style="margin-top:10px">
        <div class="kv"><span class="k">Через 12 месяцев</span><span class="v">${money(saveMonth * 12)}</span></div>
        <div class="kv"><span class="k">Через 24 месяца</span><span class="v">${money(saveMonth * 24)}</span></div>
        <div class="kv"><span class="k">Через 60 месяцев</span><span class="v">${money(saveMonth * 60)}</span></div>
      </div>
      <div class="t-small t-muted" style="margin-top:8px">
        Сравнивать эту линию с реальным балансом на счёте нельзя: часть сэкономленного обычно уходит на другие траты.
        Это верхняя граница, а не прогноз накоплений.
      </div>
    </div>
  </div>`;
}

function pageHabits() {
  const b = B();
  const wd = b.weekday, hrs = b.hours, moy = b.moy.filter(x => x.avg > 0);
  const labels = b.months.map(mm => MONTHS_RU[+mm.slice(5) - 1]);
  const maxWd = wd.reduce((a, x) => x.sum > a.sum ? x : a, wd[0]);
  const minWd = wd.reduce((a, x) => x.sum < a.sum ? x : a, wd[0]);
  const maxH = hrs.reduce((a, x) => x.sum > a.sum ? x : a, hrs[0]);
  const maxMoy = moy.reduce((a, x) => x.avg > a.avg ? x : a, moy[0]);
  const cats = M.consumption.map(c => ({ c, ...b.categories[c] })).filter(x => x.total > 0).sort((a, b2) => b2.total - a.total);
  const chk = b.series.check;

  const growth = cats.map(x => {
    const s = x.series;
    const n = s.length;
    const h = Math.max(1, Math.floor(n / 2));
    const first = s.slice(0, h).reduce((a, v) => a + v, 0);
    const second = s.slice(n - h).reduce((a, v) => a + v, 0);
    return { c: x.c, first, second, delta: second - first, pct: first > 0 ? (second - first) / first * 100 : null, total: x.total };
  }).filter(x => x.total > 5000).sort((a, b2) => (b2.pct || -999) - (a.pct || -999));

  return `
  <div class="section" style="margin-top:0">
    <div class="grid g4">
      ${kpi("Покупок в месяц", nf.format(Math.round(b.totals.cnt / (b.months.length || 1))), `за ${b.months.length} мес.`)}      ${kpi("Средний чек", money(b.totals.avg), "среднее по всем операциям")}
      ${kpi("Самый дорогой день недели", maxWd.wd, `${money(maxWd.avg)} в среднем за день`, "warn")}
      ${kpi("Самый дорогой час", `${maxH.h}:00–${maxH.h}:59`, `${money(maxH.sum)} за период`)}
    </div>
  </div>

  <div class="section">
    <div class="two-col">
      <div class="card">
        <div class="section-head"><h2>Дни недели</h2><div class="hint">сумма расходов</div></div>
        ${svgBars(wd.map(x => x.sum), wd.map(x => x.wd), {
          h: 170, colors: wd.map(x => x.wd === maxWd.wd ? "#b4552a" : "#9db8ad")
        })}
        <div class="t-small t-muted" style="margin-top:8px">
          Больше всего трат в ${maxWd.wd} (${money(maxWd.sum)}), меньше всего — в ${minWd.wd} (${money(minWd.sum)}).
          Средний чек в ${maxWd.wd}: ${money(maxWd.avg)}.
        </div>
      </div>
      <div class="card">
        <div class="section-head"><h2>Месяцы года</h2><div class="hint">сколько уходило в каждом месяце</div></div>
        ${svgBars(moy.map(x => x.avg), moy.map(x => MONTHS_RU[x.m - 1]), {
          h: 170, colors: moy.map(x => x.avg === maxMoy.avg ? "#b4552a" : "#9db8ad")
        })}
        <div class="t-small t-muted" style="margin-top:8px">
          Дороже всего ${MONTHS_FULL[maxMoy.m - 1]} — в среднем ${money(maxMoy.avg)}.
          Данные короткие (один сезон), поэтому это наблюдение, а не закономерность.
        </div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="two-col">
      <div class="card">
        <div class="section-head"><h2>Часы покупок</h2><div class="hint">по времени операции</div></div>
        ${svgBars(hrs.map(x => x.sum), hrs.map(x => x.h), { h: 170, color: "#2f5f8f" })}
        <div class="t-small t-muted" style="margin-top:8px">
          Пик — ${maxH.h}:00. Поздние покупки (после 22:00) — ${money(hrs.filter(x => x.h >= 22).reduce((s, x) => s + x.sum, 0))}.
        </div>
      </div>
      <div class="card">
        <div class="section-head"><h2>Средний чек по месяцам</h2><div class="hint">сумма ÷ число покупок</div></div>
        ${svgLine(chk, labels, { h: 170, color: "#a8791a", fill: "rgba(168,121,26,.10)" })}
        <div class="t-small t-muted" style="margin-top:8px">
          Первый месяц (${monthLabel(b.months[0])}) может быть неполным, последний (${monthLabel(b.months[b.months.length - 1])}) — обрезан по 23 ноября.
        </div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="card">
      <div class="section-head"><h2>Что растёт быстрее всего</h2>
        <div class="hint">вторая половина периода против первой, по категориям</div></div>
      <table>
        <thead><tr><th>Категория</th><th class="num">Было</th><th class="num">Стало</th><th class="num">Изменение</th><th class="num">Всего</th></tr></thead>
        <tbody>${growth.map(g => `<tr class="link">
          <td class="name">${catLink(g.c)}</td>
          <td class="num t-muted">${money(g.first)}</td>
          <td class="num">${money(g.second)}</td>
          <td class="num" style="color:${(g.pct || 0) > 0 ? "#a8322a" : "#1c6b58"}">${g.pct === null ? "новая" : pct(g.pct)}</td>
          <td class="num t-muted">${money(g.total)}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <div class="card">
      <div class="section-head"><h2>Расходы, которые стали появляться чаще</h2>
        <div class="hint">по количеству покупок, вторая половина периода против первой</div></div>
      ${(() => {
        const freq = Object.entries(b.brands).map(kv => {
          const c = kv[1].counts, h = Math.max(1, Math.floor(c.length / 2));
          const first = c.slice(0, h).reduce((a, v) => a + v, 0);
          const second = c.slice(c.length - h).reduce((a, v) => a + v, 0);
          return { name: kv[0], cat: kv[1].cat, first, second, total: kv[1].cnt };
        }).filter(x => x.total >= 6 && x.second > x.first * 1.5 && x.second - x.first >= 3)
          .sort((a, b2) => (b2.second - b2.first) - (a.second - a.first)).slice(0, 10);
        return freq.length ? `<table>
          <thead><tr><th>Компания</th><th>Категория</th><th class="num">Было покупок</th><th class="num">Стало</th><th class="num">Всего</th></tr></thead>
          <tbody>${freq.map(x => `<tr class="link">
            <td class="name">${brandLink(x.name)}</td><td class="t-muted">${x.cat}</td>
            <td class="num t-muted">${x.first}</td>
            <td class="num" style="color:#a8322a">${x.second}</td>
            <td class="num t-muted">${x.total}</td></tr>`).join("")}
          </tbody></table>` : `<div class="empty">заметного роста частоты не найдено</div>`;
      })()}
      <div class="t-small t-muted" style="margin-top:10px">
        Здесь сравнивается не сумма, а число покупок: так видно, что вы стали чаще заходить в одно и то же место,
        даже если чек не вырос.
      </div>
    </div>
  </div>

  <div class="section">
    <div class="card">
      <div class="section-head"><h2>Покупательские привычки по годам</h2>
        <div class="hint">2020 и 2026 — неполные годы</div></div>
      <table>
        <thead><tr><th>Год</th><th class="num">Расходы</th><th class="num">Покупок</th><th class="num">Средний чек</th><th class="num">Инвестиции</th><th class="num">Переводы</th></tr></thead>
        <tbody>${Object.keys(F.years).map(y => {
          const r = F.years[y];
          return `<tr><td>${y}${y === "2020" || y === "2026" ? ' <span class="chip">неполный</span>' : ""}</td>
          <td class="num">${money(r.spend)}</td>
          <td class="num t-muted">${nf.format(r.cnt)}</td>
          <td class="num">${r.cnt ? money(r.spend / r.cnt) : "—"}</td>
          <td class="num t-muted">${money(r.invest)}</td>
          <td class="num t-muted">${money(r.p2p)}</td></tr>`;
        }).join("")}
        </tbody>
      </table>
      <div class="t-small t-muted" style="margin-top:10px">
        До 2025 года по этой карте почти не было покупок: деньги приходили и уходили на вклады, брокерский счёт и переводы.
        Сравнивать «сколько я тратил в 2022 и в 2026» по этой выписке нельзя — в 2022 вы платили другой картой.
      </div>
    </div>
  </div>`;
}

function pageCostly() {
  const b = B();
  const cats = M.consumption.map(c => ({ c, ...b.categories[c] })).filter(x => x.total > 0).sort((a, b2) => b2.total - a.total);
  const brands = topBrands(b, 25);
  const small = b.small;
  const smallCats = Object.entries(small.by_cat).sort((a, b2) => b2[1] - a[1]).slice(0, 8);
  const cmpCat = state.cmpCat && M.consumption.indexOf(state.cmpCat) >= 0 ? state.cmpCat : (cats[0] ? cats[0].c : "Продукты");
  const cmpRows = Object.entries(b.brands).filter(kv => kv[1].cat === cmpCat)
    .sort((x, y) => y[1].total - x[1].total).slice(0, 10);
  const cmpBase = median(cmpRows.filter(r => r[1].cnt >= 5).map(r => r[1].avg));

  return `
  <div class="section" style="margin-top:0">
    <div class="grid g4">
      ${kpi("Всего расходов", money(b.totals.spend), `${nf.format(b.totals.cnt)} операций`)}
      ${kpi("Мелкие покупки до 500 ₽", money(small.total), `${nf.format(small.cnt)} шт · ${small.share}% всех расходов`, "warn")}
      ${kpi("В среднем мелкие", money(small.avg), `${nf.format(small.cnt / (b.months.length || 1))} покупок в месяц`)}
      ${kpi("Регулярные платежи", money(b.recurring.reduce((s, r) => s + r.yearly, 0)), `${b.recurring.length} групп, оценка в год`)}
    </div>
  </div>

  <div class="section">
    <div class="card">
      <div class="section-head"><h2>Рейтинг категорий</h2>
        <div class="hint">сумма, частота и средний чек — клик открывает операции</div></div>
      ${hbars(cats.slice(0, 12).map(x => ({
        label: esc(x.c), value: x.total, sub: `${x.cnt} шт · ср. ${short(x.avg)}`, click: "cat:" + x.c
      })), {})}
    </div>
  </div>

  <div class="section">
    <div class="two-col">
      <div class="card">
        <div class="section-head"><h2>Компании, которые получают больше всех</h2></div>
        <table>
          <thead><tr><th>Компания</th><th class="num">Сумма</th><th class="num">Покупок</th><th class="num">Средний чек</th></tr></thead>
          <tbody>${brands.slice(0, 14).map(x => `<tr class="link">
            <td class="name">${brandLink(x.b)}<div class="s t-muted t-small">${x.cat}</div></td>
            <td class="num">${money(x.total)}</td>
            <td class="num t-muted">${x.cnt}</td>
            <td class="num t-muted">${money(x.avg)}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="card">
        <div class="section-head"><h2>Мелкие частые покупки</h2>
          <div class="hint">до 500 ₽ за операцию</div></div>
        <div class="t-small t-muted" style="margin-bottom:10px">
          ${money(small.total)} за период — это ${small.share}% всех расходов. Такие траты почти не замечаются,
          но в сумме дают ${money(small.per_month)} в месяц и ${money(small.per_year)} в год.
        </div>
        ${hbars(smallCats.map(([c, v]) => ({ label: esc(c), value: v, click: "cat:" + c })), {})}
        <div class="kv" style="margin-top:8px"><span class="k">В день / месяц / год</span>
          <span class="v">${money(small.per_day)} / ${money(small.per_month)} / ${money(small.per_year)}</span></div>
        <div class="kv"><span class="k">Средняя покупка · покупок в день</span>
          <span class="v">${money(small.avg)} · ${small.cnt_per_day}</span></div>
        <div class="kv"><span class="k">Если бы так было все 5 лет</span><span class="v">${money(small.per_5y)}</span></div>
        <table style="margin-top:10px">
          <thead><tr><th>Сократить мелкие траты на</th><th class="num">В месяц</th><th class="num">В год</th><th class="num">За 5 лет</th></tr></thead>
          <tbody>${[10, 20, 30, 50].map(p => `<tr>
            <td>${p}%</td>
            <td class="num">${money(small.per_month * p / 100)}</td>
            <td class="num">${money(small.per_year * p / 100)}</td>
            <td class="num">${money(small.per_5y * p / 100)}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="card">
      <div class="section-head"><h2>Разные магазины внутри одной категории</h2>
        <div class="hint">средний чек по компаниям — ориентир, а не цена одного товара</div></div>
      <div class="filters" style="margin-bottom:10px">
        <select data-act="cmp-cat">
          ${M.consumption.map(c => `<option value="${esc(c)}" ${cmpCat === c ? "selected" : ""}>${esc(c)}</option>`).join("")}
        </select>
        <span class="t-small t-muted">${cmpRows.length} компаний</span>
      </div>
      ${cmpRows.length ? `<table>
        <thead><tr><th>Компания</th><th class="num">Покупок</th><th class="num">Средний чек</th><th class="num">Всего</th><th class="num">К медиане</th></tr></thead>
        <tbody>${cmpRows.map(([name, v]) => {
          const diff = cmpBase ? (v.avg - cmpBase) / cmpBase * 100 : 0;
          return `<tr class="link">
            <td class="name">${brandLink(name)}</td>
            <td class="num t-muted">${v.cnt}</td>
            <td class="num">${money(v.avg)}</td>
            <td class="num t-muted">${money(v.total)}</td>
            <td class="num" style="color:${diff > 25 ? "#a8322a" : diff > 8 ? "#a8791a" : "#1c6b58"}">${v.cnt < 5 ? "—" : (diff > 0 ? "+" : "") + diff.toFixed(0) + "%"}</td></tr>`;
        }).join("")}
        </tbody>
      </table>` : `<div class="empty">в этой категории нет данных по компаниям</div>`}
      <div class="t-small t-muted" style="margin-top:10px">
        Средний чек зависит от того, что именно вы покупаете в каждом магазине: в «магазине у дома» обычно
        берут пару позиций, в гипермаркете — недельный запас. Поэтому таблица показывает привычки трат,
        а не «где дешевле». Для сравнения цен нужен чек, а выписка его не содержит.
      </div>
    </div>
  </div>

  <div class="section">
    <div class="card">
      <div class="section-head"><h2>Небольшие регулярные расходы, которые накапливаются</h2>
        <div class="hint">группы с частыми списаниями и небольшим чеком</div></div>
      <table>
        <thead><tr><th>Компания</th><th>Категория</th><th class="num">Списаний</th><th class="num">Типичная сумма</th><th class="num">Всего</th><th class="num">В год</th></tr></thead>
        <tbody>${b.recurring.filter(r => r.typical <= 1500).slice(0, 12).map(r => `<tr class="link">
          <td class="name">${brandLink(r.brand)}<div class="s t-muted t-small">${r.period}</div></td>
          <td>${r.cat}</td>
          <td class="num t-muted">${r.cnt}</td>
          <td class="num">${money(r.typical)}</td>
          <td class="num t-muted">${money(r.total)}</td>
          <td class="num">${money(r.yearly)}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">не найдено</td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;
}

function pageSubs() {
  const b = B();
  const subs = b.recurring;
  const dup = b.dups;
  const totalYear = subs.reduce((s, r) => s + r.yearly, 0);

  return `
  <div class="note"><div class="ico">!</div><div>
    Банковская выписка видит списание, но не видит, пользуетесь ли вы сервисом. Поэтому все группы ниже —
    <b>кандидаты на проверку</b>, а не доказанные «ненужные подписки». Мы не утверждаем, что подписка не используется.
  </div></div>

  <div class="section">
    <div class="grid g4">
      ${kpi("Групп с регулярностью", subs.length, "одинаковый интервал и сумма")}
      ${kpi("Оценка в год", money(totalYear), "включая группы с малым числом наблюдений")}
      ${kpi("В месяц", money(totalYear / 12), "по медианной сумме")}
      ${kpi("Повторных списаний", dup.length, "одинаковая сумма в течение 2 дней", "warn")}
    </div>
  </div>

  <div class="section">
    <div class="card">
      <div class="section-head"><h2>Регулярные списания</h2>
        <div class="hint">периодичность оценена по медианному интервалу между платежами</div></div>
      <table>
        <thead><tr><th>Компания</th><th>Периодичность</th><th class="num">Типичная сумма</th><th class="num">Списаний</th><th class="num">В месяц</th><th class="num">В год</th><th>Последнее</th><th>Статус</th></tr></thead>
        <tbody>${subs.map(r => {
          const perMonth = r.period === "неделя" ? r.typical * 4.33 : r.period === "2 недели" ? r.typical * 2.17
            : r.period === "месяц" ? r.typical : r.period === "квартал" ? r.typical / 3 : r.typical / 2;
          const conf = r.cnt >= 8 ? "высокая" : r.cnt >= 5 ? "средняя" : "низкая";
          return `<tr class="link">
            <td class="name">${brandLink(r.brand)}<div class="s t-muted t-small">${r.cat}</div></td>
            <td><span class="chip">${r.period}</span></td>
            <td class="num">${money(r.typical)}</td>
            <td class="num t-muted">${r.cnt}<div class="t-small ${conf === "низкая" ? "t-muted" : ""}">${conf === "низкая" ? "мало данных" : conf}</div></td>
            <td class="num t-muted">${money(perMonth)}</td>
            <td class="num">${money(r.yearly)}</td>
            <td class="num t-muted t-small">${fmtDate(r.last)}</td>
            <td>${r.ready ? '<span class="chip green">активно</span>' : '<span class="chip">давно не было</span>'}</td>
          </tr>`;
        }).join("") || `<tr><td colspan="8" class="empty">не найдено</td></tr>`}
        </tbody>
      </table>
      <div class="t-small t-muted" style="margin-top:10px">
        «В год» — оценка: типичная сумма × периодичность. Если списаний было мало (2–4), оценка за год
        завышена или занижена: такой платёж мог быть разовым. Строки с пометкой «мало данных» — повод
        проверить, а не факт подписки.
      </div>
    </div>
  </div>

  <div class="section">
    <div class="two-col">
      <div class="card">
        <div class="section-head"><h2>Повторные списания</h2><div class="hint">та же компания и сумма с разницей до 2 дней</div></div>
        ${dup.length ? dup.slice(0, 10).map(d => `<div class="list-item">
          <div><div class="t">${brandLink(d.brand)}</div><div class="s">${fmtDate(d.prev)} и ${fmtDate(d.date)} · ${d.cat}</div></div>
          <div class="a">${money(d.amount)}</div></div>`).join("") : `<div class="empty">не найдено</div>`}
        <div class="t-small t-muted" style="margin-top:10px">
          Иногда это нормально: две чашки кофе в один день. Стоит проверить, если сумма крупная и повторяется системно.
        </div>
      </div>
      <div class="card">
        <div class="section-head"><h2>Что проверить в первую очередь</h2></div>
        ${subs.slice(0, 5).map(r => `<div class="list-item">
          <div><div class="t">${brandLink(r.brand)}</div><div class="s">${money(r.typical)} · ${r.period}</div></div>
          <div class="a">${money(r.yearly)}<div class="s" style="text-align:right">в год</div></div></div>`).join("")}
        ${note(`Если отключить всё перечисленное, экономия составит до ${money(totalYear)} в год. Но часть сервисов
          вам нужна — решение за вами, поэтому это верхняя граница, а не рекомендация.`, "grey", "ⓘ")}
      </div>
    </div>
  </div>`;
}

function pageAnom() {
  const b = B();
  const an = b.anomalies, dups = b.dups, spikes = b.spikes;
  const fees = M.categories.map((c, i) => c).includes("Комиссии банка") ? b.categories["Комиссии банка"] : null;
  const feeTx = F.tx.filter(t => M.categories[t[5]] === "Комиссии банка" && t[3] < 0);

  return `
  <div class="note grey"><div class="ico">ⓘ</div><div>
    Мы не называем операции мошенническими: выписка не даёт для этого оснований. Здесь только то, что
    статистически выбивается из ваших же привычек — статус «требует проверки».
  </div></div>

  <div class="section">
    <div class="grid g4">
      ${kpi("Необычно крупных", an.length, "сумма выше типичной в 3+ раза")}
      ${kpi("Повторных списаний", dups.length, "одинаковая сумма в течение 2 дней")}
      ${kpi("Всплесков по месяцам", spikes.length, "месяц дороже медианы в 1,3 раза")}
      ${kpi("Комиссий банка", money(b.categories["Комиссии банка"].total), `${b.categories["Комиссии банка"].cnt} списаний`)}
    </div>
  </div>

  <div class="section">
    <div class="card">
      <div class="section-head"><h2>Крупные разовые операции</h2>
        <div class="hint">сравнение с типичной суммой в этой же категории</div></div>
      <table>
        <thead><tr><th>Дата</th><th>Компания</th><th>Категория</th><th class="num">Сумма</th><th class="num">Обычно</th><th class="num">Превышение</th></tr></thead>
        <tbody>${an.slice(0, 18).map(a => `<tr>
          <td class="t-muted t-small">${fmtDate(a.date)}</td>
          <td>${brandLink(a.brand)}</td>
          <td class="t-muted">${a.cat}</td>
          <td class="num">${money(a.amount)}</td>
          <td class="num t-muted">${money(a.median)}</td>
          <td class="num" style="color:#a8322a">×${a.ratio}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">не найдено</td></tr>`}
        </tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <div class="three-col">
      <div class="card">
        <div class="section-head" style="margin-bottom:6px"><h2>Всплески месяцев</h2></div>
        ${spikes.map(s => `<div class="list-item"><div><div class="t">${monthLabel(s.month, true)}</div>
          <div class="s">в ${s.ratio} раза дороже медианы</div></div><div class="a">${money(s.spend)}</div></div>`).join("") || `<div class="empty">нет</div>`}
      </div>
      <div class="card">
        <div class="section-head" style="margin-bottom:6px"><h2>Повторные суммы</h2></div>
        ${dups.slice(0, 8).map(d => `<div class="list-item"><div><div class="t">${brandLink(d.brand)}</div>
          <div class="s">${fmtDate(d.prev)} → ${fmtDate(d.date)}</div></div><div class="a">${money(d.amount)}</div></div>`).join("") || `<div class="empty">нет</div>`}
      </div>
      <div class="card">
        <div class="section-head" style="margin-bottom:6px"><h2>Комиссии банка</h2></div>
        ${feeTx.slice(0, 8).map(t => `<div class="list-item"><div><div class="t">${esc(t[7]).slice(0, 46)}</div>
          <div class="s">${t[0]}</div></div><div class="a">${money(-t[3])}</div></div>`).join("") || `<div class="empty">нет</div>`}
        <div class="t-small t-muted" style="margin-top:10px">
          Итого ${money(fees.total)} за период. Регулярные платы за оповещения и обслуживание можно отключить в приложении банка.
        </div>
      </div>
    </div>
  </div>`;
}

function pageReports() {
  const b = B();
  const months = b.months;
  if (!state.reportMonth || !months.includes(state.reportMonth)) state.reportMonth = months[months.length - 1];
  if (!state.reportCompare || !months.includes(state.reportCompare)) {
    const i = months.indexOf(state.reportMonth);
    state.reportCompare = months[Math.max(0, i - 1)];
  }
  const mm = state.reportMonth, cmp = state.reportCompare;
  const r = b.reports[mm], rc = b.reports[cmp];
  const idx = months.indexOf(mm);
  const catSeries = c => b.categories[c].series[idx] || 0;

  const recPct = {}; RECS().forEach(x => { if (!x.stopped) recPct[x.cat] = Math.max(recPct[x.cat] || 0, x.pct); });
  const potential = M.consumption.reduce((s, c) => s + (catSeries(c) * (recPct[c] || 0) / 100), 0);
  const partial = mm === "2026-11" || mm === "2020-10";
  const recsMonth = RECS().filter(r => !r.stopped && b.reports[mm].top_cats.some(tc => tc[0] === r.cat)).slice(0, 3);

  const monthOptions = months.map(m => `<option value="${m}" ${m === mm ? "selected" : ""}>${monthLabel(m, true)}</option>`).join("");
  const cmpOptions = months.map(m => `<option value="${m}" ${m === cmp ? "selected" : ""}>${monthLabel(m, true)}</option>`).join("");

  return `
  <div class="section" style="margin-top:0">
    <div class="filters" style="justify-content:space-between">
      <div class="filters">
        <span class="t-small t-muted">Отчёт за</span>
        <select id="reportMonth" data-act="report-month">${monthOptions}</select>
      </div>
      <div class="filters">
        <span class="t-small t-muted">Сравнить с</span>
        <select id="reportCompare" data-act="report-compare">${cmpOptions}</select>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="grid g4">
      ${kpi("Потрачено", money(r.spend), `${nf.format(r.cnt)} покупок${partial ? " · месяц неполный" : ""}`)}
      ${kpi("Заработано", money(r.income), "поступления на счёт", "green")}
      ${kpi("Средний чек", money(r.check), "за месяц")}
      ${kpi("Потенциал экономии", money(potential), "если применить проценты из рекомендаций", "warn")}
    </div>
    <div class="grid g4" style="margin-top:10px">
      ${kpi("Изменение к прошлому месяцу", r.delta === null ? "—" : (r.delta > 0 ? "+" : "") + money(r.delta),
        r.prev_spend ? `было ${money(r.prev_spend)}` : "нет предыдущего месяца", r.delta > 0 ? "warn" : "")}
      ${kpi("Ушло в инвестиции и вклады", money(r.invest), "это не потребление")}
      ${kpi("Переводы людям и в другие банки", money(r.p2p), "по данным месяца")}
      ${kpi("Необычных операций", r.anomalies, "сумма выше типичной для категории")}
    </div>
  </div>

  ${recsMonth.length ? `<div class="section"><div class="card">
    <div class="section-head"><h2>Что рекомендовано по этому месяцу</h2>
      <div class="hint">рекомендации по категориям, которые были заметны в ${monthLabel(mm, true)}</div></div>
    ${recsMonth.map(r => `<div class="list-item">
      <div><div class="t">${r.title}</div><div class="s">${money(catSeries(r.cat))} ушло в этом месяце · сокращение ${r.pct}%</div></div>
      <div class="a">${money(catSeries(r.cat) * r.pct / 100)}<div class="s" style="text-align:right">можно сохранить</div></div>
    </div>`).join("")}
  </div></div>` : ""}

  <div class="section">
    <div class="two-col">
      <div class="card">
        <div class="section-head"><h2>${monthLabel(mm, true)}</h2><div class="hint">самые дорогие категории</div></div>
        <table>
          <thead><tr><th>Категория</th><th class="num">Сумма</th><th class="num">Доля месяца</th></tr></thead>
          <tbody>${r.top_cats.map(([c, v]) => `<tr class="link"><td class="name">${catLink(c)}</td>
            <td class="num">${money(v)}</td><td class="num t-muted">${(v / r.spend * 100).toFixed(0)}%</td></tr>`).join("")}
          </tbody>
        </table>
        <div class="section-head" style="margin:16px 0 6px"><h2>Кому ушло больше всего</h2></div>
        <table>
          <tbody>${r.top_brands.map(([bn, v]) => `<tr class="link"><td class="name">${brandLink(bn)}</td>
            <td class="num">${money(v)}</td><td class="num t-muted">${(v / r.spend * 100).toFixed(0)}%</td></tr>`).join("")}
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="section-head"><h2>Сравнение двух месяцев</h2><div class="hint">${monthLabel(cmp, true)} → ${monthLabel(mm, true)}</div></div>
        <table>
          <thead><tr><th>Показатель</th><th class="num">${monthLabel(cmp)}</th><th class="num">${monthLabel(mm)}</th><th class="num">Δ</th></tr></thead>
          <tbody>
            <tr><td>Расходы</td><td class="num t-muted">${money(rc.spend)}</td><td class="num">${money(r.spend)}</td>
              <td class="num" style="color:${r.spend > rc.spend ? "#a8322a" : "#1c6b58"}">${pct(rc.spend ? (r.spend - rc.spend) / rc.spend * 100 : null)}</td></tr>
            <tr><td>Покупок</td><td class="num t-muted">${rc.cnt}</td><td class="num">${r.cnt}</td>
              <td class="num" style="color:${r.cnt > rc.cnt ? "#a8322a" : "#1c6b58"}">${rc.cnt ? pct((r.cnt - rc.cnt) / rc.cnt * 100) : "—"}</td></tr>
            <tr><td>Средний чек</td><td class="num t-muted">${money(rc.check)}</td><td class="num">${money(r.check)}</td>
              <td class="num" style="color:${r.check > rc.check ? "#a8322a" : "#1c6b58"}">${rc.check ? pct((r.check - rc.check) / rc.check * 100) : "—"}</td></tr>
            <tr><td>Необычных операций</td><td class="num t-muted">${rc.anomalies}</td><td class="num">${r.anomalies}</td><td class="num">—</td></tr>
          </tbody>
        </table>

        <div class="section-head" style="margin:18px 0 6px"><h2>Что изменилось по категориям</h2></div>
        <table>
          <thead><tr><th>Категория</th><th class="num">Δ сумма</th></tr></thead>
          <tbody>${(() => {
            const i1 = months.indexOf(cmp), i2 = months.indexOf(mm);
            const rows = M.consumption.map(c => ({ c, d: (b.categories[c].series[i2] || 0) - (b.categories[c].series[i1] || 0) }))
              .filter(x => Math.abs(x.d) > 100).sort((a, b2) => Math.abs(b2.d) - Math.abs(a.d)).slice(0, 6);
            return rows.map(x => `<tr class="link"><td class="name">${catLink(x.c)}</td>
              <td class="num" style="color:${x.d > 0 ? "#a8322a" : "#1c6b58"}">${x.d > 0 ? "+" : ""}${money(x.d)}</td></tr>`).join("");
          })()}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="card">
      <div class="section-head"><h2>Все месяцы</h2><div class="hint">клик по строке открывает отчёт</div></div>
      <table>
        <thead><tr><th>Месяц</th><th class="num">Расходы</th><th class="num">Покупок</th><th class="num">Средний чек</th><th class="num">К прошлому</th></tr></thead>
        <tbody>${months.slice().reverse().map(m => {
          const rr = b.reports[m];
          return `<tr class="link ${m === mm ? "active-row" : ""}" data-act="report-pick" data-m="${m}">
            <td>${monthLabel(m, true)}</td><td class="num">${money(rr.spend)}</td>
            <td class="num t-muted">${rr.cnt}</td><td class="num t-muted">${money(rr.check)}</td>
            <td class="num" style="color:${(rr.delta || 0) > 0 ? "#a8322a" : "#1c6b58"}">${rr.delta === null ? "—" : (rr.delta > 0 ? "+" : "") + money(rr.delta)}</td></tr>`;
        }).join("")}
        </tbody>
      </table>
    </div>
  </div>`;
}

function pageProfile() {
  const p = E.profileOf(B());
  const b = B();
  const cats = M.consumption.map(c => ({ c, ...b.categories[c] })).filter(x => x.total > 0).sort((a, b2) => b2.total - a.total);
  const top3 = cats.slice(0, 3).reduce((s, x) => s + x.total, 0);

  return `
  <div class="grid g4">
    ${kpi("Регулярные расходы", p.regular_share + "%", `≈ ${money(p.regular_yearly)} в год (оценка)`)}
    ${kpi("Переменные расходы", p.variable_share + "%", "покупки без чёткой периодичности")}
    ${kpi("Стабильность", p.stability_cv === null ? "—" : (p.stability_cv < 0.25 ? "высокая" : p.stability_cv < 0.5 ? "средняя" : "низкая"),
      `коэффициент вариации ${p.stability_cv ?? "—"}`)}
    ${kpi("Концентрация", p.top10_share + "%", "доля топ-10 компаний", "warn")}
  </div>

  <div class="section">
    <div class="two-col">
      <div class="card">
        <div class="section-head"><h2>Структура расходов</h2><div class="hint">регулярные против переменных</div></div>
        <div class="hbar-row">
          <div class="hbar-top"><span>Регулярные (подписки, связь, комиссии)</span><span>${p.regular_share}%</span></div>
          <div class="hbar-track" style="height:12px"><div class="hbar-fill" style="width:${p.regular_share}%;background:#2f5f8f"></div></div>
        </div>
        <div class="hbar-row">
          <div class="hbar-top"><span>Переменные (магазины, кафе, покупки)</span><span>${p.variable_share}%</span></div>
          <div class="hbar-track" style="height:12px"><div class="hbar-fill" style="width:${p.variable_share}%;background:#1c6b58"></div></div>
        </div>
        <div class="kv"><span class="k">3 крупнейшие категории</span><span class="v">${(top3 / b.totals.spend * 100).toFixed(0)}% всех расходов</span></div>
        <div class="kv"><span class="k">Индекс концентрации (HHI)</span><span class="v">${p.hhi} из 10 000</span></div>
        <div class="kv"><span class="k">Нераспознанные операции</span><span class="v">${p.uncategorized_share}%</span></div>
      </div>
      <div class="card">
        <div class="section-head"><h2>Средний чек по годам</h2></div>
        ${svgBars(Object.keys(F.years).map(y => F.years[y].cnt ? F.years[y].spend / F.years[y].cnt : 0),
          Object.keys(F.years), { h: 160, colors: Object.keys(F.years).map(y => y === "2026" ? "#1c6b58" : "#9db8ad") })}
        <div class="t-small t-muted" style="margin-top:8px">
          Чеки за 2021–2024 почти не показательны: покупок были единицы. Реальный средний чек — ${money(p.avg_check)}.
        </div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="card">
      <div class="section-head"><h2>Динамика расходов</h2><div class="hint">${b.months.length} месяцев активного периода</div></div>
      ${svgLine(b.series.total, b.months.map(mm => MONTHS_RU[+mm.slice(5) - 1]), { h: 170 })}
      <div class="grid g3" style="margin-top:12px">
        <div class="kv"><span class="k">Минимум</span><span class="v">${money(Math.min.apply(null, b.series.total.filter(v => v > 0)))}</span></div>
        <div class="kv"><span class="k">Максимум</span><span class="v">${money(Math.max.apply(null, b.series.total))}</span></div>
        <div class="kv"><span class="k">Медиана месяца</span><span class="v">${money(median(b.series.total.filter(v => v > 0)))}</span></div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="card">
      <div class="section-head"><h2>Что этот профиль не говорит</h2></div>
      <div class="grid g2">
        <div>
          ${note(`Это <b>не кредитный рейтинг</b> и не оценка «финансового здоровья». Выписка одного счёта
            не знает о других счетах, кредитах, имуществе и доходах. Все числа описывают только эти операции.`, "grey", "ⓘ")}
        </div>
        <div>
          ${note(`Нераспознанные операции (${p.uncategorized_share}%) — это магазины с непонятными названиями
            вроде «ИП Иванов». Они честно исключены из выводов по категориям, а не разложены наугад.`, "grey", "ⓘ")}
        </div>
      </div>
    </div>
  </div>`;
}

function pageTx() {
  const b = B();
  const f = state.txFilter;
  const monthsSet = new Set(b.months);
  const catName = t => overrides[t[4]] || M.categories[t[5]];
  let rows = F.tx.filter(t => monthsSet.has(t[0].slice(0, 7)));
  if (state.src !== "all") rows = rows.filter(t => (state.src === "tb" ? (t[8] || 0) === 0 : (t[8] || 0) === 1));

  if (f.kind === "spend") rows = rows.filter(t => t[3] < 0 && (catName(t) === "Комиссии банка" || M.consumption.includes(catName(t))));
  else if (f.kind === "transfers") rows = rows.filter(t => ["p2p", "ext_bank", "internal", "in_in", "invest_out", "invest_in", "deposit_in"].includes(t[6]));

  if (f.cat !== "all") rows = rows.filter(t => catName(t) === f.cat);
  if (f.brand !== "all") rows = rows.filter(t => t[4] === f.brand);
  if (f.q) {
    const q = f.q.toLowerCase();
    rows = rows.filter(t => (t[4] + " " + t[7]).toLowerCase().includes(q));
  }
  const amin = +f.amin || 0, amax = +f.amax || 0;
  if (amin > 0) rows = rows.filter(t => Math.abs(t[3]) >= amin);
  if (amax > 0) rows = rows.filter(t => Math.abs(t[3]) <= amax);

  if (f.sort === "sum-desc") rows = rows.slice().sort((x, y) => y[3] - x[3]);
  else if (f.sort === "sum-asc") rows = rows.slice().sort((x, y) => x[3] - y[3]);
  else rows = rows.slice().sort((x, y) => (x[0] < y[0] ? 1 : x[0] > y[0] ? -1 : 0));

  const spend = rows.filter(t => t[3] < 0).reduce((s, t) => s - t[3], 0);
  const spendCnt = rows.filter(t => t[3] < 0).length;
  const brandNames = Object.keys(b.brands).sort((x, y) => b.brands[y].total - b.brands[x].total);
  const catOptions = M.categories.map(c => `<option value="${esc(c)}" ${f.cat === c ? "selected" : ""}>${esc(c)}</option>`).join("");
  const brandOptions = brandNames.map(c => `<option value="${esc(c)}" ${f.brand === c ? "selected" : ""}>${esc(c)}</option>`).join("");
  const active = f.cat !== "all" || f.brand !== "all" || f.q || amin || amax || f.kind !== "spend";

  return `
  <div class="card">
    <div class="filters">
      <input type="search" placeholder="Поиск по компании или описанию" value="${esc(f.q)}" id="txQ" data-act="tx-q" style="flex:1;min-width:200px">
      <select data-act="tx-cat"><option value="all">Все категории</option>${catOptions}</select>
      <select data-act="tx-brand"><option value="all">Все магазины</option>${brandOptions}</select>
    </div>
    <div class="filters" style="margin-top:8px">
      <div class="seg">
        <button class="btn sm ${f.kind === "spend" ? "active" : ""}" data-act="tx-kind" data-k="spend">Покупки</button>
        <button class="btn sm ${f.kind === "transfers" ? "active" : ""}" data-act="tx-kind" data-k="transfers">Переводы</button>
        <button class="btn sm ${f.kind === "all" ? "active" : ""}" data-act="tx-kind" data-k="all">Всё</button>
      </div>
      <select data-act="tx-sort">
        <option value="date" ${f.sort === "date" ? "selected" : ""}>Сначала новые</option>
        <option value="sum-desc" ${f.sort === "sum-desc" ? "selected" : ""}>Сумма: больше</option>
        <option value="sum-asc" ${f.sort === "sum-asc" ? "selected" : ""}>Сумма: меньше</option>
      </select>
      <label class="t-small t-muted" style="display:inline-flex;align-items:center;gap:6px">от
        <input type="number" min="0" step="100" placeholder="0" value="${f.amin || ""}" id="txAmin" data-act="tx-amin" style="width:88px">
      </label>
      <label class="t-small t-muted" style="display:inline-flex;align-items:center;gap:6px">до
        <input type="number" min="0" step="100" placeholder="∞" value="${f.amax || ""}" id="txAmax" data-act="tx-amax" style="width:88px">
      </label>
      ${active ? `<button class="btn sm" data-act="tx-reset">Сбросить фильтры</button>` : ""}
    </div>
    <div class="t-small t-muted" style="margin:12px 0 4px">
      ${nf.format(rows.length)} операций${spendCnt ? ` · расходов на ${money(spend)} · средний ${money(spend / spendCnt)}` : ""} · период ${monthLabel(b.months[0])} — ${monthLabel(b.months[b.months.length - 1])}
    </div>
    <table>
      <thead><tr><th>Дата</th><th>Компания / описание</th><th>Категория</th><th>Банк</th><th class="num">Сумма</th></tr></thead>
      <tbody>${rows.slice(0, 400).map(t => {
        const cat = catName(t);
        return `<tr>
          <td class="t-muted t-small" style="white-space:nowrap">${t[0].slice(8, 10)}.${t[0].slice(5, 7)}.${t[0].slice(0, 4)}${t[1] >= 0 ? `<div class="t-small t-muted">${String(t[1]).padStart(2, "0")}:${String(t[2] % 60).padStart(2, "0")}</div>` : ""}</td>
          <td>${esc(t[4])}<div class="t-small t-muted">${esc(t[7]).slice(0, 80)}</div></td>
          <td><span class="chip" style="border-left:3px solid ${catColor(cat)}">${esc(cat)}</span></td>
          <td class="t-small t-muted">${(t[8] || 0) === 1 ? "Сбер" : "Т-Банк"}</td>
          <td class="num" style="color:${t[3] < 0 ? "var(--ink)" : "#1c6b58"}">${money(t[3])}</td></tr>`;
      }).join("") || `<tr><td colspan="5" class="empty">под такие фильтры ничего не подходит</td></tr>`}
      </tbody>
    </table>
    ${rows.length > 400 ? `<div class="t-small t-muted" style="padding:12px 0">Показаны первые 400 из ${nf.format(rows.length)}. Уточните фильтр.</div>` : ""}
  </div>`;
}

/* ------------------------------ modal ------------------------------ */
function txRowsHtml(ids) {
  const rows = ids.map(i => F.tx[i]).sort((a, b) => a[0] < b[0] ? 1 : -1);
  const total = rows.reduce((s, t) => s + (t[3] < 0 ? -t[3] : 0), 0);
  return `<table>
    <thead><tr><th>Дата</th><th>Описание</th><th class="num">Сумма</th></tr></thead>
    <tbody>${rows.slice(0, 200).map(t => `<tr>
      <td class="t-muted t-small" style="white-space:nowrap">${t[0].slice(8, 10)}.${t[0].slice(5, 7)}.${t[0].slice(0, 4)}</td>
      <td>${esc(t[4])}<div class="t-small t-muted">${esc(t[7]).slice(0, 90)}</div></td>
      <td class="num">${money(t[3])}</td></tr>`).join("")}</tbody>
  </table>
  <div class="t-small t-muted" style="padding-top:12px">Показано ${Math.min(ids.length, 200)} из ${ids.length} операций · итого ${money(total)}</div>`;
}

function openModal(title, sub, bodyHtml) {
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalSub").textContent = sub || "";
  document.getElementById("modalBody").innerHTML = bodyHtml;
  document.getElementById("modal").hidden = false;
  try { history.pushState({ ui: "modal" }, ""); } catch (e) { }
}
function closeModal(fromHistory) {
  document.getElementById("modal").hidden = true;
  if (!fromHistory && history.state && history.state.ui === "modal") {
    try { history.back(); } catch (e) { }
  }
}

function idsForCat(cat) {
  return F.tx.map((t, i) => i).filter(i => M.categories[F.tx[i][5]] === cat && F.tx[i][3] < 0);
}
function idsForBrand(brand) {
  return F.tx.map((t, i) => i).filter(i => F.tx[i][4] === brand);
}

function median(vals) {
  if (!vals.length) return 0;
  const s = vals.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* ------------------------------ actions ------------------------------ */
const view = document.getElementById("view");

/* ---------------------- калькуляторы: месяц, счёт, накопления ---------------------- */
const LSK = {
  get(k, def) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
};
const nid = () => Math.random().toString(36).slice(2, 9);
const num = v => { const n = parseFloat(String(v == null ? "" : v).replace(/\s/g, "").replace(",", ".")); return isFinite(n) ? n : 0; };
const addMonths = (d, m) => new Date(d.getFullYear(), d.getMonth() + Math.ceil(m), Math.min(d.getDate(), 28));
const monthsWord = n => plural(n, "месяц", "месяца", "месяцев");

let MY = LSK.get("fin.mydata.v1", null);
if (!MY || !Array.isArray(MY.incomes) || !Array.isArray(MY.expenses)) {
  MY = {
    incomes: [{ id: nid(), name: "Зарплата", amount: 0, period: "month" }],
    expenses: [
      { id: nid(), name: "Аренда", amount: 0 },
      { id: nid(), name: "ЖКХ", amount: 0 },
      { id: nid(), name: "Связь и интернет", amount: 0 }
    ]
  };
}
const saveMY = () => LSK.set("fin.mydata.v1", MY);

function myTotals() {
  const incMonth = MY.incomes.filter(i => i.period === "month").reduce((s, i) => s + num(i.amount), 0);
  const incOnce = MY.incomes.filter(i => i.period !== "month").reduce((s, i) => s + num(i.amount), 0);
  const exp = MY.expenses.reduce((s, i) => s + num(i.amount), 0);
  return { incMonth, incOnce, exp, free: incMonth - exp, has: MY.incomes.some(i => num(i.amount) > 0) || exp > 0 };
}

function pageMyData() {
  const t = myTotals();
  return `
  <div class="section" style="margin-top:0">
    ${note(`Здесь вы вписываете доходы и обязательные ежемесячные расходы своими словами — это не данные выписки.
      Сумма «свободно в месяц» отсюда подставляется в «Накопления» как то, что вы реально можете откладывать.
      Всё сохраняется в браузере.`, "grey", "ⓘ")}
  </div>

  <div class="section">
    <div class="grid g4">
      ${kpi("Доход в месяц", money(t.incMonth), `${MY.incomes.filter(i => num(i.amount) > 0).length} источников`)}
      ${kpi("Расходы в месяц", money(t.exp), `${MY.expenses.length} ${plural(MY.expenses.length, "пункт", "пункта", "пунктов")}`)}
      ${kpi("Свободно в месяц", money(t.free), t.free < 0 ? "расходы больше доходов" : "отсюда считается накопление", t.free >= 0 ? "accent" : "warn")}
      ${kpi("Разовые доходы", money(t.incOnce), "не входят в месячный расчёт")}
    </div>
  </div>

  <div class="card">
    <div class="section-head"><h2>Доходы</h2>
      <div class="hint">зарплата, подработка, аренда, проценты по вкладам — всё, что приходит</div></div>
    <table class="calc-table">
      <thead><tr><th>Источник</th><th>Сумма</th><th>Когда</th><th></th></tr></thead>
      <tbody>${MY.incomes.map(it => `<tr>
        <td><input type="text" value="${esc(it.name)}" data-my="in-name" data-id="${it.id}" placeholder="Например, зарплата"></td>
        <td><input type="number" min="0" step="1000" value="${it.amount ? it.amount : ""}" data-my="in-amount" data-id="${it.id}" placeholder="0" class="inp-num"></td>
        <td><select data-my="in-period" data-id="${it.id}">
          <option value="month" ${it.period === "month" ? "selected" : ""}>каждый месяц</option>
          <option value="once" ${it.period !== "month" ? "selected" : ""}>разово</option>
        </select></td>
        <td class="num"><button class="btn sm" data-act="my-del" data-kind="in" data-id="${it.id}" title="Удалить">×</button></td>
      </tr>`).join("")}</tbody>
    </table>
    <div class="filters" style="margin-top:14px"><button class="btn sm" data-act="my-add" data-kind="in">+ Добавить доход</button></div>
  </div>

  <div class="card">
    <div class="section-head"><h2>Обязательные расходы каждый месяц</h2>
      <div class="hint">аренда, ЖКХ, связь, кредиты, подписки — то, что списывается само</div></div>
    <table class="calc-table">
      <thead><tr><th>Статья</th><th>Сумма в месяц</th><th></th></tr></thead>
      <tbody>${MY.expenses.map(it => `<tr>
        <td><input type="text" value="${esc(it.name)}" data-my="ex-name" data-id="${it.id}" placeholder="Например, ЖКХ"></td>
        <td><input type="number" min="0" step="100" value="${it.amount ? it.amount : ""}" data-my="ex-amount" data-id="${it.id}" placeholder="0" class="inp-num"></td>
        <td class="num"><button class="btn sm" data-act="my-del" data-kind="ex" data-id="${it.id}" title="Удалить">×</button></td>
      </tr>`).join("")}</tbody>
    </table>
    <div class="filters" style="margin-top:14px"><button class="btn sm" data-act="my-add" data-kind="ex">+ Добавить расход</button></div>
  </div>

  <div class="card">
    <div class="section-head"><h2>Как это связано с накоплениями</h2></div>
    <div class="kv"><span class="k">Доход в месяц</span><span class="v">${money(t.incMonth)}</span></div>
    <div class="kv"><span class="k">Минус обязательные расходы</span><span class="v">${money(t.exp)}</span></div>
    <div class="kv"><span class="k">Свободно в месяц</span>
      <span class="v" style="color:${t.free < 0 ? "#a8322a" : "#1c6b58"}">${money(t.free)}</span></div>
    <div class="t-small t-muted" style="margin-top:10px">${t.free > 0
      ? `Эта сумма подставляется в «Накопления» по умолчанию — там можно поставить свой темп, но по вашим данным он ${money(t.free)} в месяц.`
      : "Пока свободной суммы нет: заполните доходы или уменьшите расходы — тогда накопления смогут считать срок."}</div>
    <div class="filters" style="margin-top:14px">
      <button class="btn sm" data-act="go-savings">Открыть накопления →</button>
    </div>
  </div>`;
}

function bindMyData() {
  document.querySelectorAll("[data-my]").forEach(el => {
    el.addEventListener("change", () => {
      const id = el.getAttribute("data-id");
      const f = el.getAttribute("data-my");
      const [kind, field] = f.split("-");
      const arr = kind === "in" ? MY.incomes : MY.expenses;
      const it = arr.find(x => x.id === id);
      if (!it) return;
      if (field === "name") it.name = el.value;
      else if (field === "amount") it.amount = num(el.value);
      else if (field === "period") it.period = el.value;
      saveMY(); render(true);
    });
  });
}

let SPLIT = LSK.get("fin.split.v1", null);
if (!SPLIT || !Array.isArray(SPLIT.people)) {
  SPLIT = { total: 0, people: [
    { id: nid(), name: "Я", paid: 0 },
    { id: nid(), name: "Гость 1", paid: 0 },
    { id: nid(), name: "Гость 2", paid: 0 }
  ] };
}
const saveSplit = () => LSK.set("fin.split.v1", SPLIT);

let SAV = LSK.get("fin.savings.v1", null);
if (!SAV || !Array.isArray(SAV.items)) SAV = { ability: 0, items: [] };
const saveSav = () => LSK.set("fin.savings.v1", SAV);

function splitData() {
  const ps = SPLIT.people;
  const paidSum = ps.reduce((s, p) => s + num(p.paid), 0);
  const bill = num(SPLIT.total) > 0 ? num(SPLIT.total) : paidSum;
  const n = ps.length || 1;
  const share = bill / n;
  const rows = ps.map(p => ({ name: p.name || "без имени", paid: num(p.paid), bal: num(p.paid) - share }));
  const debt = rows.filter(r => r.bal < -0.5).map(r => ({ name: r.name, rem: -r.bal })).sort((a, b) => b.rem - a.rem);
  const cred = rows.filter(r => r.bal > 0.5).map(r => ({ name: r.name, rem: r.bal })).sort((a, b) => b.rem - a.rem);
  const moves = [];
  let i = 0, j = 0, guard = 0;
  while (i < debt.length && j < cred.length && guard++ < 200) {
    const amt = Math.min(debt[i].rem, cred[j].rem);
    if (amt > 0.5) moves.push({ from: debt[i].name, to: cred[j].name, amt });
    debt[i].rem -= amt; cred[j].rem -= amt;
    if (debt[i].rem < 0.5) i++;
    if (cred[j].rem < 0.5) j++;
  }
  const toPot = debt.filter(d => d.rem > 0.5).map(d => ({ name: d.name, rem: d.rem }));
  return { bill, paidSum, share, rows, moves, n, unpaid: bill - paidSum, toPot };
}

function splitOutHtml() {
  const d = splitData();
  return `
    <div class="kv"><span class="k">Доля каждого</span><span class="v">${money(d.share)}</span></div>
    <table style="margin-top:12px">
      <thead><tr><th>Участник</th><th class="num">Заплатил</th><th class="num">Доля</th><th class="num">Итог</th></tr></thead>
      <tbody>${d.rows.map(r => `<tr>
        <td>${esc(r.name)}</td>
        <td class="num">${money(r.paid)}</td>
        <td class="num t-muted">${money(d.share)}</td>
        <td class="num" style="color:${r.bal < -0.5 ? "#a8322a" : r.bal > 0.5 ? "#1c6b58" : "var(--muted)"}">
          ${Math.abs(r.bal) <= 0.5 ? "в расчёте" : r.bal < 0 ? `доплатить ${money(-r.bal)}` : `получить ${money(r.bal)}`}</td>
      </tr>`).join("")}</tbody>
    </table>
    ${d.unpaid > 0.5 ? `<div class="t-small" style="color:#a8322a;margin-top:10px">Из общей суммы оплачено не всё: не хватает ${money(d.unpaid)} — эти деньги ещё нужно внести.</div>` : ""}
    ${d.moves.length || d.toPot.length ? `<div class="section-head" style="margin-top:18px"><h3 style="font-size:14.5px;margin:0">Кто кому переводит</h3>
      <div class="hint">минимум переводов, без лишних кругов</div></div>
      <div class="grid" style="gap:8px;margin-top:10px">${d.moves.map(m => `<div class="kv">
        <span class="k">${esc(m.from)} → ${esc(m.to)}</span><span class="v">${money(m.amt)}</span></div>`).join("")}
      ${d.toPot.map(x => `<div class="kv"><span class="k">${esc(x.name)} → на неоплаченную часть счёта</span>
        <span class="v">${money(x.rem)}</span></div>`).join("")}</div>` : ""}
    ${d.paidSum <= 0.5 && !(num(SPLIT.total) > 0) ? `<div class="t-small t-muted" style="margin-top:12px">Введите суммы — покажу, кому сколько доплатить или вернуть.</div>` : ""}`;
}

function pageSplit() {
  const d = splitData();
  return `
  <div class="section" style="margin-top:0">
    ${note(`Считается так: общая сумма делится на всех поровну. Каждый сравнивается со своей долей — кто заплатил больше,
      тому возвращают разницу, кто меньше — доплачивает. Итоговые переводы сводятся к минимуму: без цепочек «А вернул Б, Б вернул В».`, "grey", "ⓘ")}
  </div>

  <div class="section">
    <div class="grid g4">
      ${kpi("Всего к разделу", money(d.bill), num(SPLIT.total) > 0 ? "общая сумма из поля" : "по сумме платежей")}
      ${kpi("Участников", d.n, `${money(d.share)} на человека`)}
      ${kpi("Оплачено", money(d.paidSum), d.unpaid > 0.5 ? `не хватает ${money(d.unpaid)}` : "сходится с общей суммой")}
      ${kpi("Переводов", d.moves.length, "чтобы всё закрылось")}
    </div>
  </div>

  <div class="card">
    <div class="section-head"><h2>Кто сколько потратил</h2>
      <div class="hint">можно оставить общую сумму пустой — тогда она сложится из платежей</div></div>
    <div class="filters">
      <label class="t-small t-muted" for="splitTotal">Общая сумма</label>
      <input type="number" min="0" step="100" id="splitTotal" value="${SPLIT.total ? SPLIT.total : ""}" placeholder="0" class="inp-num" style="width:170px">
    </div>
    <table class="calc-table" style="margin-top:14px">
      <thead><tr><th>Участник</th><th>Сколько заплатил</th><th class="num">Доля</th><th></th></tr></thead>
      <tbody>${SPLIT.people.map(p => `<tr>
        <td><input type="text" value="${esc(p.name)}" data-split="name" data-id="${p.id}" placeholder="Имя"></td>
        <td><input type="number" min="0" step="50" value="${p.paid ? p.paid : ""}" data-split="paid" data-id="${p.id}" placeholder="0" class="inp-num"></td>
        <td class="num t-muted">${money(d.share)}</td>
        <td class="num"><button class="btn sm" data-act="split-del" data-id="${p.id}" title="Убрать">×</button></td>
      </tr>`).join("")}</tbody>
    </table>
    <div class="filters" style="margin-top:14px">
      <button class="btn sm" data-act="split-add">+ Добавить участника</button>
    </div>
  </div>

  <div class="card" id="splitOut">${splitOutHtml()}</div>`;
}

function bindSplit() {
  document.querySelectorAll("[data-split]").forEach(el => {
    el.addEventListener("change", () => {
      const p = SPLIT.people.find(x => x.id === el.getAttribute("data-id"));
      if (!p) return;
      const f = el.getAttribute("data-split");
      if (f === "name") p.name = el.value;
      else if (f === "paid") p.paid = num(el.value);
      saveSplit(); render(true);
    });
  });
  const tot = document.getElementById("splitTotal");
  if (tot) tot.addEventListener("change", () => {
    SPLIT.total = num(tot.value); saveSplit(); render(true);
  });
}

function savData() {
  const my = myTotals();
  const ability = num(SAV.ability) > 0 ? num(SAV.ability) : Math.max(0, my.free);
  const today = new Date();
  const rows = SAV.items.map(it => {
    const price = num(it.price), have = num(it.saved), rest = Math.max(0, price - have);
    let months = null, perMonth = null, doneBy = null;
    if (rest <= 0) { months = 0; perMonth = 0; }
    else if (it.date) {
      const target = new Date(it.date + "T00:00:00");
      const m = Math.max(0.2, (target - today) / (1000 * 60 * 60 * 24 * 30.44));
      months = m; perMonth = rest / m;
    } else if (ability > 0) {
      months = rest / ability; perMonth = ability;
    }
    if (months !== null && rest > 0) doneBy = addMonths(today, months);
    return { ...it, price, have, rest, months, perMonth, doneBy, share: price > 0 ? Math.min(1, have / price) : 0 };
  });
  const totalRest = rows.reduce((s, r) => s + r.rest, 0);
  const soonest = rows.filter(r => r.doneBy).sort((a, b) => a.doneBy - b.doneBy)[0] || null;
  return { rows, ability, totalRest, soonest, today };
}

function fmtMonthYear(d) { return MONTHS_FULL[d.getMonth()] + " " + d.getFullYear(); }

function savOutHtml() {
  const d = savData();
  if (!d.rows.length) return `<div class="t-small t-muted">Пока нет целей. Добавьте то, на что копите: телефон, поездку, подушку.</div>`;
  return `<table>
    <thead><tr><th>Цель</th><th>Цена</th><th>Уже есть</th><th class="num">Осталось</th><th class="num">В месяц</th><th class="num">Готово к</th></tr></thead>
    <tbody>${d.rows.map(r => `<tr>
      <td>${esc(r.name || "без названия")}
        <div class="bar" style="margin-top:6px"><i style="width:${Math.round(r.share * 100)}%"></i></div>
        <div class="t-small t-muted" style="margin-top:4px">${Math.round(r.share * 100)}% накоплено</div></td>
      <td>${money(r.price)}</td>
      <td>${money(r.have)}</td>
      <td class="num">${money(r.rest)}</td>
      <td class="num">${r.perMonth === null ? "—" : money(r.perMonth)}</td>
      <td class="num">${r.rest <= 0 ? '<span style="color:#1c6b58">накоплено</span>' : r.doneBy ? fmtMonthYear(r.doneBy) : "—"}</td>
    </tr>`).join("")}</tbody>
  </table>
  ${d.rows.some(r => r.perMonth === null && r.rest > 0) ? `<div class="t-small t-muted" style="margin-top:10px">
    Где стоит дата — темп считается под неё (сколько нужно откладывать в месяц, чтобы успеть). Где даты нет и не задана сумма
    в месяц — посчитать срок нельзя.</div>` : ""}`;
}

function pageSavings() {
  const d = savData();
  const myFree = Math.max(0, myTotals().free);
  return `
  <div class="section" style="margin-top:0">
    ${note(`Здесь только ваша цель и арифметика, а не совет «сколько можно откладывать»: сумму в месяц вы задаёте сами.
      Если указать дату, приложение наоборот посчитает, сколько нужно откладывать под неё.`, "grey", "ⓘ")}
  </div>

  <div class="section">
    <div class="grid g4">
      ${kpi("Целей", d.rows.length, `${money(d.totalRest)} осталось накопить`)}
      ${kpi("Откладываю в месяц", d.ability > 0 ? money(d.ability) : "—",
        d.ability > 0 ? `${money(d.ability * 12)} в год${SAV.ability > 0 ? "" : " · по «Мои данные»"}` : "заполните «Мои данные»")}
      ${kpi("Ближайшая цель", d.soonest ? fmtMonthYear(d.soonest.doneBy) : "—", d.soonest ? esc(d.soonest.name || "без названия") : "пока не из чего выбрать")}
      ${kpi("В день", d.ability > 0 ? money(d.ability / 30.44) : "—", "при выбранном темпе")}
    </div>
  </div>

  <div class="card">
    <div class="section-head"><h2>Сколько откладывать</h2>
      <div class="hint">общая сумма на всё, что ниже</div></div>
    <div class="filters">
      <label class="t-small t-muted" for="savAbility">Свой темп, ₽ в месяц</label>
      <input type="number" min="0" step="500" id="savAbility" value="${SAV.ability ? SAV.ability : ""}" placeholder="${myFree > 0 ? myFree : 0}" class="inp-num" style="width:170px">
      <span class="t-small t-muted">${myFree > 0
        ? `по «Мои данные» свободно ${money(myFree)} в месяц — если поле пустое, считается эта сумма`
        : `заполните доходы и расходы в разделе «Мои данные», чтобы темп считался сам`}</span>
      <button class="btn sm" data-act="go-data">Мои данные →</button>
    </div>
  </div>

  <div class="card">
    <div class="section-head"><h2>Цели</h2>
      <div class="hint">название · цена · сколько уже отложено · дата (необязательно)</div></div>
    <table class="calc-table">
      <thead><tr><th>Что хочу</th><th>Сколько стоит</th><th>Уже отложено</th><th>К дате</th><th></th></tr></thead>
      <tbody>${SAV.items.map(it => `<tr>
        <td><input type="text" value="${esc(it.name)}" data-sav="name" data-id="${it.id}" placeholder="Например, iPhone"></td>
        <td><input type="number" min="0" step="1000" value="${it.price ? it.price : ""}" data-sav="price" data-id="${it.id}" placeholder="0" class="inp-num"></td>
        <td><input type="number" min="0" step="1000" value="${it.saved ? it.saved : ""}" data-sav="saved" data-id="${it.id}" placeholder="0" class="inp-num"></td>
        <td><input type="date" value="${it.date || ""}" data-sav="date" data-id="${it.id}" class="inp-date"></td>
        <td class="num"><button class="btn sm" data-act="sav-del" data-id="${it.id}" title="Удалить">×</button></td>
      </tr>`).join("")}</tbody>
    </table>
    <div class="filters" style="margin-top:14px">
      <button class="btn sm" data-act="sav-add">+ Добавить цель</button>
    </div>
  </div>

  <div class="card" id="savOut">${savOutHtml()}</div>`;
}

function bindSavings() {
  const refresh = () => {
    const out = document.getElementById("savOut");
    if (out) out.innerHTML = savOutHtml();
  };
  document.querySelectorAll("[data-sav]").forEach(el => {
    el.addEventListener("change", () => {
      const it = SAV.items.find(x => x.id === el.getAttribute("data-id"));
      if (!it) return;
      const f = el.getAttribute("data-sav");
      if (f === "name") it.name = el.value;
      else if (f === "price") it.price = num(el.value);
      else if (f === "saved") it.saved = num(el.value);
      else if (f === "date") it.date = el.value || null;
      saveSav(); render(true);
    });
  });
  const ab = document.getElementById("savAbility");
  if (ab) ab.addEventListener("change", () => { SAV.ability = num(ab.value); saveSav(); render(true); });
}


/* ------------------------------ мобильная версия ------------------------------ */
const MQ = window.matchMedia("(max-width:720px)");
const isMobile = () => MQ.matches;

// Заголовки столбцов -> data-label. Одна правка вместо 24 таблиц.
function labelTables(root) {
  root.querySelectorAll("table").forEach(t => {
    const ths = Array.from(t.querySelectorAll("thead th")).map(th => th.textContent.trim());
    if (!ths.length) return;
    t.querySelectorAll("tbody tr").forEach(tr => {
      const tds = tr.children;
      if (tds.length === 1) return;
      for (let i = 0; i < tds.length && i < ths.length; i++) {
        if (ths[i] && !tds[i].getAttribute("data-label")) tds[i].setAttribute("data-label", ths[i]);
      }
    });
  });
}

const MNAV = ["overview", "improve", "costly", "tx", "more"];
const MNAV_SHORT = { overview: "Обзор", improve: "Советы", costly: "Привычки", tx: "Операции" };
const MNAV_ICON = { overview: "◧", improve: "✶", costly: "₽", tx: "≡" };

function renderMobileNav() {
  const nav = document.getElementById("mnav");
  if (!isMobile()) {
    if (nav) nav.remove();
    closeDrawer();
    document.body.classList.add("no-mnav");
    return;
  }
  document.body.classList.remove("no-mnav");
  const badges = (typeof navBadges === "function" ? navBadges() : {}) || {};
  const el = nav || (() => {
    const n = document.createElement("nav");
    n.id = "mnav";
    n.className = "mnav";
    document.body.appendChild(n);
    return n;
  })();
  const items = HAS_DATA ? MNAV : ["import", "help"];
  if (!HAS_DATA) {
    el.innerHTML = items.map(id =>
      `<button class="mnav-item ${state.page === id ? "active" : ""}" data-act="page" data-page="${id}">
         <span class="mi">${id === "import" ? "⇪" : "?"}</span><span>${id === "import" ? "Загрузить" : "Справка"}</span></button>`).join("");
    return;
  }
  el.innerHTML = items.map(id => id === "more"
    ? `<button class="mnav-item" data-act="drawer-open"><span class="mi">☰</span><span>Ещё</span></button>`
    : `<button class="mnav-item ${state.page === id ? "active" : ""}" data-act="page" data-page="${id}">
         <span class="mi">${MNAV_ICON[id]}</span><span>${MNAV_SHORT[id]}</span>
         ${badges[id] ? `<i class="mb">${badges[id]}</i>` : ""}</button>`
  ).join("");
}

function openDrawer() {
  let d = document.getElementById("drawer");
  if (!d) {
    d = document.createElement("div");
    d.id = "drawer";
    d.className = "drawer";
    document.body.appendChild(d);
    try { history.pushState({ ui: "drawer" }, ""); } catch (e) { }
  }
  const badges = (typeof navBadges === "function" ? navBadges() : {}) || {};
  d.innerHTML = `
    <div class="drawer-head"><span>Разделы</span>
      <button class="icon-btn" data-act="drawer-close" aria-label="Закрыть">✕</button></div>
    <div class="drawer-list">
      ${PAGES.map(p => `<button class="drawer-item ${state.page === p.id ? "active" : ""}" data-act="page" data-page="${p.id}">
        <span>${p.title}</span>${badges[p.id] ? `<span class="badge">${badges[p.id]}</span>` : ""}</button>`).join("")}
    </div>
    <div class="drawer-foot" id="drawerFoot"></div>`;
  const note = document.getElementById("dataNote");
  const foot = d.querySelector("#drawerFoot");
  if (foot && note) foot.innerHTML = note.innerHTML;
  document.body.classList.add("drawer-open");
}

function closeDrawer(fromHistory) {
  const d = document.getElementById("drawer");
  if (d) d.remove();
  document.body.classList.remove("drawer-open");
  if (!fromHistory && history.state && history.state.ui === "drawer") {
    try { history.back(); } catch (e) { }
  }
}

// Системная кнопка «назад» (Android, VK): сначала закрываем окно, а не приложение
window.__vkBack = function () {
  if (!document.getElementById("modal").hidden) { closeModal(true); return true; }
  if (document.getElementById("drawer")) { closeDrawer(true); return true; }
  return false;
};
window.addEventListener("popstate", function () {
  if (!document.getElementById("modal").hidden) closeModal(true);
  if (document.getElementById("drawer")) closeDrawer(true);
});
window.render = function (keep) { try { render(keep); } catch (e) { } };

MQ.addEventListener("change", () => { closeDrawer(); render(true); });

function pageHelp() {
  const hasData = HAS_DATA;
  const bankCard = (name, color, steps, noteText) => `
    <div class="card" style="border-top:3px solid ${color}">
      <div class="section-head" style="margin-bottom:10px"><h2>${name}</h2></div>
      <ol class="steps">
        ${steps.map(s => `<li>${s}</li>`).join("")}
      </ol>
      <div class="t-small t-muted" style="margin-top:10px">${noteText}</div>
    </div>`;

  return `
  <div class="section" style="margin-top:0">
    ${note(`Всё работает на вашем устройстве: файл выписки разбирается в браузере и никуда не отправляется —
      ни на сервер приложения, ни в банк. Приложение видит только то, что записано в PDF.`, "grey", "ⓘ")}
  </div>

  <div class="section">
    <div class="section-head"><h2>Три шага</h2></div>
    <div class="grid g3">
      <div class="card step-card">
        <div class="step-n">1</div>
        <div class="step-t">Скачайте выписку в банке</div>
        <div class="step-x">Нужен PDF за период. Это бесплатно и занимает пару минут — инструкция ниже.</div>
      </div>
      <div class="card step-card">
        <div class="step-n">2</div>
        <div class="step-t">Загрузите файл сюда</div>
        <div class="step-x">Раздел «Загрузить выписку»: перетащите PDF или выберите на диске. Файл остаётся у вас.</div>
      </div>
      <div class="card step-card">
        <div class="step-n">3</div>
        <div class="step-t">Смотрите, где уходят деньги</div>
        <div class="step-x">Обзор за период, рекомендации с суммами, подписки, непонятные траты и калькулятор экономии.</div>
      </div>
    </div>
    ${hasData ? "" : `<div style="margin-top:12px"><button class="btn" data-act="page" data-page="import">Загрузить выписку</button></div>`}
  </div>

  <div class="section">
    <div class="section-head"><h2>Где взять файл выписки</h2>
      <div class="hint">поддерживаются Т-Банк и Сбер; другие банки — скоро</div></div>
    <div class="two-col">
      ${bankCard("Т-Банк", "#ffdd2d", [
        `Откройте приложение Т-Банка и войдите в свой аккаунт.`,
        `Перейдите в «Ещё» → «Справки и выписки» (в некоторых версиях: профиль → «Документы»).`,
        `Выберите «Справка о движении средств» — это именно тот документ, который нужен.`,
        `Укажите счёт или карту и период: удобнее всего взять весь срок счёта, чтобы была история, а не один месяц.`,
        `Сохраните PDF: кнопка «Отправить» или «Скачать» → формат PDF.`,
      ], `В интернет-банке на компьютере: раздел «Выписки и справки» → «Справка о движении средств» → PDF.
        Файл называется как-то вроде «Справка о движении средств.pdf» — это то, что нужно.`)}
      ${bankCard("Сбер", "#21a038", [
        `Откройте СберБанк Онлайн.`,
        `Зайдите в «Выписки и справки» (или профиль → «Выписки и справки»).`,
        `Выберите «Выписка по счёту дебетовой карты».`,
        `Отметьте карту и период — лучше за всё время, что ведёте карту.`,
        `Нажмите «Сохранить в PDF» и перешлите файл себе (на почту, в «Файлы», в мессенджер).`,
      ], `В веб-версии СберБанк Онлайн: «Выписки и справки» → «Выписка по счёту карты» → PDF.
        Название файла содержит «Vypiska_po_sche…» — это нормально.`)}
    </div>
    <div class="card" style="margin-top:12px">
      <div class="section-head" style="margin-bottom:8px"><h2>Что не подойдёт</h2></div>
      <div class="kvr"><span class="k">Скриншот или фото выписки</span><span class="v">нет текстового слоя — приложение не прочитает</span></div>
      <div class="kvr"><span class="k">CSV и Excel из банка</span><span class="v">пока не поддерживаются, нужен PDF</span></div>
      <div class="kvr"><span class="k">Выписка другого банка</span><span class="v">приложение вежливо откажет и подскажет, что умеет</span></div>
      <div class="kvr"><span class="k">Один месяц вместо истории</span><span class="v">сработает, но привычки и рекомендации будут беднее</span></div>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><h2>Что где смотреть</h2></div>
    <div class="card">
      <div class="kvr"><span class="k">Обзор</span><span class="v">сколько ушло за период, средний чек, находки системы</span></div>
      <div class="kvr"><span class="k">Что можно улучшить</span><span class="v">11 рекомендаций с суммами, достоверностью и кнопкой «показать операции»</span></div>
      <div class="kvr"><span class="k">А что, если бы я экономил</span><span class="v">категория + процент → экономия за месяц, год и 5 лет</span></div>
      <div class="kvr"><span class="k">Финансовые привычки</span><span class="v">дни недели, часы, месяцы, что стало появляться чаще</span></div>
      <div class="kvr"><span class="k">Самые дорогие привычки</span><span class="v">рейтинг категорий и сравнение магазинов внутри категории</span></div>
      <div class="kvr"><span class="k">Стриминги и подписки</span><span class="v">цифровые сервисы: музыка, кино, хостинг, игры — и связь отдельно</span></div>
      <div class="kvr"><span class="k">Непонятные траты</span><span class="v">что не удалось опознать; категорию можно задать вручную</span></div>
      <div class="kvr"><span class="k">Отчёт за месяц</span><span class="v">заработано и потрачено, топ категорий, что изменилось</span></div>
      <div class="kvr"><span class="k">Мои данные · Накопления · Разделить счёт</span><span class="v">ручные калькуляторы, к выписке не привязаны</span></div>
      <div class="kvr"><span class="k">Операции</span><span class="v">весь журнал с поиском, фильтрами по категории, магазину и сумме</span></div>
    </div>
  </div>

  <div class="section">
    <div class="section-head"><h2>Частые вопросы</h2></div>
    <div class="card">
      <div class="kvr"><span class="k">«Это выписка другого банка»</span><span class="v">сейчас читаются только Т-Банк и Сбер</span></div>
      <div class="kvr"><span class="k">«Файл прочитан, но операций нет»</span><span class="v">скорее всего это скан или картинка, а не PDF из банка</span></div>
      <div class="kvr"><span class="k">Загрузил второй банк</span><span class="v">операции объединятся; переключатель «Оба банка / Т-Банк / Сбер» в шапке</span></div>
      <div class="kvr"><span class="k">Переводы между своими картами</span><span class="v">не считаются расходом — это перекладывание денег</span></div>
      <div class="kvr"><span class="k">Пропали данные на iPhone</span><span class="v">Safari чистит хранилище после недели простоя — сохраните файл данных и загрузите заново</span></div>
      <div class="kvr"><span class="k">Хочу перенести на другой телефон</span><span class="v">«Загрузить выписку» → «Сохранить данные в файл», затем «Загрузить файл данных» там</span></div>
      <div class="kvr"><span class="k">Вижу устаревшую версию</span><span class="v">приложение обновится само при следующем запуске; можно закрыть и открыть заново</span></div>
      <div class="kvr"><span class="k">Видны ли мои данные кому-то</span><span class="v">нет: расчёт идёт на устройстве, у приложения нет сервера</span></div>
    </div>
  </div>

  <div class="section">
    <div class="card" style="background:#f7f4ec">
      <div class="section-head" style="margin-bottom:8px"><h2>Чего приложение не умеет</h2></div>
      <div class="t-small" style="line-height:1.7;color:var(--ink-2)">
        Не видит состав чека — категория это название магазина, а не факт покупки.
        Не знает ваши доходы, пока вы не впишете их в «Мои данные».
        Не хранит данные на сервере и не синхронизирует устройства сам.
        Не даёт инвестиционных советов и не считает кредитный рейтинг.
        Суммы «за 5 лет» — арифметика, а не обещание.
      </div>
    </div>
  </div>`;
}

/* Согласие с политикой конфиденциальности — требование п. 1.1.4 правил VK Mini Apps:
   пользователь должен принять документы до начала использования приложения. */
function maybeConsent() {
  var done = null;
  try { done = localStorage.getItem("fin.consent.v1"); } catch (e) { }
  if (done || document.getElementById("consent")) return;
  var bar = document.createElement("div");
  bar.id = "consent";
  bar.className = "consent";
  bar.innerHTML = '<div class="consent-x">Файл выписки обрабатывается только в вашем браузере и никуда не отправляется. ' +
    'Продолжая, вы принимаете <a class="link" href="https://github.com/rallkololo-prog/finansovyj-konsultant/blob/main/PRIVACY.md" ' +
    'target="_blank" rel="noopener">политику конфиденциальности</a> и ' +
    '<a class="link" href="https://github.com/rallkololo-prog/finansovyj-konsultant/blob/main/TERMS.md" target="_blank" rel="noopener">пользовательское соглашение</a>.</div>' +
    '<button class="btn" data-act="consent-ok">Понятно</button>';
  document.body.appendChild(bar);
}

function render(keepScroll) {
  if (!HAS_DATA && state.page !== "import" && state.page !== "help") state.page = "import";
  try { renderChrome(); } catch (e) { window.__err2 = (e && (e.stack || e.message)) || String(e); console.error(e); }
  const fn = {
    overview: pageOverview, improve: pageImprove, scen: pageScen, habits: pageHabits,
    costly: pageCostly, subs: pageSubs, stream: pageStream, unknown: pageUnknown,
    anom: pageAnom, reports: pageReports, profile: pageProfile, tx: pageTx,
    import: pageImport, data: pageMyData, split: pageSplit, savings: pageSavings, help: pageHelp,
  }[state.page] || pageOverview;
  try { view.innerHTML = fn(); }
  catch (e) {
    console.error(e); window.__err = (e && (e.stack || e.message)) || String(e);
    view.innerHTML = `<div class="card"><div class="section-head"><h2>Раздел не построился</h2></div>
      <div class="t-small t-muted">Это ошибка расчёта на этих данных. Остальные разделы работают — выберите другой период или откройте заново.</div>
      <pre class="t-small t-muted" style="margin-top:10px;white-space:pre-wrap">${String(window.__err).slice(0, 300)}</pre></div>`;
  }
  try { labelTables(view); } catch (e) { }
  try { renderMobileNav(); } catch (e) { }
  try { maybeConsent(); } catch (e) { }
  if (!keepScroll) window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  if (state.page === "scen") bindScen();
  if (state.page === "tx") bindTx();
  if (state.page === "data") bindMyData();
  if (state.page === "import") bindImport();
  if (state.page === "split") bindSplit();
  if (state.page === "savings") bindSavings();
}

function onAction(e) {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.getAttribute("data-act");
  if (act === "export-data") { exportData(); return; }
  if (act === "import-data") { const inp = document.getElementById("jsonInput"); if (inp) inp.click(); return; }
  if (act === "drawer-open") { openDrawer(); return; }
  if (act === "drawer-close") { closeDrawer(); return; }
  if (act === "page") {
    closeDrawer(); state.page = el.getAttribute("data-page"); render(); }
  else if (act === "src") { state.src = el.getAttribute("data-s"); _blockKey = ""; _recsKey = ""; render(); }
  else if (act === "preset") { const r = presetRange(el.getAttribute("data-p")); state.preset = el.getAttribute("data-p"); state.from = r.from; state.to = r.to; state.reportMonth = null; render(); }
  else if (act === "preset-year") { return; }
  else if (act === "my-add") {
    const kind = el.getAttribute("data-kind");
    if (kind === "in") MY.incomes.push({ id: nid(), name: "", amount: 0, period: "month" });
    else MY.expenses.push({ id: nid(), name: "", amount: 0 });
    saveMY(); render(true);
  }
  else if (act === "my-del") {
    const kind = el.getAttribute("data-kind"), id = el.getAttribute("data-id");
    if (kind === "in") MY.incomes = MY.incomes.filter(x => x.id !== id);
    else MY.expenses = MY.expenses.filter(x => x.id !== id);
    saveMY(); render(true);
  }
  else if (act === "unk-tx") {
    const br = el.getAttribute("data-brand");
    const info = B().brands[br];
    openModal(br, info ? `${info.cat} · ${info.cnt} ${plural(info.cnt, "операция", "операции", "операций")} · ${money(info.total)}` : "",
      txRowsHtml(info && info.ids ? info.ids : idsForBrand(br)));
  }
  else if (act === "go-savings") { state.page = "savings"; render(); }
  else if (act === "go-data") { state.page = "data"; render(); }
  else if (act === "pick-file") { const f = document.getElementById("fileInput"); if (f) f.click(); }
  else if (act === "try-demo") {
    if (!window.__DEMO) return;
    try {
      localStorage.setItem("fin.dataset.v1", JSON.stringify(window.__DEMO));
      localStorage.setItem("fin.demo.v1", "1");
    } catch (e) { }
    location.reload();
  }
  else if (act === "consent-ok") {
    try { localStorage.setItem("fin.consent.v1", new Date().toISOString().slice(0, 10)); } catch (e) { }
    const c = document.getElementById("consent"); if (c) c.remove();
  }
  else if (act === "reset-data") {
    if (confirm("Удалить загруженные данные из браузера? Приложение вернётся к пустому экрану.")) {
      try { localStorage.removeItem("fin.dataset.v1"); } catch (e) { }
      location.reload();
    }
  }
  else if (act === "split-add") { SPLIT.people.push({ id: nid(), name: "", paid: 0 }); saveSplit(); render(); }
  else if (act === "split-del") { SPLIT.people = SPLIT.people.filter(p => p.id !== el.getAttribute("data-id")); saveSplit(); render(); }
  else if (act === "sav-add") { SAV.items.push({ id: nid(), name: "", price: 0, saved: 0, date: null }); saveSav(); render(); }
  else if (act === "sav-del") { SAV.items = SAV.items.filter(i => i.id !== el.getAttribute("data-id")); saveSav(); render(); }
  else if (act === "cat") {
    const cat = el.getAttribute("data-cat");
    openModal(cat, "Все операции этой категории", txRowsHtml(idsForCat(cat)));
  } else if (act === "brand") {
    const b = el.getAttribute("data-brand");
    const info = B().brands[b];
    openModal(b, `${info ? info.cat + " · " + info.cnt + " операций" : ""}`, txRowsHtml(idsForBrand(b)));
  } else if (act === "rec") {
    const r = RECS()[+el.getAttribute("data-i")];
    openModal(r.title, `Сокращение ${r.pct}% · экономия ${money(r.save_year)} в год · достоверность: ${r.confidence}`,
      `<div class="note grey" style="margin:0 0 14px"><div class="ico">ⓘ</div><div>${r.why}</div></div>
       <div class="kv"><span class="k">Расходы на категорию сейчас</span><span class="v">${money(r.base_year)} / год</span></div>
       <div class="kv"><span class="k">Экономия в месяц</span><span class="v">${money(r.save_month)}</span></div>
       <div class="kv"><span class="k">Экономия за 5 лет</span><span class="v">${money(r.save_5y)}</span></div>
       <div class="kv"><span class="k">Операций в год (оценка)</span><span class="v">${r.cnt_year}</span></div>
       <h4 style="margin:16px 0 8px">Операции, на которых построен расчёт</h4>
       ${txRowsHtml(r.ids)}`);
  } else if (act === "scen-cat") {
    const c = el.getAttribute("data-cat");
    if (state.scen.cats.has(c)) state.scen.cats.delete(c); else state.scen.cats.add(c);
    render();
  } else if (act === "pct-set") { state.scen.pct = +el.getAttribute("data-p"); render(); }
  else if (act === "report-pick") { state.reportMonth = el.getAttribute("data-m"); render(); }
  else if (act === "tx-kind") { state.txFilter.kind = el.getAttribute("data-k"); render(); }
  else if (act === "tx-reset") { state.txFilter = { cat: "all", brand: "all", q: "", kind: "spend", sort: "date", amin: "", amax: "" }; render(); }
  else if (act === "unk-set") {
    const br = el.getAttribute("data-brand"), c = el.getAttribute("data-cat");
    if (c === "Прочее") delete overrides[br]; else overrides[br] = c;
    saveOverrides(overrides); _blockKey = ""; _recsKey = ""; render();
  } else if (act === "unk-reset") {
    delete overrides[el.getAttribute("data-brand")];
    saveOverrides(overrides); _blockKey = ""; _recsKey = ""; render();
  }
}

function bindScen() {
  const range = document.getElementById("pctRange");
  if (range) range.addEventListener("input", () => {
    state.scen.pct = +range.value;
    const v = document.getElementById("pctVal");
    if (v) v.textContent = range.value + "%";
    const c = document.getElementById("pctCustom");
    if (c) c.value = range.value;
    render();
  });
  const custom = document.getElementById("pctCustom");
  if (custom) custom.addEventListener("change", () => {
    let v = parseInt(custom.value.replace(/[^\d]/g, ""), 10);
    if (isNaN(v)) v = 20;
    state.scen.pct = Math.max(0, Math.min(100, v));
    render();
  });
}

function bindTx() {
  const f = state.txFilter;
  const q = document.getElementById("txQ");
  if (q) q.addEventListener("input", () => { f.q = q.value; render(true); const n = document.getElementById("txQ"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); });
  const cat = document.querySelector('[data-act="tx-cat"]');
  if (cat) cat.addEventListener("change", () => { f.cat = cat.value; render(true); });
  const brand = document.querySelector('[data-act="tx-brand"]');
  if (brand) brand.addEventListener("change", () => { f.brand = brand.value; render(true); });
  const sort = document.querySelector('[data-act="tx-sort"]');
  if (sort) sort.addEventListener("change", () => { f.sort = sort.value; render(true); });
  const amin = document.getElementById("txAmin");
  if (amin) amin.addEventListener("change", () => { f.amin = amin.value; render(true); });
  const amax = document.getElementById("txAmax");
  if (amax) amax.addEventListener("change", () => { f.amax = amax.value; render(true); });
}

document.addEventListener("click", e => {
  if (e.target.id === "modal" || e.target.id === "modalClose") { closeModal(); return; }
  onAction(e);
});
document.addEventListener("change", e => {
  if (e.target.id === "dateFrom") { setRange(e.target.value, state.to); return; }
  if (e.target.id === "dateTo") { setRange(state.from, e.target.value); return; }
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.getAttribute("data-act");
  if (act === "report-month") { state.reportMonth = el.value; render(); }
  else if (act === "report-compare") { state.reportCompare = el.value; render(); }
  else if (act === "cmp-cat") { state.cmpCat = el.value; render(); }
  else if (act === "unk-choose") {
    const cat = el.value; if (!cat) return;
    overrides[el.getAttribute("data-brand")] = cat;
    saveOverrides(overrides);
    _blockKey = ""; _recsKey = "";
    render(true);
  }
  else if (act === "preset-year") {
    const y = el.value; if (!y) return;
    const r = presetRange(y);
    state.preset = y; state.from = r.from; state.to = r.to;
    state.reportMonth = null; state.reportCompare = null; render();
  }
  else if (act === "date-from") { setRange(el.value, state.to); }
  else if (act === "date-to") { setRange(state.from, el.value); }
});
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

render();
})();
