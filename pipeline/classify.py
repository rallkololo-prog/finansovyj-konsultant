# -*- coding: utf-8 -*-
"""v2: классификация + бренды."""
import json, re
from collections import Counter, defaultdict

SRC = r"C:\Users\geo\Desktop\Cloude\Moi rascheti\transactions.json"

def norm(s):
    s = s.replace("\u00a0", " ")
    return re.sub(r"\s+", " ", s).strip()

LOC = re.compile(
    r"\s+(SANKT[-\s]?PETERB\w*|SPETERBU\w*|ST\.?\s?PETERBURG|Sankt[-\s]?Peter\w*|St Petersburg|"
    r"MOSKVA|Moskva|Moscow|Gorod Sankt[-\s]?P\w*|RUS\b|RU\b|Russia|"
    r"Leningradskay\w*|Petergof|Kolpino|Khimki|Syktyvkar|Gatchina|Vyborg|Kronshtadt|"
    r"Lomonosov|Krasnoe Selo|Domodedovo|Volzhskiy|Tajcy|Letka|Zelenogorsk|Pushkin)\b.*$", re.I)

def merchant_of(desc):
    d = desc
    m = re.match(r"^(Оплата в|Оплата услуг)\s+(.+)$", d, re.I)
    if m:
        d = m.group(2)
    d = LOC.sub("", d)
    d = re.sub(r"[\"'«»]", "", d).strip(" .,-")
    d = re.sub(r"\s+", " ", d)
    return d or desc

def kind_of(desc, amount):
    d = desc.lower()
    if d.startswith("оплата в") or d.startswith("оплата услуг"):
        return "purchase"
    if d.startswith("плата за") or d.startswith("вознаграждение за") or d.startswith("комиссия за"):
        return "fee"
    if d.startswith("снятие наличных"):
        return "cash_out"
    if d.startswith("внесение наличных"):
        return "cash_in"
    if d.startswith("пополнение брокерского") or d.startswith("пополнение инвесткопилки"):
        return "invest_out"
    if d.startswith("вывод средств") or d.startswith("вывод со"):
        return "invest_in"
    if d.startswith("внутренний перевод") or d.startswith("внутрибанковский перевод") or d.startswith("перевод себе"):
        return "internal"
    if d.startswith("внешний перевод по номеру телефона") or d.startswith("перевод по реквизитам карты") or d.startswith("внешний перевод по номеру карты"):
        return "p2p"
    if d.startswith("внешний банковский перевод"):
        return "ext_bank"
    if d.startswith("пополнение"):
        return "in_in"
    if d.startswith("возврат") or d.startswith("отмена операции") or d.startswith("отмена оплаты"):
        return "refund"
    if d.startswith("кэшбэк"):
        return "cashback"
    if d.startswith("проценты на"):
        return "interest"
    if d.startswith("закрытие вклада") or d.startswith("частичное изъятие"):
        return "deposit_in"
    if d.startswith("перевод с") or d.startswith("перевод. подарок"):
        return "in_in"
    if d.startswith("заработная плата") or d.startswith("аванс по заработной") or d.startswith("зарплата"):
        return "salary"
    if d.startswith("выплата по вашему обращению") or d.startswith("за участие в акции") or d.startswith("за приглашение друга"):
        return "bonus"
    if "atomyze" in d:
        return "invest_out" if amount < 0 else "invest_in"
    return "unknown"

# Общие отраслевые слова и сети: проверяются ДО основных правил,
# чтобы «ЗООМАГАЗИН» не попадал в «Продукты» из-за слова «магазин».
EXTRA_RULES = [
    ("Питомцы", r"зоомаг|зоотовар|petshop|vet\b|ветеринар|ветклиник|корм для|корм\b"),
    ("Красота и уход", r"барбер|barber|маникюр|педикюр|брови|ресниц|солярий|эпиляц|косметолог|nail"),
    ("Кофе и фастфуд", r"шоколадниц|кофемани|вкусно и точк|чебуреч|пирожков|блинная|кофейн|пекарн|rostic|ростикс"),
    ("Доставка еды", r"самокат\b|яндекс еда|купер|kuper|сбермаркет|sbermarket"),
    ("Транспорт", r"шиномонтаж|автосервис|автомойк|автозапчаст|запчаст|бензин|\bазс|парковк|parking|техосмотр|автошкол|\bсто\b"),
    ("Дом и ремонт", r"строймат|обои\b|плитк|сантехник|электрик|мебель|петрович|leroy|lerua|castorama|касторама|вседлядома"),
    ("Развлечения", r"фитнес|fitness|спортзал|тренажер|бассейн|йога|yoga|боулинг|\bквест|квиз|зоопарк|аттракцион|\bтир\b"),
    ("Образование", r"книжн|семинар|тренинг|вебинар|репетитор|\bкурсы|школа"),
    ("Связь и интернет", r"теле2|\bт2\b|дом\.ру|domru|ростелеком|rtk|\bmts\b|\bмтс\b|билайн|beeline|мегафон|megafon|yota|йота"),
    ("Здоровье и аптеки", r"медцентр|поликлиник|оптик|окулист|стомат|зубн"),
]

