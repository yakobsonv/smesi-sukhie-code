"""Проверка выложенной версии: все страницы × ширины. Playwright (встроенный Chromium).
python3 scripts/check_site.py https://smesi-sukhie-code.vercel.app"""
import sys, json, asyncio, random
from playwright.async_api import async_playwright
BASE = sys.argv[1].rstrip('/')
PAGES = ['/', '/dostavka/', '/kontakty/', '/regulation/', '/404-net-takoy/'] + [f'/{s}/' for s in json.load(open('scripts/_sections.json'))]
async def check(ctx, path, w):
    page = await ctx.new_page(); errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    r = await page.goto(f'{BASE}{path}?v={random.randint(1, 10**9)}', wait_until='networkidle')
    await page.evaluate("document.documentElement.style.scrollBehavior='auto'")
    h = await page.evaluate('document.body.scrollHeight')
    for y in range(0, h, 700):
        await page.evaluate(f'window.scrollTo(0,{y})'); await page.wait_for_timeout(40)
    await page.wait_for_timeout(400)
    res = await page.evaluate('''() => {
      const h1 = document.querySelectorAll('h1').length;
      const sw = document.documentElement.scrollWidth, cw = document.documentElement.clientWidth;
      const broken = [...document.images].filter(i => i.getAttribute('src') && i.complete && i.naturalWidth === 0).map(i => i.src);
      const stretched = [...document.images].filter(i => i.naturalWidth && i.getBoundingClientRect().width > 0).filter(i => {
        const r = i.getBoundingClientRect(); const s = Math.min(r.width / i.naturalWidth, r.height / i.naturalHeight);
        const fit = getComputedStyle(i).objectFit; const scale = fit === 'contain' ? Math.min(r.width / i.naturalWidth, r.height / i.naturalHeight) : Math.max(r.width / i.naturalWidth, r.height / i.naturalHeight);
        return scale * devicePixelRatio > 1.34; }).map(i => i.src.split('/').pop());
      const invisible = [...document.querySelectorAll('h1,h2,h3,p,li')].filter(e => { const s = getComputedStyle(e); return e.offsetParent && parseFloat(s.opacity) < 0.05; }).length;
      const anchors = [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href')).filter(h => h.length > 1 && !document.getElementById(decodeURIComponent(h.slice(1)))).length;
      const links = [...new Set([...document.querySelectorAll('a[href^="/"]')].map(a => a.getAttribute('href').split('#')[0]))];
      const service = /(TODO|уточнить у клиента|вынесено клиенту|служебн(?!ых целях)|по данным разбора|tk-sm|torgkomplekt|дилер)/i.test(document.body.innerText);
      return { h1, overflow: sw > cw + 1, broken, stretched, invisible, deadAnchors: anchors, links, service };
    }''')
    await page.close()
    return {'path': path, 'w': w, 'status': r.status, 'errors': errors, **res, 'height': h}
async def main():
    out = []; links = set()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for w, h in ((1440, 900), (390, 844), (320, 640)):
            ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1 if w > 700 else 2, is_mobile=w < 700)
            await ctx.add_init_script("try{localStorage.setItem('cookie-consent-v1','1')}catch(e){}")
            for path in PAGES:
                r = await check(ctx, path, w); links.update(r.pop('links')); out.append(r)
            await ctx.close()
        # внутренние ссылки
        ctx = await b.new_context(); bad = []
        for l in sorted(links):
            resp = await ctx.request.get(BASE + l)
            if resp.status != 200: bad.append((l, resp.status))
        await b.close()
    probs = [r for r in out if r['errors'] or r['overflow'] or r['broken'] or r['stretched'] or r['invisible'] or r['deadAnchors'] or r['service'] or (r['h1'] != 1) or (r['status'] != 200 and '404-net' not in r['path'])]
    print('проверок', len(out), 'проблемных', len(probs), '| внутренних ссылок', len(links), 'битых', bad)
    for r in probs: print('  ', {k: v for k, v in r.items() if v and k not in ('height',)})
    print('высоты 390:', {r['path']: r['height'] for r in out if r['w'] == 390})
asyncio.run(main())
