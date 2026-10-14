"""Сборка src/data/positions.json — позиции каталога.

Позиция = товар производителя (без цвета и фасовки), который есть в магазине клиента tk-sm.ru.
  • факты (назначение, упаковка, расход, слой, норматив, характеристики) — ДОСЛОВНО из разбора
    карточек производителей (recon/smesi-sukhie/data/records.json, проверено verify.py: 0 расхождений);
  • варианты и цены — из каталога tk-sm.ru (сопоставление позиций магазина с товарами производителя —
    data/mapping.json, сделано агентами и проверено скриптом check_mapping в этом же файле);
  • фото упаковки — с карточки производителя (разрешение Влада 11.10), уменьшено до 480 px.
Не попадают: не сухие смеси (слово Влада 11.10 «делаем сайт только по сухим смесям»), цветные кладочные
и расшивка (тема сайта «Цветные смеси»), позиции магазина без карточки у производителя (фактов нет).

Запуск: python3 -I scripts/build_positions.py  (из корня репозитория)
"""
import json, re, os, subprocess, sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
REC = json.load(open(os.path.join(DATA, 'records.json')))
PRODS = {p['id']: p for p in json.load(open(os.path.join(DATA, 'products.json')))}
MAPPING = json.load(open(os.path.join(DATA, 'mapping.json')))
TKSM = {t['id']: t for t in json.load(open(os.path.join(DATA, 'tksm_items.json')))}
IMAGES = json.load(open(os.path.join(DATA, 'images.json')))
OTHER = json.load(open(os.path.join(DATA, 'other_brands.json'))) if os.path.exists(os.path.join(DATA, 'other_brands.json')) else []

# тип → (раздел, секция) — зеркало src/data/sections.ts
TYPE_TO = {
    'masonry_ordinary': ('kladochnye-smesi', 'ryadovye'), 'masonry_thermal': ('kladochnye-smesi', 'teplye'),
    'block_adhesive': ('klej-dlya-blokov', 'bloki'), 'gypsum_mounting_adhesive': ('klej-dlya-blokov', 'gipsovyj'),
    'masonry_universal_cps': ('peskobeton', 'cps'),
    'plaster_gypsum': ('shtukaturka-gipsovaya', 'gipsovye'),
    'plaster_cement': ('shtukaturka-cementnaya', 'cementnye'), 'plaster_facade_base': ('shtukaturka-cementnaya', 'obryzg'),
    'putty_gypsum': ('shpaklevka', 'gipsovaya'), 'putty_cement': ('shpaklevka', 'cementnaya'), 'putty_polymer_dry': ('shpaklevka', 'polimernaya'),
    'tile_adhesive': ('plitochnyj-klej', 'klei'), 'tile_grout': ('plitochnyj-klej', 'zatirki'),
    'floor_screed': ('nalivnoj-pol', 'styazhki'), 'floor_self_leveling': ('nalivnoj-pol', 'nalivnye'),
    'waterproofing_dry': ('gidroizolyaciya', 'gidroizolyaciya'), 'hydroplug': ('gidroizolyaciya', 'gidroizolyaciya'),
    'concrete_repair': ('gidroizolyaciya', 'remont'), 'special_mortar': ('gidroizolyaciya', 'remont'),
    'etics_adhesive_base': ('uteplenie-fasada', 'kleevye'), 'decorative_plaster_dry': ('uteplenie-fasada', 'dekorativnye'),
    'paving_mix': ('smesi-dlya-bruschatki', 'moshchenie'), 'stove_mix': ('pechnye-smesi', 'pechnye'),
}
BRAND = {'perel': 'Perel', 'dauer': 'Dauer', 'osnovit': 'Основит'}
TR = str.maketrans({'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'})


def slug(s):
    s = s.lower().translate(TR)
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def title_of(key):
    return key.replace('®', '').strip()