# (category, regex) — порядок важен
RULES = [
    ("Транспорт", r"metro\.spb|metro tpp|metrotpp|метро\b|подорожник|тройка|troika"),
    ("Ставки и азартные игры", r"лига ставок|ligastavok|winline|fonbet|betboom|1xstavka|marathonbet|betcity|мобильная карта|цопис|цопис|цупис|bet\b"),
    ("Доставка еды", r"yandex\*eda|eda\.yandex|delivery club|edarit|яндекс еда|yamiyami|tokyo-city|sushiwok|dodopizza|додо пицц"),
    ("Табак", r"tabak|табак|mostabak|nikotin|никотин|iqos|vape|вейп|smoke\b|смок|сигарет"),
    ("Продукты", r"magnit|магнит|перекрест|перекрёст|perekrest|perekryostok|pyaterochka|пятероч|пятёроч|dixy|дикс|lenta|лента|fixprice|fix price|samokat|самокат|лавка|lavka|sp_market|supermarket|universam|универсам|ашан|auchan|okey|окей|вкусвилл|vkusvill|krasnoe&beloe|красное&белое|магазин|magazin|magaz\b|продукт|produkty|frukty|фрукты|ovosh|овощ|мясо|myaso|рыба|ryba|kulinariya|кулинария|delikates|dachny|s2b|pavilon|павильон|galamart|best price|vse ot|1001 meloch|vernyj|верный|minuta market|domovoy|домовой|izba|белорусск|belorusskij|lepta|savva|kontinent|spp |sp_|зоотовар|zootovary|petshop|yumamart|puri guli|puriguli|sukhofrukty|сухофрукт|vitamin|market\b|spp\b|fiolent|stachek|шаурм|нужно|spetsialitety|специалитет|domashn|домашн|fermer|фермер|ptits|птиц|kolbаs|колбас|syr\b|сыр"),
    ("Кофе и фастфуд", r"mrblack|black coffee|coffee|кофе|coffe|cafe\b|kafe|кафе|kfc|burger|бургер|rostics|ростикс|dodo|pizza|пицца|papa grill|shaverma|шаверма|шаурма|shaurma|shaverm|teremok|теремок|subway|vkusnoitochka|вкусно|qsr|beggins|baggins|one price|dunot|donuts|bulochnaya|булочная|pekarn|пекарн|bakery|zernyshkin|khlebnik|хлеб|prozharka|kebab|кебаб|манты|manty|суши|sushi|wok|shashlyk|шашлык|ketch|cekh 85|pita|pitaf|pitafoud|taiyaki|kimchi|lyudi lyub|konditersk|кондитер|vypechka|выпечк|blin|блин|chaynaya|чайная|napitki|напитк|\beda\b|еда\b|food|fud |sma(jl|il)|strit fud|restoran|restaurant|bistro|столовая|stolovaya|garage|kruchu|meat fusion|bbq|afonya|piter perv|potemkinskaya|chuck|miteriya|kukhnya|кухня|rusalka|plovdiv|dostaevsky|khard koin|perepе4ki|perepe4ki|просто вася|prosto vasya|гунфу|gongfu|sha(u)?rm|хинкал|khinkal|пхали|хачапур|чебурек|самса|narez|булоч|chuck|kyami|kiyameev|faraon|мu-mu|mu-mu|столовая|vkus\b"),
    ("Такси и каршеринг", r"yandex\*go|yandexgo|ym\*go|яндекс go|yandex\.drive|yandex drive|citydrive|ситидрайв|делимобиль|delimobil|belka car|такси"),
    ("Кикшеринг", r"whoosh|юш|yandex\*yandex\.scooter|yandex\.scooter|scooter"),
    ("Транспорт", r"метро\b|подорожник|тройка|troika|gorelektrotrans|gor elektrotrans|электротранспорт|ржд\b|rzd|автобус|троллейбус|трамвай|transport|транспорт"),
    ("Маркетплейсы", r"ozon|wildberries|^wb\b|яндекс маркет|yandex\*market|ym\*market|yandex\*raspel|aliexpress|мегамаркет|megamarket|avito|авито|playerok|plati\.market|yandex\.pay|1cupis|sbermegamarket"),
    ("Одежда и обувь", r"zara\b|h&m|lamoda|kari\b|кари\b|sportmaster|спортмастер|decathlon|adidas|nike\b|tailor|ткани|tkани|shauroom|shau room|russskie kollekcii|russkie kollekcii|modis|befree"),
    ("Красота и уход", r"gold apple|goldapple|letu|летуаль|rive gauche|barber|салон|salon|nail|маникюр|parikmaher|парикмахер|kosmet|космет|massazh|массаж"),
    ("Дом и ремонт", r"maxidom|максидом|leroy|leroymerlin|leroimerlin|obi\b|строитель|hozyaystv|хозтов|sofa collection|divan|мебель|ikea|hoff|mebel|pra4ka|prachka|прачеч|хозтовар"),
    ("Питомцы", r"zootovary|зоотовар|petshop|pet shop|vet\b|ветеринар|зоомаг"),
    ("Здоровье и аптеки", r"apteka|аптека|zdorov|здоров|medkomiss|медкомисс|zubnoy|зубн|stomat|стомат|klinika|клиник|med\b|анализ|mrt|мрт|dental"),
    ("Связь и интернет", r"yota|йота|beeline|билайн|mts\b|мтс\b|megafon|мегафон|tele2|\bt2\b|т2\b|\bmBank\b"),
    ("Подписки и сервисы", r"yandex\.plus|яндекс плюс|kinopoisk|ivi\b|okko|wink|netflix|spotify|apple\b|google\b|t-bank\.t-? ?bundle|t-bundle|сервисы яндекса|сервисы vk|подписк|music|музык|vk music"),
    ("Страхование", r"t-ins|strahov|страхов|осаго|каско"),
    ("Развлечения", r"kinoteatr|кинотеатр|kino\b|muzej|музей|erarta|театр|teatr|concert|концерт|paintball|пейнтбол|playstation|steam|game center|игр|billiard|бильярд|quest|квест"),
    ("Госуслуги и налоги", r"nalog|налог|gosuslugi|госуслуги|штраф|shtraf|пошлин|госпошлин"),
    ("Образование", r"shkola|школа|kursy|курсы|obuchenie|обучение|universitet|универ|school|repetitor|репетитор|книги|knigi|bukvoed|bukvo|litres|литрес"),
    ("Цветы и подарки", r"cvety|цветы|flower|flowwow|подарк"),
]

