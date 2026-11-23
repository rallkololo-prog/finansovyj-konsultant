/* Демонстрационные данные для скриншотов и витрины.
   Полностью выдуманные: ни одного реального мерчанта, суммы и даты синтетические.
   Запуск: node tools/demo.js → build/demo-data.js (window.__DEMO) */
const fs = require("fs");
const path = require("path");

const CATS = ["Продукты", "Кофе и фастфуд", "Доставка еды", "Такси и каршеринг", "Кикшеринг", "Транспорт",
  "Путешествия", "Табак", "Маркетплейсы", "Одежда и обувь", "Дом и ремонт", "Питомцы", "Здоровье и аптеки",
  "Связь и интернет", "Подписки и сервисы", "Страхование", "Развлечения", "Ставки и азартные игры",
  "Красота и уход", "Образование", "Госуслуги и налоги", "Цветы и подарки", "Комиссии банка",
  "Снятие наличных", "Прочее", "Переводы людям", "Переводы в другие банки", "Между своими счетами",
  "Инвестиции и вклады", "Доходы и пополнения"];
const C = id => CATS.indexOf(id);

// выдуманные компании: [бренд, категория, минимальная сумма, максимальная, частота в месяц]
const SHOPS = [
  ["Супермаркет у дома", "Продукты", 180, 1900, 22],
  ["Гипермаркет", "Продукты", 900, 4200, 4],
  ["Овощной ларёк", "Продукты", 120, 700, 6],
  ["Кофейня на углу", "Кофе и фастфуд", 160, 420, 14],
  ["Быстрое питание", "Кофе и фастфуд", 390, 950, 6],
  ["Пекарня", "Кофе и фастфуд", 130, 480, 5],
  ["Яндекс Еда", "Доставка еды", 700, 2400, 5],
  ["Яндекс Go", "Такси и каршеринг", 250, 1300, 8],
  ["Whoosh", "Кикшеринг", 60, 180, 30],
  ["Metro", "Транспорт", 40, 90, 12],
  ["OZON", "Маркетплейсы", 500, 5200, 3],
  ["Магазин одежды", "Одежда и обувь", 1500, 7000, 1],
  ["Строительный магазин", "Дом и ремонт", 400, 3800, 1],
  ["Зоомагазин", "Питомцы", 300, 1600, 2],
  ["Аптека", "Здоровье и аптеки", 200, 1400, 3],
  ["Билайн", "Связь и интернет", 650, 900, 1],
  ["Яндекс Плюс", "Подписки и сервисы", 200, 400, 2],
  ["Аеза", "Подписки и сервисы", 750, 800, 1],
  ["Барбершоп", "Красота и уход", 900, 1800, 1],
  ["Кинотеатр", "Развлечения", 500, 1200, 1],
];

function rnd(n) { return Math.floor(Math.random() * n); }
function pick(a) { return a[rnd(a.length)]; }
function iso(d) { return d.toISOString().slice(0, 10); }

const rows = [];
const start = new Date("2026-02-01T00:00:00Z");
const end = new Date("2026-11-20T00:00:00Z");

for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
  const day = new Date(d);
  const wd = day.getUTCDay();
  for (const [brand, cat, min, max, freq] of SHOPS) {
    // частота в месяц → вероятность за день
    const p = freq / 30 * (wd === 0 || wd === 6 ? 1.25 : 1);
    if (Math.random() < p) {
      const copies = Math.random() < 0.12 ? 2 : 1;
      for (let k = 0; k < copies; k++) {
        const amount = Math.round((min + Math.random() * (max - min)) / 10) * 10;
        const h = 7 + rnd(15);
        const m = rnd(60);
        rows.push([iso(day), String(h).padStart(2, "0"), m, -amount, brand, C(cat),
          cat === "Подписки и сервисы" ? "purchase" : "purchase",
          "Оплата в " + brand.toUpperCase() + " MOCK CITY", 0]);
      }
    }
  }
  // редкие крупные события
  if (rnd(100) < 2) rows.push([iso(day), "12", 10, -Math.round(4000 + Math.random() * 9000), "Мебельный салон", C("Дом и ремонт"), "purchase", "Оплата в MEBEL MOCK", 0]);
  if (rnd(100) < 3) rows.push([iso(day), "09", 30, -Math.round(500 + Math.random() * 1500), "Перевод другу", C("Переводы людям"), "p2p", "Перевод по номеру телефона", 0]);
  if (rnd(100) < 2) {
    const inc = Math.round(60000 + Math.random() * 40000);
    rows.push([iso(day), "10", 5, inc, "Заработная плата", C("Доходы и пополнения"), "salary", "Заработная плата MOCK", 0]);
  }
}

rows.sort((a, b) => (a[0] + a[1] + a[2]) < (b[0] + b[1] + b[2]) ? 1 : -1);

const months = [...new Set(rows.map(r => r[0].slice(0, 7)))].sort();
const meta = {
  categories: CATS,
  spend_cats: CATS.slice(0, 25),
  consumption: CATS.slice(0, 25),
  months_all: months,
  period: [rows[rows.length - 1][0], rows[0][0]],
  active: [months[0] + "-01", rows[0][0]],
  sources: [{ id: "tb", name: "Т-Банк", card: "0000", count: rows.length }],
  tx_count: rows.length,
  balance: null,
  imported: true,
  demo: true,
};

// годовые итоги: приложение показывает их в «Расходах по годам» и в сравнении
const years = {};
for (const r of rows) {
  const y = r[0].slice(0, 4);
  years[y] = years[y] || { spend: 0, cnt: 0, income: 0 };
  if (r[3] < 0) { years[y].spend += -r[3]; years[y].cnt += 1; }
  else years[y].income += r[3];
}
for (const y in years) {
  years[y].spend = Math.round(years[y].spend * 100) / 100;
  years[y].income = Math.round(years[y].income * 100) / 100;
}
meta.years = years;

const out = "window.__DEMO = " + JSON.stringify({ meta, tx: rows, years }) + ";\n";
fs.mkdirSync(path.join(__dirname, "..", "build"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "..", "build", "demo-data.js"), out);
console.log("демо-операций:", rows.length, "| размер:", out.length, "байт");