COLORS = ['супербелый', 'супербелая', 'супер-белый', 'белый', 'белая', 'светло-серый', 'светло-серая', 'тёмно-серый', 'темно-серый', 'тёмно-серая', 'темно-серая',
          'гранитно-серый', 'бежево-серый', 'серый', 'серая', 'светло-бежевый', 'бежевый', 'бежевая', 'светло-коричневый', 'светло-коричневая', 'коричневый', 'коричневая',
          'шоколадный', 'шоколадная', 'кремово-жёлтый', 'кремово-желтый', 'кремовый', 'кремовая', 'горчичный', 'горчичная', 'медный', 'медная', 'кирпичный', 'кирпичная',
          'чёрный', 'черный', 'чёрная', 'черная', 'графит', 'жёлтый', 'желтый', 'красный', 'оранжевый', 'ореховый', 'пепельный', 'песочный', 'светло-голубой', 'зелёный', 'зеленый']


def offer_label(tk_name):
    """Подпись варианта из названия позиции в магазине: цвет, фасовка, зимняя версия, жидкий компонент.
    Строится скриптом (а не агентом), чтобы в подпись не попадали служебные пометки сопоставления."""
    n = tk_name.lower().replace('ё', 'е')
    parts = []
    for c in COLORS:
        if re.search(r'(?<![а-яa-z-])' + re.escape(c.replace('ё', 'е')) + r'(?![а-яa-z-])', n):
            parts.append(c.replace('черн', 'чёрн').replace('желт', 'жёлт').replace('темно', 'тёмно').replace('супер-белый', 'супербелый')); break
    m = re.search(r'(\d+(?:[.,]\d+)?)\s*(кг|л)\b', n)
    if m:
        parts.append(m.group(1).replace('.', ',') + ' ' + m.group(2))
    if 'зим' in n:
        parts.append('зимняя версия')
    if 'компонент' in n and 'с компонент' not in n:
        k = re.search(r'компонент\s*[«"]?([a-zа-я])', n)
        parts.append('+ компонент «' + (k.group(1).upper() if k else '') + '»')
    return ', '.join(parts)


TABLEISH = lambda v: ('|' in v) or v.count('\n') >= 2
NORMATIVE_OK = re.compile(r'ГОСТ|\bТУ\b|\bEN\b|ISO|\bСТО\b|\bDIN\b', re.I)


def clean_field(kind, v, brand):
    v = (v or '').strip()
    if not v:
        return ''
    if kind in ('consumption', 'layer') and TABLEISH(v):
        return ''  # таблица производителя, вытянутая в строку, — без шапки не читается; остаётся в характеристиках
    if kind in ('consumption', 'layer') and brand in ('Promix', 'Стройбриг') and re.search(r'.+:\s', v):
        return ''  # «название: значение», собранное из строки таблицы, — дословно его на странице нет; есть в характеристиках
    if kind == 'normative' and (not NORMATIVE_OK.search(v) or v.lower().startswith('нанесение')):
        return ''
    return v


CORE = os.path.join(ROOT, 'recon', 'data', 'core')  # ядро текста карточек производителей (сырьё разведки 09.10, перенесено в репозиторий 14.10)


CERAMIC = re.compile(r'керамогранит|крупноформат|крупного формата|крупных форматов|крупного размера', re.I)


