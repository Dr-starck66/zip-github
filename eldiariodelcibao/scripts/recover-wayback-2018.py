#!/usr/bin/env python3
"""Evidence-only recovery of 2018 Blogger metadata, without mirroring copyrighted full articles.

Reads Wayback inventory, requests the ORIGINAL recorded capture (id_),
collects provenance and document metadata, and fails closed for uncertain pages.
Not a content spinner and never an indexability signal.
"""
import argparse
import concurrent.futures
import hashlib
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from urllib.parse import urlencode

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "historic-routes.json"
DEST = ROOT / "data" / "wayback-2018-metadata.json"
AGENT = "ASTRA-Cibao-Archive-Research/1.0 (+source citation; no bulk republication)"
DAYS = {"enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
        "julio": 7, "agosto": 8, "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12}
WEEKDAY = r"(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)"
DATE_PATTERN = re.compile(WEEKDAY + r"\s*,?\s*(\w+)\s+(\d{1,2})\s*,\s*(20\d{2})", re.I)

def ws(s):
    return re.sub(r"\s+", " ", str(s or "")).strip()

def historical_date(s):
    match = DATE_PATTERN.search(s)
    if not match:
        return None
    m, day, year = match.groups()
    month = DAYS.get(m.lower())
    if month is None:
        return None
    try:
        return datetime(int(year), month, int(day)).date().isoformat()
    except ValueError:
        return None

def _process_capture(row, forced_timestamp=None):
    path = row["path"]
    timestamp = forced_timestamp or row.get("timestamp", "")
    original = row.get("original", "")
    if not re.fullmatch(r"20\d{12}", timestamp) or not re.match(
            r"^https?://(?:www\.)?eldiariodelcibao\.com(?::80)?/", original, re.I):
        return {"path":path,"status":"invalid-inventory","indexable":False}
    archive_url = f"https://web.archive.org/web/{timestamp}id_/{original}"
    try:
        req = Request(archive_url, headers={"User-Agent":AGENT,"Accept":"text/html"})
        with urlopen(req, timeout=12) as response:
            code = response.status
            final_url = response.url
            html = response.read(1_200_001)
            if len(html) > 1_200_000:
                return {"path":path,"status":"oversized","archiveUrl":archive_url,"indexable":False}
    except (HTTPError,URLError,TimeoutError,OSError) as err:
        return {"path":path,"status":"fetch-failed","error":type(err).__name__,
                "archiveUrl":archive_url,"indexable":False}
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script","style","noscript","svg","nav","footer"]):
        tag.decompose()
    raw_title = (soup.find("meta",attrs={"property":"og:title"}) or {}).get("content") if soup.find("meta",attrs={"property":"og:title"}) else ""
    if not raw_title:
        el = soup.select_one("h1.post-title,h3.post-title,.entry-title,.post-title,title")
        raw_title = el.get_text(" ",strip=True) if el else ""
    title = ws(re.split(r"\s+[|~]\s+ELDIARIO", raw_title, flags=re.I)[0])[:220]
    sections = soup.select(".post-body.entry-content,.post-body,.entry-content,[itemprop=articleBody],article")
    paragraphs = []
    for section in sections:
        p = ws(section.get_text(" ", strip=True))
        if len(p) > len(" ".join(paragraphs)):
            paragraphs = [p]
    page_text = ws(soup.get_text(" ",strip=True))
    if not paragraphs or len(paragraphs[0]) < 170:
        # Classic Blogger post templates place body after the byline and before "Fuente:".
        start = re.search(r"SOYDEMAO INTERNACIONAL\s*\|[^|]{0,130}\|\s*(?:0|[1-9]\d*)\s+comentarios",page_text,re.I)
        if start:
            remain = page_text[start.end():]
            stop = re.search(r"\s*(?:Fuente\s*:|Category\s*:|About GalleryBloggerTemplates|SI TE GUSTA NUESTRO TRABAJO)\s*",remain,re.I)
            paragraphs = [ws(remain[:stop.start() if stop else 3500])]
    body = ws(" ".join(paragraphs))
    date = historical_date(page_text[:min(len(page_text),6000)])
    if not date:
        # Read source-authored dates only; never invent a missing historical date.
        for selector in ('meta[property="article:published_time"]',
                         'meta[itemprop="datePublished"]', 'time[datetime]'):
            tag = soup.select_one(selector)
            raw = (tag.get("content") or tag.get("datetime") or "") if tag else ""
            if re.fullmatch(r"2018-06-\d{2}(?:[T ].*)?", raw):
                try:
                    day = raw[:10]
                    if datetime.fromisoformat(day).month == 6:
                        date = day
                        break
                except ValueError:
                    pass
    words = len(body.split())
    verified = (code == 200 and len(html) > 2000 and
        "eldiariodelcibao" in final_url.lower() and date and
        date.startswith("2018-06-") and len(title)>12 and words >= 50 and
        "Wayback Machine" not in title)
    return {"path":path,"status":"evidence-metadata" if verified else "capture-incomplete",
        "archiveUrl":archive_url,"archiveTimestamp":timestamp,"originalTitle":title,
        "originalDate":date,"sourceBodyWords":words,
        "sourceBodySha256":hashlib.sha256(body.encode("utf-8")).hexdigest() if words else None,
        "sourceExcerpt":body[:120] if verified else "",
        "httpStatus":code,"indexable":False,
        "provenance":"html-original-capture" if verified else "capture-requires-human-review"}

def _alternative_snapshots(row):
    """CDX alternative snapshots: strictly source-linked, never fabricated."""
    original = row.get("original", "")
    if not re.match(r"^https?://(?:www\.)?eldiariodelcibao\.com(?::80)?/", original, re.I):
        return []
    query = urlencode({"url": original, "output": "json", "from": "2018",
                       "to": "2020", "filter": "statuscode:200",
                       "collapse": "digest", "limit": "25"})
    req = Request("https://web.archive.org/cdx/search/cdx?" + query,
                  headers={"User-Agent": AGENT, "Accept": "application/json"})
    try:
        with urlopen(req, timeout=12) as response:
            records = json.loads(response.read(60000))
    except (HTTPError, URLError, TimeoutError, OSError, ValueError):
        return []
    if not isinstance(records, list) or not records or not isinstance(records[0], list):
        return []
    if "timestamp" not in records[0]:
        return []
    column = records[0].index("timestamp")
    seen = {row.get("timestamp", "")}
    stamps = []
    for item in records[1:]:
        if not isinstance(item, list) or len(item) <= column:
            continue
        stamp = str(item[column])
        if not re.fullmatch(r"20\d{12}", stamp) or stamp in seen:
            continue
        seen.add(stamp)
        stamps.append(stamp)
    return stamps[:3]


def process(row):
    first = _process_capture(row)
    if first.get("status") == "evidence-metadata":
        return first
    if first.get("status") not in {"capture-incomplete", "fetch-failed"}:
        return first
    attempts = 0
    for timestamp in _alternative_snapshots(row):
        attempts += 1
        candidate = _process_capture(row, forced_timestamp=timestamp)
        if candidate.get("status") == "evidence-metadata":
            candidate["originalInventoryTimestamp"] = row.get("timestamp")
            candidate["alternateCaptureVerified"] = True
            candidate["alternatesExamined"] = attempts
            return candidate
    first["alternatesExamined"] = attempts
    return first


def main():
    cli = argparse.ArgumentParser()
    cli.add_argument("--limit",type=int,default=259)
    cli.add_argument("--workers",type=int,default=4)
    args = cli.parse_args()
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    old = json.loads(DEST.read_text(encoding="utf-8")) if DEST.exists() else {"records":[]}
    by_path = {x["path"]:x for x in old.get("records",[])}
    eligible = [x for x in source if x["path"].startswith("/2018/06/")]
    def editorial_priority(record):
        name = record["path"].lower()
        towns = ("esperanza", "boca-de-mao", "valverde", "santiago",
                 "laguna-salada", "mao", "cibao", "monte-cristi",
                 "puerto-plata", "la-vega", "dajabon", "noroeste")
        themes = ("carretera", "calle", "obra", "hospital", "educa", "escuela",
                  "cultura", "feria", "agric", "municip", "vecinos", "paro",
                  "agua", "econom", "comercio", "puente", "patrimonio")
        sensitive = ("apresan", "asesin", "asalt", "violac", "abus", "suicid",
                     "muerte", "muere", "atracan", "sexual", "denuncia")
        score = 8 * sum(t in name for t in towns) + 3 * sum(t in name for t in themes)
        score -= 12 * sum(t in name for t in sensitive)
        return (-score, name)
    unseen = sorted((x for x in eligible if x["path"] not in by_path),
                    key=editorial_priority)
    failed = [x for x in eligible if x["path"] in by_path
              and by_path[x["path"]].get("status") in {"fetch-failed", "capture-incomplete"}]
    failed.sort(key=lambda x: (by_path[x["path"]].get("attemptCount", 1),
                               by_path[x["path"]].get("lastAttemptUTC", "")))
    candidates = (unseen + failed)[:max(0, args.limit)]
    print(json.dumps({"attempting":len(candidates),"existing":len(by_path)}),flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1,min(args.workers,5))) as executor:
        futures = {executor.submit(process,x):x for x in candidates}
        for i, fut in enumerate(concurrent.futures.as_completed(futures),1):
            item = fut.result()
            prior = by_path.get(item["path"], {})
            item["attemptCount"] = int(prior.get("attemptCount", 1)) + 1 if prior else 1
            item["lastAttemptUTC"] = datetime.now(timezone.utc).isoformat()
            by_path[item["path"]] = item
            if i%20==0 or i==len(candidates):
                good = sum(x.get("status")=="evidence-metadata" for x in by_path.values())
                print(json.dumps({"completed":i,"total":len(candidates),"withEvidence":good}),flush=True)
    result={"schemaVersion":1,
        "purpose":"Source metadata only; no copied full article texts and no automatic indexability",
        "checkedUTC":datetime.now(timezone.utc).isoformat(),
        "totalJune2018":len([r for r in source if r["path"].startswith("/2018/06/")]),
        "records":sorted(by_path.values(),key=lambda x:x["path"])}
    DEST.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"saved":len(result["records"]),"evidence":
        sum(v["status"]=="evidence-metadata" for v in result["records"]),
        "unverified":sum(v["status"]!="evidence-metadata" for v in result["records"])}))

if __name__=="__main__":
    main()
