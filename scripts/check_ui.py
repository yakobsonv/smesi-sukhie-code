"""Клики и контраст на выложенной версии. python3 scripts/check_ui.py <base>"""
import sys, asyncio, random
from playwright.async_api import async_playwright
BASE = sys.argv[1].rstrip('/')
CONTRAST_JS = '''() => {
  const lum = (c) => { const m = c.match(/[\\d.]+/g).map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return [0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]), m[3] === undefined ? 1 : m[3]]; };
  const bgOf = (el) => { while (el) { const s = getComputedStyle(el); const bg = s.backgroundColor; const img = s.backgroundImage; if (img && img !== 'none') return null; const a = bg.match(/[\\d.]+/g); if (a && (a.length < 4 || +a[3] > 0.9)) return bg; el = el.parentElement; } return 'rgb(255,255,255)'; };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const s = getComputedStyle(el); if (s.visibility === 'hidden' || +s.opacity < 0.1) continue;
    const bg = bgOf(el); if (!bg) continue;
    const [lf] = lum(s.color), [lb] = lum(bg); const cr = (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
    const big = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.66 && +s.fontWeight >= 700);
    if (cr < (big ? 3 : 4.5)) out.push({ t: el.textContent.trim().slice(0, 40), cr: +cr.toFixed(2), color: s.color, bg });
  }
  return out;
}'''
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for w, h in ((1440, 900), (390, 844)):
            ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1 if w > 700 else 2, is_mobile=w < 700)
            await ctx.add_init_script("try{localStorage.setItem('cookie-consent-v1','1')}catch(e){}")
            page = await ctx.new_page(); errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
            await page.goto(f'{BASE}/plitochnyj-klej/?v={random.randint(1,10**9)}', wait_until='networkidle')
            total = await page.locator('[data-pos-item]').count()
            await page.locator('[data-bf-brand="Dauer"]').click(); await page.wait_for_timeout(200)
            dauer = await page.locator('[data-pos-item]:not([hidden])').count()
            await page.locator('[data-bf-brand=""]').click()
            cer = page.locator('[data-bf-ceramic]')
            if await cer.count(): await cer.check(); await page.wait_for_timeout(200)
            ceramic = await page.locator('[data-pos-item]:not([hidden])').count()
            if await cer.count(): await cer.uncheck()
            first = page.locator('.pos__more').first
            await first.scroll_into_view_if_needed(); await first.click(); await page.wait_for_timeout(300)
            dlg = await page.evaluate('''() => { const d = document.getElementById('pos-modal'); return { open: d.open, title: d.querySelector('[data-pm=title]').textContent, offers: d.querySelectorAll('[data-pm=offers] li').length, specs: d.querySelectorAll('[data-pm=specs] div').length, purpose: d.querySelector('[data-pm=purpose]').textContent.slice(0,60), hash: location.hash, w: d.getBoundingClientRect().width, sw: document.documentElement.scrollWidth } }''')
            await page.keyboard.press('Escape'); await page.wait_for_timeout(200)
            closed = await page.evaluate("!document.getElementById('pos-modal').open && !location.hash")
            # открытие по якорю
            pid = await page.locator('[data-pos-item]').nth(3).get_attribute('id')
            await page.goto(f'{BASE}/plitochnyj-klej/?v={random.randint(1,10**9)}#{pid}', wait_until='networkidle')
            byhash = await page.evaluate("document.getElementById('pos-modal').open && document.querySelector('[data-pm=title]').textContent")
            print(f'w={w} всего {total} · Dauer {dauer} · керамогранит {ceramic} · окно {dlg} · закрылось {closed} · по якорю {byhash} · JS {errs}')
            # контраст по всем страницам
            bad = {}
            for path in ['/', '/plitochnyj-klej/', '/dostavka/', '/kontakty/', '/kladochnye-smesi/', '/404-x/']:
                await page.goto(f'{BASE}{path}?v={random.randint(1,10**9)}', wait_until='networkidle')
                r = await page.evaluate(CONTRAST_JS)
                if r: bad[path] = r[:6]
            # окно — тоже
            await page.goto(f'{BASE}/plitochnyj-klej/?v=1', wait_until='networkidle')
            await page.locator('.pos__more').first.click(); await page.wait_for_timeout(300)
            r = await page.evaluate(CONTRAST_JS.replace("document.querySelectorAll('body *')", "document.querySelectorAll('#pos-modal *')"))
            if r: bad['окно'] = r[:6]
            print('   контраст ниже нормы:', bad or 0)
            await ctx.close()
        await b.close()
asyncio.run(main())
