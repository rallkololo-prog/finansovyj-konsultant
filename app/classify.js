/* classify.js — тот же классификатор, что classify.py, но на JavaScript.
   Используется страницей загрузки выписки: PDF → операции → категории. */
(function (g) {
  "use strict";

  const WORD = "0-9a-zа-яё_";

  // Python-совместимый \b: в JS \b не понимает кириллицу, поэтому заменяем
  // на границы по классу символов (начало слова → lookbehind, конец → lookahead).
  function reFrom(py) {
    let out = "", i = 0;
    while (i < py.length) {
      if (py[i] === "\\" && py[i + 1] === "b") {
        const before = out.replace(/\s+$/, "");
        const atStart = before === "" || /[|(^[]$/.test(before);
        out += atStart ? `(?<![${WORD}])` : `(?![${WORD}])`;
        i += 2;
        continue;
      }
      out += py[i] === "\\" ? py[i] + (py[i + 1] || "") : py[i];
      i += py[i] === "\\" ? 2 : 1;
    }
    return new RegExp(out, "i");
  }

  const norm = s => s.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

  const LOC = reFrom(
    "\\s+(SANKT[-\\s]?PETERB\\w*|SPETERBU\\w*|ST\\.?\\s?PETERBURG|Sankt[-\\s]?Peter\\w*|St Petersburg|" +
    "MOSKVA|Moskva|Moscow|Gorod Sankt[-\\s]?P\\w*|RUS\\b|RU\\b|Russia|" +
    "Leningradskay\\w*|Petergof|Kolpino|Khimki|Syktyvkar|Gatchina|Vyborg|Kronshtadt|" +
    "Lomonosov|Krasnoe Selo|Domodedovo|Volzhskiy|Tajcy|Letka|Zelenogorsk|Pushkin)\\b.*$");

  function merchantOf(desc) {
    let d = desc;
    const m = /^(Оплата в|Оплата услуг)\s+([\s\S]+)$/i.exec(d);
    if (m) d = m[2];
    d = d.replace(LOC, "");
    d = d.replace(/["'«»]/g, "").replace(/^[\s.,-]+|[\s.,-]+$/g, "");
    d = d.replace(/\s+/g, " ");
    return d || desc;
  }

  function kindOf(desc, amount) {
    const d = desc.toLowerCase();
    const has = p => d.startsWith(p);
    if (has("оплата в") || has("оплата услуг")) return "purchase";
    if (has("плата за") || has("вознаграждение за") || has("комиссия за")) return "fee";
    if (has("снятие наличных")) return "cash_out";
    if (has("внесение наличных")) return "cash_in";
    if (has("пополнение брокерского") || has("пополнение инвесткопилки")) return "invest_out";
    if (has("вывод средств") || has("вывод со")) return "invest_in";
    if (has("внутренний перевод") || has("внутрибанковский перевод") || has("перевод себе")) return "internal";
    if (has("внешний перевод по номеру телефона") || has("перевод по реквизитам карты") || has("внешний перевод по номеру карты")) return "p2p";
    if (has("внешний банковский перевод")) return "ext_bank";
    if (has("пополнение")) return "in_in";
    if (has("возврат") || has("отмена операции") || has("отмена оплаты")) return "refund";
    if (has("кэшбэк")) return "cashback";
    if (has("проценты на")) return "interest";
    if (has("закрытие вклада") || has("частичное изъятие")) return "deposit_in";
    if (has("перевод с") || has("перевод. подарок")) return "in_in";
    if (has("заработная плата") || has("аванс по заработной") || has("зарплата")) return "salary";
    if (has("выплата по вашему обращению") || has("за участие в акции") || has("за приглашение друга")) return "bonus";
    if (d.indexOf("atomyze") >= 0) return amount < 0 ? "invest_out" : "invest_in";
    return "unknown";
  }

  const RULES = [
    ["Транспорт", "metro\\.spb|metro tpp|metrotpp|метро\\b|подорожник|тройка|troika"],
    ["Ставки и азартные игры", "лига ставок|ligastavok|winline|fonbet|betboom|1xstavka|marathonbet|betcity|мобильная карта|цопис|цопис|цупис|bet\\b"],
    ["Доставка еды", "yandex\\*eda|eda\\.yandex|delivery club|edarit|яндекс еда|yamiyami|tokyo-city|sushiwok|dodopizza|додо пицц"],
    ["Табак", "tabak|табак|mostabak|nikotin|никотин|iqos|vape|вейп|smoke\\b|смок|сигарет"],
    ["Продукты", "magnit|магнит|перекрест|перекрёст|perekrest|perekryostok|pyaterochka|пятероч|пятёроч|dixy|дикс|lenta|лента|fixprice|fix price|samokat|самокат|лавка|lavka|sp_market|supermarket|universam|универсам|ашан|auchan|okey|окей|вкусвилл|vkusvill|krasnoe&beloe|красное&белое|магазин|magazin|magaz\\b|продукт|produkty|frukty|фрукты|ovosh|овощ|мясо|myaso|рыба|ryba|kulinariya|кулинария|delikates|dachny|s2b|pavilon|павильон|galamart|best price|vse ot|1001 meloch|vernyj|верный|minuta market|domovoy|домовой|izba|белорусск|belorusskij|lepta|savva|kontinent|spp |sp_|зоотовар|zootovary|petshop|yumamart|puri guli|puriguli|sukhofrukty|сухофрукт|vitamin|market\\b|spp\\b|fiolent|stachek|шаурм|нужно|spetsialitety|специалитет|domashn|домашн|fermer|фермер|ptits|птиц|kolbаs|колбас|syr\\b|сыр"],
    ["Такси и каршеринг", "yandex\\*go|yandexgo|ym\\*go|яндекс go|yandex\\.drive|yandex drive|citydrive|ситидрайв|делимобиль|delimobil|belka car|такси"],
    ["Кикшеринг", "whoosh|юш|yandex\\*yandex\\.scooter|yandex\\.scooter|scooter"],
    ["Транспорт", "метро\\b|подорожник|тройка|troika|gorelektrotrans|gor elektrotrans|электротранспорт|ржд\\b|rzd|автобус|троллейбус|трамвай|transport|транспорт"],
    ["Маркетплейсы", "ozon|wildberries|^wb\\b|яндекс маркет|yandex\\*market|ym\\*market|yandex\\*raspel|aliexpress|мегамаркет|megamarket|avito|авито|playerok|plati\\.market|yandex\\.pay|1cupis|sbermegamarket"],
    ["Одежда и обувь", "zara\\b|h&m|lamoda|kari\\b|кари\\b|sportmaster|спортмастер|decathlon|adidas|nike\\b|tailor|ткани|tkани|shauroom|shau room|russskie kollekcii|russkie kollekcii|modis|befree"],
    ["Красота и уход", "gold apple|goldapple|letu|летуаль|rive gauche|barber|салон|salon|nail|маникюр|parikmaher|парикмахер|kosmet|космет|massazh|массаж"],
    ["Дом и ремонт", "maxidom|максидом|leroy|leroymerlin|leroimerlin|obi\\b|строитель|hozyaystv|хозтов|sofa collection|divan|мебель|ikea|hoff|mebel|pra4ka|prachka|прачеч|хозтовар"],
    ["Питомцы", "zootovary|зоотовар|petshop|pet shop|vet\\b|ветеринар|зоомаг"],
    ["Здоровье и аптеки", "apteka|аптека|zdorov|здоров|medkomiss|медкомисс|zubnoy|зубн|stomat|стомат|klinika|клиник|med\\b|анализ|mrt|мрт|dental"],
    ["Связь и интернет", "yota|йота|beeline|билайн|mts\\b|мтс\\b|megafon|мегафон|tele2|\\bt2\\b|т2\\b|\\bmBank\\b"],
    ["Подписки и сервисы", "yandex\\.plus|яндекс плюс|kinopoisk|ivi\\b|okko|wink|netflix|spotify|apple\\b|google\\b|t-bank\\.t-? ?bundle|t-bundle|сервисы яндекса|сервисы vk|подписк|music|музык|vk music"],
    ["Страхование", "t-ins|strahov|страхов|осаго|каско"],
    ["Развлечения", "kinoteatr|кинотеатр|kino\\b|muzej|музей|erarta|театр|teatr|concert|концерт|paintball|пейнтбол|playstation|steam|game center|игр|billiard|бильярд|quest|квест"],
    ["Госуслуги и налоги", "nalog|налог|gosuslugi|госуслуги|штраф|shtraf|пошлин|госпошлин"],
    ["Образование", "shkola|школа|kursy|курсы|obuchenie|обучение|universitet|универ|school|repetitor|репетитор|книги|knigi|bukvoed|bukvo|litres|литрес"],
    ["Цветы и подарки", "cvety|цветы|flower|flowwow|подарк"],
  ].map(([cat, pat]) => [cat, reFrom(pat)]);

// Общие отраслевые слова и сети, которых не было в первой версии.
// Проверяются ДО основных правил — чтобы «ЗООМАГАЗИН» не попадал в «Продукты» из-за слова «магазин».
const EXTRA_RULES = [
  ["Питомцы", "зоомаг|зоотовар|petshop|vet\\b|ветеринар|ветклиник|корм для|корм\\b"],
  ["Красота и уход", "барбер|barber|маникюр|педикюр|брови|ресниц|солярий|эпиляц|косметолог|nail"],
  ["Кофе и фастфуд", "шоколадниц|кофемани|вкусно и точк|чебуреч|пирожков|блинная|кофейн|пекарн|rostic|ростикс"],
  ["Доставка еды", "самокат\\b|яндекс еда|купер|kuper|сбермаркет|sbermarket"],
  ["Транспорт", "шиномонтаж|автосервис|автомойк|автозапчаст|запчаст|бензин|\\bазс|парковк|parking|техосмотр|автошкол|\\bсто\\b"],
  ["Дом и ремонт", "строймат|обои\\b|плитк|сантехник|электрик|мебель|петрович|leroy|lerua|castorama|касторама|вседлядома"],
  ["Развлечения", "фитнес|fitness|спортзал|тренажер|бассейн|йога|yoga|боулинг|\\bквест|квиз|зоопарк|аттракцион|\\bтир\\b"],
  ["Образование", "книжн|семинар|тренинг|вебинар|репетитор|\\bкурсы|школа"],
  ["Связь и интернет", "теле2|\\bт2\\b|дом\\.ру|domru|ростелеком|rtk|\\bmts\\b|\\bмтс\\b|билайн|beeline|мегафон|megafon|yota|йота"],
  ["Здоровье и аптеки", "медцентр|поликлиник|оптик|окулист|стомат|зубн"],
].map(([cat, pat]) => [cat, reFrom(pat)]);

  function categoryOf(desc, kind) {
    if (kind === "fee") return "Комиссии банка";
    if (kind === "cash_out") return "Снятие наличных";
    if (kind === "p2p") return "Переводы людям";
    if (kind === "ext_bank") return "Переводы в другие банки";
    if (kind === "internal") return "Между своими счетами";
    if (kind === "invest_out" || kind === "invest_in") return "Инвестиции и вклады";
    if (["income", "in_in", "interest", "deposit_in", "cashback", "refund", "salary", "bonus"].indexOf(kind) >= 0) return "Доходы и пополнения";
    const d = desc.toLowerCase();
    for (const [cat, re] of EXTRA_RULES) if (re.test(d)) return cat;
  for (const [cat, re] of RULES) if (re.test(d)) return cat;
    return "Прочее";
  }

  const BRANDS = [
    ["magnit", "Магнит"], ["перекрест|перекрёст|perekrest|perekryostok|x5|2425 перекрест", "Перекрёсток"],
    ["pyaterochka|пятероч|пятёроч|\\bp-t\\b|p-t v", "Пятёрочка"], ["\\bdixy\\b|дикси", "Дикси"],
    ["\\blenta\\b|лента", "Лента"], ["metro", "Metro"], ["fixprice|fix price|fix price_sbp", "Fix Price"],
    ["samokat|самокат", "Самокат"], ["yandex\\*lavka|lavka", "Лавка"], ["vkusvill|вкусвилл", "ВкусВилл"],
    ["krasnoe&beloe|красное&белое", "Красное&Белое"], ["kukhn|кухня|kuhnya", "Кухня"],
    ["mrblack|black coffee", "MrBlack Coffee"], ["whoosh", "Whoosh"],
    ["yandex\\*yandex\\.scooter|yandex\\.scooter", "Яндекс Самокаты"], ["ym\\*go scooter|yandex\\*go|yandexgo|ym\\*go|яндекс go", "Яндекс Go"],
    ["yandex\\*eda|eda\\.yandex", "Яндекс Еда"], ["ozon", "OZON"], ["wildberries", "Wildberries"],
    ["yandex\\*market|ym\\*market", "Яндекс Маркет"], ["\\bmagaz", "Магазин у дома"],
    ["kfc", "KFC"], ["burger king|бургер кинг", "Burger King"], ["ro(s|st)ics|ростикс", "Rostic's"],
    ["додо|dodo", "Додо Пицца"], ["dostaevsky", "Достоевский"], ["tabak|табак|mostabak", "Табачная лавка"],
    ["сервисы яндекса|yandex\\.plus", "Яндекс Плюс"], ["yota", "Yota"], ["beeline|билайн", "Билайн"],
    ["мобильная карта", "ЦУПИС (НКО Мобильная карта)"], ["лига ставок", "Лига Ставок"],
    ["apteka|аптека|zdorov", "Аптека"], ["maxidom", "MAXIDOM"], ["sofa collection", "Sofa Collection"],
  ["kukhn", "Кухня"], ["pekarn|пекарн", "Пекарня"],
    ["kinoteatr|кинотеатр", "Кинотеатр"], ["muzej|музей|erarta", "Музей"],
    ["yandex\\.drive|yandex drive", "Яндекс Драйв"], ["cvety|цветы", "Цветы"],
    ["pravka|prachka|прачеч", "Прачечная"], ["wildberries", "Wildberries"],
    ["yandex\\.pay", "Яндекс Pay"], ["t-ins", "Т-Банк Страхование"], ["t-bundle", "Т-Банк Bundle"],
  ].map(([pat, name]) => [reFrom(pat), name]);

  const title = s => s.replace(/(^|[\s\-])([a-zа-яё])/g, (m, a, b) => a + b.toUpperCase());
  const isUpper = s => s === s.toUpperCase();

  function brandOf(desc, merchant, cat) {
    const d = desc.toLowerCase();
    for (const [re, name] of BRANDS) if (re.test(d)) return name;
    if (cat !== "Прочее") {
      let m = merchant.replace(/\b(IP|PE|OOO|ООО|SP_|EVO_|SBP|QR|LLC|AO|CZAO)\b/gi, " ");
      m = m.replace(/[\s_]+/g, " ").replace(/^[\s.-]+|[\s.-]+$/g, "");
      return isUpper(m) ? title(m) : m;
    }
    return isUpper(merchant) ? title(merchant) : merchant;
  }

  // ---------- Сбер ----------
  const JUNK = /\.?\s*Операция по карте \*+\d+/i;
  const FOOT = /Продолжение на следующей странице/i;
  const SBER_CAT = {
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
  };
  const SALARY = /заработная плата|аванс по заработной|отпускные|расчет при увольнении|прочие выплаты/i;
  const OWN = /sberbank onl@in|vklad-karta|p2p|перевод между своими|вклад/i;

  const cleanSber = desc => norm(desc.replace(JUNK, "").replace(FOOT, ""));

  function sberKind(rec, desc, amount) {
    const rawCat = rec.category_raw, d = desc.toLowerCase();
    if (rawCat === "Возврат, отмена операции" || rawCat === "Возврат покупки по QR–коду СБП") return "refund";
    if (d.indexOf("komissiya") >= 0 || d.startsWith("mobile bank")) return "fee";
    if (rawCat === "Выдача наличных") return "cash_out";
    if (rawCat === "Внесение наличных") return "cash_in";
    if (rawCat === "Перевод СБП" || rawCat === "Перевод с карты" || rawCat === "Перевод на карту")
      return OWN.test(desc) ? "internal" : "p2p";
    if (amount > 0 && SALARY.test(desc)) return "salary";
    if (amount > 0 && OWN.test(desc)) return "in_in";
    if (amount > 0 && rawCat === "Прочие операции") return "p2p";
    const k = kindOf(desc, amount);
    if (k === "unknown" || k === "purchase") return amount < 0 ? "purchase" : "in_in";
    return k;
  }

  function sberCategory(rec, desc, kind) {
    if (kind === "fee") return "Комиссии банка";
    if (kind === "cash_out") return "Снятие наличных";
    if (kind === "p2p") return "Переводы людям";
    if (kind === "cash_in") return "Доходы и пополнения";
    if (["salary", "in_in", "refund", "interest", "bonus", "cashback"].indexOf(kind) >= 0) return "Доходы и пополнения";
    const cat = categoryOf(desc, kind);
    if (cat !== "Прочее") return cat;
    return SBER_CAT[rec.category_raw] || "Прочее";
  }

  function classifyTb(row) {
    const desc = norm(row.desc);
    const kind = kindOf(desc, row.amount);
    const cat = categoryOf(desc, kind);
    const merch = merchantOf(desc);
    return { desc, k: kind, c: cat, m: merch, b: brandOf(desc, merch, cat) };
  }

  function classifySber(row) {
    const desc = cleanSber(row.desc) || row.category_raw;
    const kind = sberKind(row, desc, row.amount);
    const cat = sberCategory(row, desc, kind);
    const merch = merchantOf(desc);
    return { desc, k: kind, c: cat, m: merch, b: brandOf(desc, merch, cat) };
  }

  g.CLASSIFY = { norm, merchantOf, kindOf, categoryOf, brandOf, classifyTb, classifySber };
  if (typeof module !== "undefined" && module.exports) module.exports = g.CLASSIFY;
})(typeof globalThis !== "undefined" ? globalThis : this);
