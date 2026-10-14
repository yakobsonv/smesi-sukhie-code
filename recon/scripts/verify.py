"""Проверка дословности: каждая цитата из записей агентов должна быть подстрокой текста карточки.

Вход: journal.jsonl воркфлоу (ищем объекты с ключом records) → recon/records.json + отчёт о несовпадениях.
"""
import json, re, sys
from collections import Counter, defaultdict

J = sys.argv[1]
B = "recon"
prods = {p["id"]: p for p in json.load(open(f"{B}/products.json"))}


def find_batches(obj):
    if isinstance(obj, dict):
        if "records" in obj and "batch" in obj:
            yield obj
        for v in obj.values():
            yield from find_batches(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from find_batches(v)
    elif isinstance(obj, str) and '"records"' in obj:
        try:
            yield from find_batches(json.loads(obj))
        except Exception:
            pass


batches = {}
for line in open(J):
    try:
        d = json.loads(line)
    except Exception:
        continue
    for b in find_batches(d):
        batches[b["batch"]] = b

recs = [r for b in batches.values() for r in b["records"]]


def norm(s):
    s = s.replace(" ", " ").replace("ё", "е").replace("Ё", "Е")
    s = re.sub(r"\s+", " ", s)
    return s.strip().lower()


QUOTES = ["name_exact", "dry_evidence_quote", "purpose_quote", "base_quote", "indoor_outdoor_quote",
          "packaging_quote", "consumption_quote", "layer_or_joint_quote", "normative_quote", "colors_quote"]
bad = defaultdict(list)
checked = 0
for r in recs:
    p = prods.get(r["id"])
    if not p:
        bad[r["id"]].append(("id", "нет такого id"))
        continue
    site, slug = p["id"].split("__", 1)
    full = norm(open(f"{B}/crawl/{site}/pages/{slug}.txt").read())
    for k in QUOTES:
        v = r.get(k) or ""
        if v.strip():
            checked += 1
            if norm(v) not in full:
                bad[r["id"]].append((k, v))
    for c in r.get("characteristics") or []:
        for part in ("name", "value"):
            v = c.get(part) or ""
            if v.strip():
                checked += 1
                if norm(v) not in full:
                    bad[r["id"]].append((f"char.{part}", v))

json.dump(recs, open(f"{B}/records.json", "w"), ensure_ascii=False, indent=1)
missing = [i for i in prods if i not in {r["id"] for r in recs}]
print("пачек:", len(batches), "записей:", len(recs), "карточек:", len(prods), "без записи:", len(missing))
print("проверено цитат:", checked, "несовпадений:", sum(len(v) for v in bad.values()), "в записях:", len(bad))
json.dump({k: v for k, v in bad.items()}, open(f"{B}/verify_bad.json", "w"), ensure_ascii=False, indent=1)
for k, v in list(bad.items())[:25]:
    print(" ", k, v[:3])
print("без записи:", missing[:30])
