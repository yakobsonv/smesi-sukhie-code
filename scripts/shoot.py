"""Снимки страниц (Playwright, встроенный Chromium — не обычный Chrome). python3 scripts/shoot.py <base> <out_dir> <path>..."""
import sys, os, asyncio
from playwright.async_api import async_playwright
base, out = sys.argv[1], sys.argv[2]
paths = sys.argv[3:]
os.makedirs(out, exist_ok=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for w, h, tag in ((1440, 900, 'd'), (390, 844, 'm')):
            ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1 if tag == 'd' else 2, is_mobile=(tag == 'm'))
            page = await ctx.new_page()
            await page.add_init_script("document.documentElement.style.scrollBehavior='auto'")
            for path in paths:
                await page.goto(base + path, wait_until='networkidle')
                await page.evaluate("document.documentElement.style.scrollBehavior='auto'; localStorage.setItem('cookie-consent-v1','1')")
                await page.reload(wait_until='networkidle')
                # прокрутка для ленивых картинок и появления
                hgt = await page.evaluate('document.body.scrollHeight')
                for y in range(0, hgt, 600):
                    await page.evaluate(f'window.scrollTo(0,{y})'); await page.wait_for_timeout(60)
                await page.evaluate('window.scrollTo(0,0)'); await page.wait_for_timeout(300)
                name = (path.strip('/').replace('/', '_') or 'home') + f'_{tag}.png'
                await page.screenshot(path=os.path.join(out, name), full_page=True)
                sw = await page.evaluate('document.documentElement.scrollWidth')
                print(name, 'height', hgt, 'scrollWidth', sw)
            await ctx.close()
        await b.close()
asyncio.run(main())
