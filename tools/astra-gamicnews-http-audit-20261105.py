#!/usr/bin/env python3
"""One-shot public HTTP audit: no credentials, packages, deploys or mutations."""
import json
import sys
import urllib.request
import urllib.error
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

BASE = "https://gamicnews.com"
SLUGS = [
    "best-linux-distro-for-gaming-2026",
    "bazzite-vs-steamos-vs-chimeraos-gaming-pc",
    "linux-gaming-nvidia-gpu-driver-checklist-2026",
    "windows-steam-games-on-linux-proton-anticheat-2026",
    "linux-gaming-performance-fps-stutter-checklist",
]
class Extract(HTMLParser):
    def __init__(self):
        super().__init__()
        self.robots = []
        self.canonicals = []
        self.links = []
        self.h1 = 0
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "meta" and a.get("name", "").lower() in ("robots", "googlebot", "googlebot-news"):
            self.robots.append({"agent": a["name"].lower(), "value": a.get("content", "").lower()})
        if tag == "link" and a.get("rel", "").lower() == "canonical":
            self.canonicals.append(a.get("href", ""))
        if tag == "a" and a.get("href"):
            self.links.append(a["href"])
        if tag == "h1":
            self.h1 += 1

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent":"ASTRA-GAMIC-HTTP-AUDIT/1.0", "Cache-Control":"no-cache"})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return {"status":r.status, "final_url":r.geturl(), "x_robots_tag":r.headers.get("X-Robots-Tag",""), "html":r.read(2_000_000).decode("utf-8","replace")}
    except urllib.error.HTTPError as ex:
        return {"status":ex.code, "final_url":ex.geturl(), "x_robots_tag":ex.headers.get("X-Robots-Tag",""), "html":ex.read(100_000).decode("utf-8","replace")}
    except Exception as ex:
        return {"status":None, "final_url":url, "error":str(ex), "x_robots_tag":"", "html":""}

results = []
for slug in SLUGS:
    url = f"{BASE}/news/{slug}"
    r = get(url)
    x = Extract()
    x.feed(r["html"])
    actual = {urljoin(r["final_url"], href).rstrip("/") for href in x.links}
    expected_siblings = {f"{BASE}/news/{s}" for s in SLUGS if s != slug}
    agent_rules = [item for item in x.robots if item["agent"] == "robots"]
    index_ok = any("index" in v["value"].split(",") and "follow" in v["value"].split(",") for v in agent_rules)
    noindex = ("noindex" in r["x_robots_tag"].lower() or any("noindex" in t["value"] or "nofollow" in t["value"] for t in x.robots))
    canonical_ok = len(x.canonicals) == 1 and x.canonicals[0].rstrip("/") == url
    linked = sorted(expected_siblings & actual)
    row = {
        "path": "/news/" + slug,
        "http_status": r["status"],
        "final_url": r["final_url"],
        "robots_meta": x.robots,
        "x_robots_tag": r["x_robots_tag"],
        "canonical_ok": canonical_ok,
        "internal_sibling_links": len(linked),
        "missing_siblings": sorted(expected_siblings - actual),
        "single_h1": x.h1 == 1,
        "pass": r["status"] == 200 and not noindex and index_ok and canonical_ok and x.h1 == 1 and len(linked) == 4,
    }
    if r.get("error"): row["error"] = r["error"]
    results.append(row)
    print(json.dumps(row, ensure_ascii=False), flush=True)

negative = get(BASE + "/astra-http-audit-this-route-should-404-20261105")
negative_result = {"path":"NEGATIVE_CONTROL", "http_status":negative["status"],"pass":negative["status"] in (404,410)}
if negative.get("error"): negative_result["error"] = negative["error"]
print(json.dumps(negative_result), flush=True)

sys.exit(0 if all(r["pass"] for r in results) and negative_result["pass"] else 1)
