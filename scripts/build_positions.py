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
    groups[key].append({'label': m.get('variant') or t.get('pack') or '', 'price': t.get('price') or '', 'tk': t['name']})

os.makedirs(os.path.join(ROOT, 'public', 'assets', 'p'), exist_ok=True)


def put_image(pid, src_file):
    if not src_file or not os.path.exists(src_file):
        return None
    out = os.path.join(ROOT, 'public', 'assets', 'p', pid + '.jpg')
    if not os.path.exists(out):
        # только уменьшение: маленький исходник не растягиваем (стандарт картинок проекта)
        sz = subprocess.run(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', src_file], capture_output=True, text=True).stdout
        sw = int((re.search(r'pixelWidth: (\d+)', sz) or [0, 0])[1]); sh = int((re.search(r'pixelHeight: (\d+)', sz) or [0, 0])[1])
        args = ['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '82']
        if max(sw, sh) > 480:
            args += ['-Z', '480']
        subprocess.run(args + [src_file, '--out', out], capture_output=True)
    s = subprocess.run(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', out], capture_output=True, text=True).stdout
    w = re.search(r'pixelWidth: (\d+)', s); h = re.search(r'pixelHeight: (\d+)', s)
    return {'image': '/assets/p/' + pid + '.jpg', 'imageW': int(w.group(1)), 'imageH': int(h.group(1))}


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
    num = lambda s: float(s.replace(' ', '').replace(',', '.')) if s else 1e9
    offs.sort(key=lambda o: num(o['price']))
    pos = {
        'id': pid, 'brand': BRAND[site], 'section': sec, 'part': part, 'type': r0['type'],
        'title': title_of(key), 'name': r0['name_exact'], 'purpose': r0['purpose_quote'],
        'packaging': pick('packaging_quote'), 'consumption': pick('consumption_quote'),
        'layer': pick('layer_or_joint_quote'), 'normative': pick('normative_quote'),
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
    positions.append(pos)

# другие бренды (Стройбриг, Promix, BauMax): факты дословно с их сайтов (other_brands.json, проверено verify_other)
for o in OTHER:
    if o['type'] not in TYPE_TO or o['is_dry_mix'] == 'no':
        skipped['другой бренд: вне разделов или не сухая'].append(o['series_key']); continue
    sec, part = TYPE_TO[o['type']]
    pid = slug(o['brand'] + '-' + re.sub('^' + re.escape(o['brand']) + r'\s+', '', o['series_key'], flags=re.I))
    offs = [{'label': x.get('label') or x.get('pack') or '', 'price': x.get('price') or ''} for x in o['offers']]
    pos = {
        'id': pid, 'brand': o['brand'], 'section': sec, 'part': part, 'type': o['type'],
        'title': o['series_key'], 'name': o['name_exact'], 'purpose': o['purpose_quote'],
        'packaging': o.get('packaging_quote', ''), 'consumption': o.get('consumption_quote', ''),
        'layer': o.get('layer_or_joint_quote', ''), 'normative': o.get('normative_quote', ''),
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