def category_of(desc, kind):
    if kind == "fee":
        return "Комиссии банка"
    if kind == "cash_out":
        return "Снятие наличных"
    if kind == "p2p":
        return "Переводы людям"
    if kind == "ext_bank":
        return "Переводы в другие банки"
    if kind == "internal":
        return "Между своими счетами"
    if kind in ("invest_out", "invest_in"):
        return "Инвестиции и вклады"
    if kind in ("income", "in_in", "interest", "deposit_in", "cashback", "refund", "salary", "bonus"):
        return "Доходы и пополнения"
    d = desc.lower()
    for cat, pat in EXTRA_RULES:
        if re.search(pat, d):
            return cat
    for cat, pat in RULES:
        if re.search(pat, d, re.I):
            return cat
    return "Прочее"

BRANDS = [
    (r"magnit", "Магнит"), (r"перекрест|перекрёст|perekrest|perekryostok|x5|2425 перекрест", "Перекрёсток"),
    (r"pyaterochka|пятероч|пятёроч|\bp-t\b|p-t v", "Пятёрочка"), (r"\bdixy\b|дикси", "Дикси"),
    (r"\blenta\b|лента", "Лента"), (r"metro", "Metro"), (r"fixprice|fix price|fix price_sbp", "Fix Price"),
    (r"samokat|самокат", "Самокат"), (r"yandex\*lavka|lavka", "Лавка"), (r"vkusvill|вкусвилл", "ВкусВилл"),
    (r"krasnoe&beloe|красное&белое", "Красное&Белое"), (r"kukhn|кухня|kuhnya", "Кухня"),
    (r"mrblack|black coffee", "MrBlack Coffee"), (r"whoosh", "Whoosh"),
    (r"yandex\*yandex\.scooter|yandex\.scooter", "Яндекс Самокаты"), (r"ym\*go scooter|yandex\*go|yandexgo|ym\*go|яндекс go", "Яндекс Go"),
    (r"yandex\*eda|eda\.yandex", "Яндекс Еда"), (r"ozon", "OZON"), (r"wildberries", "Wildberries"),
    (r"yandex\*market|ym\*market", "Яндекс Маркет"), (r"\bmagaz", "Магазин у дома"),
    (r"kfc", "KFC"), (r"burger king|бургер кинг", "Burger King"), (r"ro(s|st)ics|ростикс", "Rostic's"),
    (r"додо|dodo", "Додо Пицца"), (r"dostaevsky", "Достоевский"), (r"tabak|табак|mostabak", "Табачная лавка"),
    (r"сервисы яндекса|yandex\.plus", "Яндекс Плюс"), (r"yota", "Yota"), (r"beeline|билайн", "Билайн"),
    (r"мобильная карта", "ЦУПИС (НКО Мобильная карта)"), (r"лига ставок", "Лига Ставок"),
    (r"apteka|аптека|zdorov", "Аптека"), (r"maxidom", "MAXIDOM"), (r"sofa collection", "Sofa Collection"),
    (r"teterina", "ИП Тетерина"), (r"mitrofanov", "ИП Митрофанов"), (r"glukhova", "Глухова Е.М."),
    (r"shvecova", "Швецова Мурад"), (r"akhmedova", "ИП Ахмедова"), (r"sadygov", "Садыгов Турал"),
    (r"liflyandiya", "Лифляндия"), (r"plovdiv", "Пловдив"), (r"khard koin", "Hard Coin"),
    (r"rusalka", "Русалка"), (r"perepе4ki|perepe4ki", "Перепечки"), (r"kukhn", "Кухня"),
    (r"zero|zernyshkin", "Зернышкин"), (r"khlebnik", "Хлебник"), (r"pekarn|пекарн", "Пекарня"),
    (r"kinoteatr|кинотеатр", "Кинотеатр"), (r"muzej|музей|erarta", "Музей"),
    (r"yandex\.drive|yandex drive", "Яндекс Драйв"), (r"cvety|цветы", "Цветы"),
    (r"pravka|prachka|прачеч", "Прачечная"), (r"wildberries", "Wildberries"),
    (r"yandex\.pay", "Яндекс Pay"), (r"t-ins", "Т-Банк Страхование"), (r"t-bundle", "Т-Банк Bundle"),
]

