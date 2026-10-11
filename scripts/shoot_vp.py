"""Снимки экранов по высоте (не full_page): python3 scripts/shoot_vp.py <base> <out> <w> <h> <path> [y1 y2 ...]"""
import sys, os, asyncio
from playwright.async_api import async_playwright
base, out, w, h, path = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
ys = [int(y) for y in sys.argv[6:]] or [0]
os.makedirs(out, exist_ok=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1, is_mobile=w < 700)
        page = await ctx.new_page()
        await page.goto(base + path, wait_until='networkidle')
        await page.evaluate("localStorage.setItem('cookie-consent-v1','1'); document.documentElement.style.scrollBehavior='auto'")
        await page.reload(wait_until='networkidle')
        await page.evaluate("document.documentElement.style.scrollBehavior='auto'")
        for y in ys:
            await page.evaluate(f'window.scrollTo(0,{y})'); await page.wait_for_timeout(500)
            name = f"{(path.strip('/').replace('/', '_') or 'home')}_{w}_{y}.png"
            await page.screenshot(path=os.path.join(out, name))
            print(name)
        await b.close()
asyncio.run(main())