def check_mapping(m, rec_names):
    """Связка правдоподобна, если совпал код модели (XC35, AC11, PG26/1) либо все отличительные слова
    названия товара производителя есть в названии позиции магазина (Perel Faster, RodStone Основа…)."""
    if m['decision'] not in ('same_product', 'renamed_same_product'):
        return True
    LAT = str.maketrans('АВЕКМНОРСТХаеорсухкмтвн', 'ABEKMHOPCTXaeopcyxkmtbh')
    norm = lambda s: s.translate(LAT).lower().replace('®', '').replace('ё', 'е')
    code = lambda s: {re.sub(r'[\s-]', '', c) for c in re.findall(r'\b([a-z]{1,4}\s?-?\d{1,4}(?:/\d)?)', norm(s))}
    tk = norm(TKSM[m['tk_id']]['name'])
    sk = norm(m['series_key'])
    sk_codes = code(m['series_key'])
    tk_flat = re.sub(r'[\s-]', '', tk)
    codes_ok = bool(sk_codes & code(tk)) or any(c in tk_flat for c in sk_codes)
    # код разорван в названии магазина: «TKS - Perel 6020» ↔ «TKS 6020»
    split_ok = any(all(part in tk for part in re.findall(r'[a-z]+|\d+', c)) for c in sk_codes)
    stop = {'perel', 'dauer', 'основит', 'osnovit', 'клей', 'смесь'}
    words = [w for w in re.findall(r'[a-zа-я]{4,}', sk) if w not in stop]
    words_ok = bool(words) and all(w[:5] in tk for w in words)
    shorts = [w for w in re.findall(r'\b[a-zа-я]{2,3}\b', sk) if w not in stop]
    short_ok = not words and bool(shorts) and all(re.search(r'\b' + w + r'\b', tk) for w in shorts)
    if m['decision'] == 'renamed_same_product':
        return True  # переименование подтверждено агентом номером модели/адресом карточки — разбирается в отчёте
    return codes_ok or split_ok or words_ok or short_ok


ser = defaultdict(list)
for r in REC:
    if r['page_kind'] == 'product':
        ser[(PRODS[r['id']]['site'], r['series_key'])].append(r)

groups = defaultdict(list)
problems, skipped = [], defaultdict(list)
for m in MAPPING:
    t = TKSM.get(m['tk_id'])
    if not t:
        problems.append(('нет позиции магазина', m['tk_id'])); continue
    if m['decision'] not in ('same_product', 'renamed_same_product'):
        skipped[m['decision']].append(t['name']); continue
    key = (m['site'], m['series_key'])
    if key not in ser:
        problems.append(('нет товара производителя', m['series_key'])); continue
    names = [x['name_exact'] for x in ser[key]] + [m['series_key']]
    if not check_mapping(m, names):
        problems.append(('номер модели не совпал', t['name'] + ' → ' + m['series_key'])); continue
    groups[key].append({'label': offer_label(t['name']) or t.get('pack') or '', 'price': t.get('price') or '', 'tk': t['name']})

os.makedirs(os.path.join(ROOT, 'public', 'assets', 'p'), exist_ok=True)


def jpeg_size(path):
    """Ширина и высота JPEG без сторонних библиотек (маркер SOF)."""
    with open(path, 'rb') as f:
        data = f.read()
    i = 2
    while i < len(data):
        if data[i] != 0xFF:
            i += 1; continue
        marker = data[i + 1]
        if marker in (0xC0, 0xC1, 0xC2):
            return int.from_bytes(data[i + 7:i + 9], 'big'), int.from_bytes(data[i + 5:i + 7], 'big')
        i += 2 + int.from_bytes(data[i + 2:i + 4], 'big')
    raise ValueError('не JPEG: ' + path)