def brand_of(desc, merchant, cat):
    d = desc.lower()
    for pat, name in BRANDS:
        if re.search(pat, d):
            return name
    if cat != "Прочее":
        # очищенное имя продавца
        m = re.sub(r"\b(IP|PE|OOO|ООО|ООО|SP_|EVO_|SBP|QR|LLC|AO|CZAO|AO)\b", " ", merchant, flags=re.I)
        m = re.sub(r"[\s_]+", " ", m).strip(" .-")
        return m.title() if m.isupper() else m
    return merchant.title() if merchant.isupper() else merchant

def main():
    txs = json.load(open(SRC, encoding="utf-8"))
    out = []
    for t in txs:
        desc = norm(t["desc"])
        amt = round(t["rub_v"], 2)
        kind = kind_of(desc, amt)
        cat = category_of(desc, kind)
        mer = merchant_of(desc)
        out.append({"d": t["op_date"], "t": t.get("op_time") or "", "a": amt, "desc": desc,
                    "m": mer, "b": brand_of(desc, mer, cat), "k": kind, "c": cat})
    json.dump(out, open(r"C:\Users\geo\Desktop\Cloude\Moi rascheti\tx_classified.json", "w", encoding="utf-8"), ensure_ascii=False)

    rep = []
    kind_tot = defaultdict(lambda: [0, 0.0])
    for r in out:
        kind_tot[r["k"]][0] += 1; kind_tot[r["k"]][1] += r["a"]
    rep.append("KIND TOTALS")
    for k, (c, s) in sorted(kind_tot.items(), key=lambda kv: -abs(kv[1][1])):
        rep.append(f"{k:12s} {c:5d} {s:14.2f}")
    cat_tot = defaultdict(lambda: [0, 0.0])
    for r in out:
        if r["k"] in ("purchase", "fee", "cash_out"):
            cat_tot[r["c"]][0] += 1; cat_tot[r["c"]][1] += -r["a"]
    rep.append("\nCATEGORY TOTALS")
    for c, (n, s) in sorted(cat_tot.items(), key=lambda kv: -kv[1][1]):
        rep.append(f"{c:26s} {n:5d} {s:12.2f}")
    rows = defaultdict(lambda: [0, 0.0])
    for r in out:
        if r["k"] == "purchase" and r["c"] == "Прочее":
            rows[r["m"].upper()][0] += 1; rows[r["m"].upper()][1] += -r["a"]
    rep.append("\nTOP UNCATEGORIZED")
    for m, (n, s) in sorted(rows.items(), key=lambda kv: -kv[1][1])[:50]:
        rep.append(f"{s:10.2f} {n:4d} {m}")
    open(r"C:\Users\geo\Desktop\Cloude\Moi rascheti\classify_report.txt", "w", encoding="utf-8").write("\n".join(rep))
    print("ok")

main()
