"""Обход tk-sm.ru (магазин смесей «Торгкомплект» — ООО «Кирпичный трест»): разделы /product/N и товары /products/N.

Только чтение публичных страниц, curl без JS (счётчики не срабатывают), /partners/ не трогаем (robots).
Выход: tksm/pages/*.html (utf-8), tksm/index.json
"""
import json, re, subprocess, time, os, html as H
from urllib.parse import urljoin, urlparse

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
OUT = "tksm"
os.makedirs(f"{OUT}/pages", exist_ok=True)


def fetch(url):
    r = subprocess.run(["curl", "-s", "-L", "--max-time", "40", "-A", UA, "-w", "\n__CODE__%{http_code}", url], capture_output=True)
    body, _, code = r.stdout.rpartition(b"\n__CODE__")
    try:
        code = int(code)
    except ValueError:
        code = 0
    return code, body.decode("cp1251", "replace")


def norm(href):
    u = urljoin("https://tk-sm.ru/", H.unescape(href))
    p = urlparse(u)
    if p.netloc not in ("tk-sm.ru", "www.tk-sm.ru"):
        return None
    path = p.path
    if not re.match(r"^/(product|products|catalog|producer|info|contact)(/|$|\.php)", path) and path != "/catalog.php":
        return None
    q = p.query
    return "https://tk-sm.ru" + path + ("?" + q if q else "")


seen, queue, index = set(), ["https://tk-sm.ru/catalog/", "https://tk-sm.ru/producer/", "https://tk-sm.ru/contact/", "https://tk-sm.ru/info/"], []
home = fetch("https://tk-sm.ru/")[1]
for h in re.findall(r'href="([^"#]+)"', home):
    n = norm(h)
    if n:
        queue.append(n)
queue = list(dict.fromkeys(queue))
seen.update(queue)
while queue:
    url = queue.pop(0)
    code, body = fetch(url)
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", urlparse(url).path + "_" + urlparse(url).query).strip("_") or "root"
    if body:
        open(f"{OUT}/pages/{slug}.html", "w").write(body)
    t = re.search(r"(?is)<title>(.*?)</title>", body)
    h1 = re.search(r"(?is)<h1[^>]*>(.*?)</h1>", body)
    index.append({"url": url, "code": code, "slug": slug,
                  "title": H.unescape(re.sub(r"<[^>]+>", "", t.group(1))).strip() if t else "",
                  "h1": H.unescape(re.sub(r"<[^>]+>", "", h1.group(1))).strip() if h1 else ""})
    for h in re.findall(r'href="([^"#]+)"', body):
        n = norm(h)
        if n and n not in seen:
            seen.add(n); queue.append(n)
    time.sleep(0.3)
    if len(index) % 50 == 0:
        print(len(index), "done", len(queue), "queued", flush=True)
json.dump(index, open(f"{OUT}/index.json", "w"), ensure_ascii=False, indent=1)
print("total", len(index))