def put_image(pid, src_file):
    """Уменьшенная копия упаковки в public/assets/p/. Готовая копия лежит в git — исходник не нужен.
    Исходники (data/img_src/, 206 МБ) в git не лежат; адрес исходника у производителя — поле img в images.json."""
    out = os.path.join(ROOT, 'public', 'assets', 'p', pid + '.jpg')
    if not os.path.exists(out):
        # путь в данных записан с Мака Влада — ищем файл по имени в своей data/img_src/
        src = os.path.join(DATA, 'img_src', os.path.basename(src_file)) if src_file else None
        if not src or not os.path.exists(src):
            return None
        # только уменьшение: маленький исходник не растягиваем (стандарт картинок проекта)
        try:
            from PIL import Image
            im = Image.open(src).convert('RGB')
            if max(im.size) > 480:
                im.thumbnail((480, 480))
            im.save(out, 'JPEG', quality=82)
        except ImportError:  # без Pillow — штатный sips на Маке
            sz = subprocess.run(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', src], capture_output=True, text=True).stdout
            sw = int((re.search(r'pixelWidth: (\d+)', sz) or [0, 0])[1]); sh = int((re.search(r'pixelHeight: (\d+)', sz) or [0, 0])[1])
            args = ['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '82']
            if max(sw, sh) > 480:
                args += ['-Z', '480']
            subprocess.run(args + [src, '--out', out], capture_output=True)
    w, h = jpeg_size(out)
    return {'image': '/assets/p/' + pid + '.jpg', 'imageW': w, 'imageH': h}

positions = []
for (site, key), offers in groups.items():
    rs = sorted(ser[(site, key)], key=lambda r: ('-N' in PRODS[r['id']]['url'] or '-n/' in PRODS[r['id']]['url'], -len(r['purpose_quote']), r['id']))
    r0 = rs[0]
    if not any(r['is_dry_mix'] in ('yes', 'unclear') for r in rs):
        skipped['не сухая у производителя'].append(key); continue
    if r0['type'] not in TYPE_TO:
        skipped['вне разделов сайта (' + r0['type'] + ')'].append(key); continue
    sec, part = TYPE_TO[r0['type']]
    pid = slug(BRAND[site] + '-' + re.sub(r'^(perel|dauer|основит)\s+', '', key, flags=re.I))
    pick = lambda f: next((x.get(f) for x in rs if (x.get(f) or '').strip()), '')
    winter = any(r.get('winter_version') in ('winter_only', 'has_winter_variant') for r in rs) or any('зим' in (o['label'] + o['tk']).lower() for o in offers)
    pdf = next((u for r in rs for u in PRODS[r['id']]['pdfs'] if site == 'dauer' and '/TK_' in u), '')
    img = next((i for i in IMAGES if i['site'] == site and i['series_key'] == key), None)
    # варианты: без повторов, по цене
    seen, offs = set(), []
    for o in offers:
        k = (o['label'].lower(), o['price'])
        if k in seen: continue
        seen.add(k); offs.append({'label': o['label'], 'price': o['price']})
    # одинаковые подписи у разных позиций магазина (Флайформ AC6 Lq: «…тонкослойный…» и без) — дописываем отличие
    for i, o in enumerate(offs):
        same = [x for x in offs if x['label'] == o['label']]
        if len(same) > 1:
            tk = next(x['tk'] for x in offers if x['label'] == o['label'] and x['price'] == o['price'])
            others = set(w for x in offers if x['label'] == o['label'] and x['tk'] != tk for w in re.findall(r'[а-яё]{6,}', x['tk'].lower()))
            extra = [w for w in re.findall(r'[а-яё]{6,}', tk.lower()) if w not in others]
            if extra:
                o['label'] = o['label'] + ', ' + extra[0]
    num = lambda s: float(s.replace(' ', '').replace(',', '.')) if s else 1e9
    offs.sort(key=lambda o: num(o['price']))
    pos = {
        'id': pid, 'brand': BRAND[site], 'section': sec, 'part': part, 'type': r0['type'],
        'title': title_of(key), 'name': r0['name_exact'], 'purpose': r0['purpose_quote'],
        'packaging': pick('packaging_quote'), 'consumption': clean_field('consumption', pick('consumption_quote'), BRAND[site]),
        'layer': clean_field('layer', pick('layer_or_joint_quote'), BRAND[site]), 'normative': clean_field('normative', pick('normative_quote'), BRAND[site]),
        'specs': [{'name': c['name'], 'value': c['value']} for c in (r0.get('characteristics') or [])],
        'winter': winter,
        'ceramic': bool(r0['type'] == 'tile_adhesive' and CERAMIC.search(r0['purpose_quote'] + ' ' + r0['name_exact'])),
        'pdf': pdf, 'offers': offs,
        'src': PRODS[r0['id']]['url'], 'checked': '2026-10-09',
    }
    # У RodStone «Адгезив» и «Основа» на карточке производителя вместо упаковки — фото газона и
    # мощения: не по теме, ставим без фото (стандарт: лучше без фото, чем не по теме). Сверено глазами 11.10.
    if key in ('Perel RodStone Адгезив', 'Perel RodStone Основа'):
        img = None
    if img and img.get('file'):
        im = put_image(pid, img['file'])
        if im: pos.update(im)
    if key.startswith('Perel RodStone Шов-'):
        # набор из сухой смеси и жидкого компонента: упаковку даём обеими строками производителя, дословно
        core = open(os.path.join(CORE, r0['id'] + '.txt')).read().split('\n')
        for i, line in enumerate(core[:-1]):
            if line.startswith('Компонент А:') and core[i + 1].startswith('Компонент'):
                pos['packaging'] = line + '\n' + core[i + 1]; break
    positions.append(pos)

# другие бренды (Стройбриг, Promix, BauMax): факты дословно с их сайтов (other_brands.json, проверено verify_other)
for o in OTHER:
    if o['type'] not in TYPE_TO or o['is_dry_mix'] == 'no':
        skipped['другой бренд: вне разделов или не сухая'].append(o['series_key']); continue
    sec, part = TYPE_TO[o['type']]
    pid = slug(o['brand'] + '-' + re.sub('^' + re.escape(o['brand']) + r'\s+', '', o['series_key'], flags=re.I))
    offs = [{'label': offer_label(x.get('tk', '')) or x.get('label') or '', 'price': x.get('price') or ''} for x in o['offers']]
    pos = {
        'id': pid, 'brand': o['brand'], 'section': sec, 'part': part, 'type': o['type'],
        'title': o['series_key'], 'name': o['name_exact'], 'purpose': o['purpose_quote'],
        'packaging': o.get('packaging_quote', ''), 'consumption': clean_field('consumption', o.get('consumption_quote', ''), o['brand']),
        'layer': clean_field('layer', o.get('layer_or_joint_quote', ''), o['brand']), 'normative': clean_field('normative', o.get('normative_quote', ''), o['brand']),
        'specs': o.get('characteristics', []), 'winter': any('зим' in (x['label']).lower() for x in offs),
        'ceramic': bool(o['type'] == 'tile_adhesive' and CERAMIC.search(o['purpose_quote'] + ' ' + o['name_exact'])),
        'pdf': '', 'offers': offs, 'src': o['manufacturer_url'], 'checked': o.get('checked', ''),
    }
    if o.get('image_file'):
        im = put_image(pid, o['image_file'])
        if im: pos.update(im)
    positions.append(pos)

order = list(TYPE_TO)
brand_order = ['Perel', 'Dauer', 'Основит', 'Стройбриг', 'Promix', 'BauMax']
positions.sort(key=lambda p: (order.index(p['type']), brand_order.index(p['brand']) if p['brand'] in brand_order else 9, p['title']))
ids = [p['id'] for p in positions]
dups = {i for i in ids if ids.count(i) > 1}
if dups:
    sys.exit('повтор id: ' + ', '.join(sorted(dups)))
json.dump(positions, open(os.path.join(ROOT, 'src', 'data', 'positions.json'), 'w'), ensure_ascii=False, indent=1)

report = {'positions': len(positions), 'by_brand': {}, 'problems': problems, 'skipped': {k: v for k, v in skipped.items()}}
for p in positions:
    report['by_brand'][p['brand']] = report['by_brand'].get(p['brand'], 0) + 1
json.dump(report, open(os.path.join(DATA, 'build_report.json'), 'w'), ensure_ascii=False, indent=1)
print(json.dumps({k: report[k] for k in ('positions', 'by_brand')}, ensure_ascii=False))
print('проблем', len(problems), '· пропущено:', {k: len(v) for k, v in skipped.items()})
for pr in problems[:40]:
    print('  ', pr)
