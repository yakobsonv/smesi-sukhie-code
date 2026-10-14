"""Список уникальных карточек товара по трём производителям + «ядро» текста карточки (без меню/подвала).

Выход: recon/products.json, recon/core/<site>__<slug>.txt, recon/categories.json
"""
import json, os, re
from collections import defaultdict

R = "recon/crawl"
os.makedirs("recon/core", exist_ok=True)


def lines_of(site, slug):
    return open(f"{R}/{site}/pages/{slug}.txt").read().split("\n")


def core(site, h1, L):
    start, end = 0, len(L)
    if site == "dauer":
        for i in range(1, len(L)):
            if L[i] == h1 and L[i - 1] == "/":
                start = i; break
        for j in range(start + 5, len(L) - 1):
            if L[j] == "Каталог" and L[j + 1] == "Плиточные клеи":
                end = j; break
    elif site == "perel":
        for i in range(len(L)):
            if L[i] == "/ " + h1:
                start = i + 1; break
        for j in range(start, len(L)):
            if L[j] in ("Ранее вы смотрели", "Видеообзоры"):
                end = j; break
    elif site == "osnovit":
        crumb = None
        for i in range(len(L)):
            if "Продукция Основит" in L[i] and L[i].endswith(h1):
                crumb = i; break
        if crumb is not None:
            for i in range(crumb + 1, len(L)):
                if L[i] == h1:
                    start = i; break
        for j in range(start, len(L)):
            if L[j].startswith("ЗАПИСАТЬСЯ НА БЕСПЛАТНЫЙ") or L[j] == "Главная Новости":
                end = j; break
    out = L[start:end]
    return "\n".join(out), start > 0


products, cats = [], {}
for site in ("perel", "dauer", "osnovit"):
    ix = json.load(open(f"{R}/{site}/index.json"))
    ok = [i for i in ix if i["code"] == 200]
    for i in ok:
        if i["depth"] == 2:
            seg = i["url"].split("/catalog/")[1].strip("/").split("/")[0].split("?")[0]
            if "PAGEN" not in i["url"]:
                cats[f"{site}:{seg}"] = {"site": site, "slug": seg, "name": i["h1"], "url": i["url"]}
    groups = defaultdict(list)
    for i in ok:
        if i["depth"] != 3 or "PAGEN" in i["url"]:
            continue
        key = i.get("canonical") if site == "osnovit" else i["url"]
        groups[key].append(i)
    for key, items in groups.items():
        first = items[0]
        L = lines_of(site, first["slug"])
        text, found = core(site, first["h1"], L)
        cid = f"{site}__{first['slug']}"
        open(f"recon/core/{cid}.txt", "w").write(text)
        products.append({
            "id": cid, "site": site, "h1": first["h1"],
            "url": key if site == "osnovit" else first["url"],
            "category_slugs": sorted(set(x["url"].split("/catalog/")[1].split("/")[0] for x in items)),
            "pdfs": sorted(set(p for x in items for p in x["pdfs"])),
            "core_path": f"recon/core/{cid}.txt", "core_found": found, "core_chars": len(text),
        })

for p in products:
    p["category_names"] = [cats.get(f"{p['site']}:{s}", {}).get("name", s) for s in p["category_slugs"]]
json.dump(products, open("recon/products.json", "w"), ensure_ascii=False, indent=1)
json.dump(list(cats.values()), open("recon/categories.json", "w"), ensure_ascii=False, indent=1)
from collections import Counter
print(Counter(p["site"] for p in products))
print("core not found:", [(p["id"], p["h1"]) for p in products if not p["core_found"]][:20])
print("core chars by site:", {s: sum(p["core_chars"] for p in products if p["site"] == s) for s in ("perel", "dauer", "osnovit")})
print("cats:", Counter(c["site"] for c in cats.values()))
