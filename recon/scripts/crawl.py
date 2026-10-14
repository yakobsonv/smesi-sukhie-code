"""Обход каталогов трёх производителей сухих смесей: все страницы /catalog/ → HTML + текст.

Только чтение публичных страниц. Пагинация Bitrix (?PAGEN_N=), sitemap Основита как доп. источник.
Выход: <out>/<site>/pages/<slug>.html, <slug>.txt и <out>/<site>/index.json
"""
import json, re, sys, time, hashlib, html as htmllib
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, urlparse, urlunparse
import urllib.request, ssl

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
OUT = sys.argv[1]
SITES = {
    "perel": "https://td-perel.ru",
    "dauer": "https://dauer.ru",
    "osnovit": "https://osnovit.ru",
}
ctx = ssl.create_default_context()


def fetch(url):
    import subprocess
    for attempt in range(3):
        r = subprocess.run(["curl", "-s", "-L", "--max-time", "40", "-A", UA, "-H", "Accept-Language: ru",
                            "-w", "\n__CODE__%{http_code} %{url_effective}", url], capture_output=True)
        out = r.stdout.decode("utf-8", "replace")
        body, _, tail = out.rpartition("\n__CODE__")
        try:
            code, final = tail.split(" ", 1)
            code = int(code)
        except ValueError:
            code, final = 0, url
        if code:
            return code, final, body if code == 200 else ""
        time.sleep(1.5 * (attempt + 1))
    return 0, url, ""


def norm(base, href):
    u = urljoin(base, htmllib.unescape(href))
    p = urlparse(u)
    host = urlparse(base).netloc
    if p.netloc and p.netloc != host:
        return None
    if not p.path.startswith("/catalog/"):
        return None
    if any(x in p.path for x in ("/filter/", "/compare", "/basket", "index.php")):
        return None
    q = ""
    m = re.search(r"(PAGEN_\d+=\d+)", p.query or "")
    if m:
        q = m.group(1)
    path = p.path if p.path.endswith("/") or "." in p.path.rsplit("/", 1)[-1] else p.path + "/"
    return urlunparse(("https", host, path, "", q, ""))


def text_of(html):
    h = re.sub(r"(?is)<(script|style|noscript|svg)[^>]*>.*?</\1>", " ", html)
    h = re.sub(r"(?is)<(header|footer|nav)[^>]*>.*?</\1>", " ", h)
    h = re.sub(r"(?i)<br\s*/?>|</(p|div|li|tr|h[1-6]|td|th)>", "\n", h)
    h = re.sub(r"(?s)<[^>]+>", " ", h)
    h = htmllib.unescape(h)
    lines = [re.sub(r"[ \t ]+", " ", l).strip() for l in h.splitlines()]
    out, prev = [], None
    for l in lines:
        if l and l != prev:
            out.append(l)
        prev = l
    return "\n".join(out)


def slug(url):
    p = urlparse(url)
    s = p.path.strip("/").replace("/", "__") or "root"
    if p.query:
        s += "__" + p.query.replace("=", "-")
    if len(s) > 180:
        s = s[:150] + "_" + hashlib.md5(s.encode()).hexdigest()[:8]
    return s


def crawl(site, base, seeds):
    import os
    d = os.path.join(OUT, site, "pages")
    os.makedirs(d, exist_ok=True)
    seen, queue, index = set(), [], []
    for s in seeds:
        n = norm(base, s)
        if n and n not in seen:
            seen.add(n); queue.append(n)
    while queue:
        batch, queue = queue[:6], queue[6:]
        with ThreadPoolExecutor(6) as ex:
            res = list(ex.map(fetch, batch))
        for url, (code, final, html) in zip(batch, res):
            sl = slug(url)
            pdfs = sorted(set(urljoin(base, h) for h in re.findall(r'href="([^"]+\.pdf)"', html, re.I)))
            title = (re.search(r"(?is)<h1[^>]*>(.*?)</h1>", html) or [None, ""])[1]
            title = re.sub(r"<[^>]+>", "", htmllib.unescape(title)).strip()
            index.append({"url": url, "final": final, "code": code, "slug": sl, "h1": title,
                          "pdfs": pdfs, "depth": len([x for x in urlparse(url).path.split("/") if x])})
            if html:
                open(os.path.join(d, sl + ".html"), "w").write(html)
                open(os.path.join(d, sl + ".txt"), "w").write(text_of(html))
            for href in re.findall(r'href="([^"#]+)"', html):
                n = norm(base, href)
                if n and n not in seen:
                    seen.add(n); queue.append(n)
        time.sleep(0.4)
        print(site, len(index), "done", len(queue), "queued", flush=True)
    json.dump(index, open(os.path.join(OUT, site, "index.json"), "w"), ensure_ascii=False, indent=1)
    return index


if __name__ == "__main__":
    which = sys.argv[2:] or list(SITES)
    for site in which:
        base = SITES[site]
        seeds = [base + "/catalog/"]
        if site == "osnovit":
            sm = fetch(base + "/sitemap-iblock-50.xml")[2]
            seeds += re.findall(r"<loc>([^<]+)</loc>", sm)
        if site == "dauer":
            sm = fetch(base + "/sitemap-iblock-16.xml")[2]
            seeds += [u.replace("http://", "https://") for u in re.findall(r"<loc>([^<]+)</loc>", sm)]
        crawl(site, base, seeds)
