import json,re
from collections import defaultdict
R=json.load(open('recon/records.json')); P={p['id']:p for p in json.load(open('recon/products.json'))}
SEC=[
 ('Цветные кладочные растворы (коротко + ссылка на сайт «Цветные смеси»)',['masonry_colored']),
 ('Кладочные растворы: рядовые и белые/серые',['masonry_ordinary']),
 ('Тёплые (теплоизоляционные) кладочные растворы',['masonry_thermal']),
 ('Расшивка швов кирпичной кладки',['joint_pointing_brick']),
 ('Клей для блоков и газобетона',['block_adhesive']),
 ('Гипсовый монтажный клей (ГКЛ, ПГП)',['gypsum_mounting_adhesive']),
 ('Цементно-песчаные смеси М150–М400, пескобетон',['masonry_universal_cps']),
 ('Штукатурки гипсовые',['plaster_gypsum']),
 ('Штукатурки цементные и цементно-известковые (вкл. обрызг)',['plaster_cement','plaster_facade_base']),
 ('Шпаклёвки гипсовые',['putty_gypsum']),
 ('Шпаклёвки цементные',['putty_cement']),
 ('Шпаклёвки полимерные (сухие)',['putty_polymer_dry']),
 ('Плиточные клеи',['tile_adhesive']),
 ('Затирки для плитки и камня (сухие)',['tile_grout']),
 ('Стяжки для пола',['floor_screed']),
 ('Наливные полы и ровнители',['floor_self_leveling']),
 ('Гидроизоляция сухая и гидропломба',['waterproofing_dry','hydroplug']),
 ('Смеси для систем утепления фасада (клеевые и базовые)',['etics_adhesive_base']),
 ('Декоративные штукатурки сухие (минеральные)',['decorative_plaster_dry']),
 ('Смеси для брусчатки и мощения',['paving_mix']),
 ('Смеси для печей и каминов',['stove_mix']),
 ('Ремонт бетона и спецрастворы',['concrete_repair','special_mortar']),
]
STALE={'основит флайвэлл pc24/1 ml','основит стартвэлл pc21','основит стартвэлл pc21 m'}
def key(r): return r['series_key'].strip()
rows=[]; covered=set()
for name,types in SEC:
  d={'section':name,'types':types}
  for s in ['perel','dauer','osnovit']:
    ser=defaultdict(int)
    for r in R:
      if P[r['id']]['site']==s and r['page_kind']=='product' and r['type'] in types and r['is_dry_mix'] in ('yes','unclear') and key(r).lower() not in STALE:
        ser[key(r)]+=1
    d[s]=sorted(ser.items())
  covered.update(types); rows.append(d)
# osnovit paint CC90 dry
nondry=defaultdict(lambda: defaultdict(set))
for r in R:
  if r['page_kind']!='product': continue
  if r['type'] in covered and r['is_dry_mix'] in ('yes','unclear'): continue
  nondry[r['type']][P[r['id']]['site']].add(key(r))
json.dump({'sections':rows,'nondry':{t:{s:sorted(v) for s,v in d.items()} for t,d in nondry.items()}},open('recon/sections.json','w'),ensure_ascii=False,indent=1)
tot={'perel':set(),'dauer':set(),'osnovit':set()}
print(f"{'раздел':62s} Perel Dauer Осн  у кого")
for d in rows:
  for s in tot: tot[s].update(k for k,_ in d[s])
  who=[n for s,n in (('perel','P'),('dauer','D'),('osnovit','O')) if d[s]]
  print(f"{d['section'][:62]:62s} {len(d['perel']):5d} {len(d['dauer']):5d} {len(d['osnovit']):4d}  {''.join(who)}")
print('ИТОГО сухих товаров в разделах:',{s:len(v) for s,v in tot.items()}, 'sum', sum(len(v) for v in tot.values()))
print('НЕ сухие / вне разделов:')
for t,d in sorted(nondry.items()): print(' ',t,{s:len(v) for s,v in d.items()})
