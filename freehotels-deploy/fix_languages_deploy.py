#!/usr/bin/env python3
from pathlib import Path
import re, sys

ROOT=Path(sys.argv[1] if len(sys.argv)>1 else ".")
viol=[]

def htmls(p):
    q=ROOT/p
    return [q] if q.is_file() else list(q.rglob("*.html")) if q.exists() else []

fr_files=htmls("index.html")+htmls("fr")+htmls("news")
de_files=htmls("de")

for f in fr_files:
    s=f.read_text("utf-8",errors="ignore")
    for pat in (r'href=["\']/de/', r'href=["\']/en/'):
        if re.search(pat,s,re.I): viol.append(f"{f}: forbidden FR->DE/EN link")
for f in de_files:
    s=f.read_text("utf-8",errors="ignore")
    for pat in (r'href=["\']/fr/', r'href=["\']/news/'):
        if re.search(pat,s,re.I): viol.append(f"{f}: forbidden DE->FR/news link")
idx=(ROOT/"index.html").read_text("utf-8",errors="ignore")
if not re.search(r'<html[^>]+lang=["\']fr',idx,re.I): viol.append("index.html: root must be fr")
sm=(ROOT/"sitemap.xml").read_text("utf-8",errors="ignore") if (ROOT/"sitemap.xml").exists() else ""
for x in ("sitemap-fr.xml","sitemap-de.xml","sitemap-en.xml","sitemap-news.xml"):
    if x not in sm: viol.append(f"sitemap.xml: missing {x}")
if viol:
    print("ASTRA LANGUAGE ISOLATION GUARD: FAIL")
    print("\n".join(viol)); sys.exit(1)
print(f"ASTRA LANGUAGE ISOLATION GUARD: PASS ({len(fr_files)} FR/news, {len(de_files)} DE files)")
