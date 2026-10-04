#!/usr/bin/env python3
import json, os, re, sys, hashlib
from pathlib import Path
from html import escape

root = Path(sys.argv[1])
src = Path(sys.argv[2])
cities = json.loads((src / "cities.json").read_text(encoding="utf-8"))

# ASTRA FULL INDEXATION GATE Ω
# Keep one master sitemap URL (/sitemap.xml) that exposes every indexable corpus.
# Preserve the existing primary urlset before replacing /sitemap.xml with an index.
primary_sitemap = root / "sitemap.xml"
master_children = []
if primary_sitemap.exists():
    original = primary_sitemap.read_text(encoding="utf-8", errors="ignore")
    if "<urlset" in original:
        main_target = root / "sitemap-main.xml"
        primary_sitemap.replace(main_target)
        master_children.append("https://freehotels.info/sitemap-main.xml")
    elif "<sitemapindex" in original:
        master_children.extend(re.findall(r"<loc>\s*(https://freehotels\.info/[^<]+)\s*</loc>", original, re.I))

variants = [
    ("Welche Lage passt zu deiner Reise?", "Anreise und Wege realistisch planen", "Gesamtpreis statt Zimmerpreis vergleichen"),
    ("Stadtteilwahl vor Preisfilter", "Bahnhof, ÖPNV und Ankunft", "Wann eine alternative Lage besser ist"),
    ("Kurze Wege sind Teil des Hotelpreises", "So planst du die Anreise", "Buchungsbedingungen im Vergleich"),
    ("Zentrum ist nicht immer die beste Lage", "Verkehrsachsen und Reisezeit", "Preis-Leistung richtig bewerten"),
]

def write_city(c, idx):
    lang, slug, city, country = c["lang"], c["slug"], c["city"], c["country"]
    dest = root / lang / slug / "index.html"
    if dest.exists():
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    h2a, h2b, h2c = variants[idx % len(variants)]
    canon = f"https://freehotels.info/{lang}/{slug}/"
    if lang == "de":
        title = f"Hotels in {city} – Lage, Verkehr und Buchungstipps | FreeHotels.info"
        desc = f"Hotels in {city} vergleichen: {c['center']}, {c['station']}, {c['district']} und {c['business']}. Tipps zu Lage, Anreise und Gesamtpreis."
        body = f"""
<p class="lead">{escape(c['hook'])} Diese FreeHotels.info-Seite baut die historische Hotel- und Reservierungsthematik des Domains für {escape(city)} weiter aus. Statt eine Unterkunft nur nach dem niedrigsten Zimmerpreis zu wählen, ordnen wir die wichtigsten Lagen danach, wie sie sich im Alltag einer Reise tatsächlich anfühlen.</p>
<h2>{h2a}</h2>
<p>Für einen klassischen Städtetrip ist <strong>{escape(c['center'])}</strong> meist der erste Vergleichspunkt. Wer Sehenswürdigkeiten, Gastronomie und Abendprogramm zu Fuß erreichen möchte, spart mit einer zentralen Lage Zeit. Trotzdem lohnt es sich, die konkrete Straße zu prüfen: wenige hundert Meter können bei großen Kreuzungen, Flüssen, Steigungen oder Fußgängerzonen einen deutlichen Unterschied machen.</p>
<h3>{escape(c['district'])}</h3>
<p>{escape(c['district'])} ist eine sinnvolle Gegenprobe zur zentralsten Lage. Prüfe vor der Buchung die tatsächliche Fahrzeit zu deinen wichtigsten Zielen und nicht nur die Luftlinie. Ein Hotel mit direkter Tram-, U-Bahn-, S-Bahn- oder Busverbindung kann praktischer sein als ein teureres Zimmer, das nominell näher am Zentrum liegt.</p>
<h3>{escape(c['business'])}</h3>
<p>Bei Geschäftsreisen, Kongressen, Messen oder Veranstaltungen verschiebt sich die optimale Lage häufig. Rund um {escape(c['business'])} können sich Nachfrage und Preise an einzelnen Tagen stark verändern. Wer den Termin kennt, sollte zuerst die Verbindung zum Veranstaltungsort prüfen und erst danach nach Preis sortieren.</p>
<h2>{h2b}</h2>
<p>Ein zentraler Orientierungspunkt ist <strong>{escape(c['station'])}</strong>. Für {escape(city)} spielen außerdem {escape(c['arrival'])} eine wichtige Rolle. Frühabfahrten, späte Ankünfte und Gepäck machen direkte Verbindungen wertvoller, als ein kleiner Preisunterschied vermuten lässt. Bei Anreise mit dem Auto gehören Parkkosten, Zufahrtsregeln und mögliche Umweltzonen in die Rechnung.</p>
<h3>Auf der Karte die echten Wege prüfen</h3>
<p>Öffne vor der Buchung die Kartenansicht und kontrolliere drei konkrete Wege: Ankunftsort zum Hotel, Hotel zum wichtigsten Tagesziel und Hotel zum Abendziel. So erkennst du schnell, ob eine vermeintlich günstige Unterkunft zusätzliche Transfers verursacht. Gerade bei zwei oder drei Übernachtungen kann eine bessere Lage mehrere Stunden Reisezeit sparen.</p>
<h2>{h2c}</h2>
<p>Vergleiche immer den Gesamtaufenthalt: Zimmerpreis, Frühstück, lokale Abgaben, Parken, Transfer, Stornierungsbedingungen und Zahlungszeitpunkt. Eine flexible Rate kann wertvoller sein als der niedrigste nicht stornierbare Tarif. Bei stark nachgefragten Terminen lohnt sich außerdem ein Vergleich von mindestens zwei Stadtteilen statt nur eines einzigen Kartenradius.</p>
<h3>Für wen lohnt sich welche Lage?</h3>
<p>Kurzreisende profitieren häufig von Zentrum oder Bahnhof. Geschäftsreisende sollten die direkte Verbindung zum Termin priorisieren. Familien achten zusätzlich auf Zimmergröße, ruhige Straßen und einfache Wege. Bei längeren Aufenthalten können Supermärkte, Wäscherei, Nahverkehr und ein weniger touristisches Umfeld wichtiger werden als die unmittelbare Nähe zum Hauptplatz.</p>
<h2>Historische Kontinuität von FreeHotels.info</h2>
<p>FreeHotels.info war bereits früher auf Hotelreservierungen in deutschen Großstädten sowie Informationen über Hotels in Deutschland und Europa ausgerichtet. Der heutige Wiederaufbau folgt deshalb derselben Themenfamilie. Alte numerische Hotel- und Listen-URLs werden nur dann auf einen neuen Stadt-Hub geführt, wenn dieser Hub tatsächlich existiert; unbekannte Slugs werden nicht pauschal auf die Startseite umgeleitet.</p>
<h2>Weitere Hotelziele vergleichen</h2>
<p><a href="/de/berlin/">Berlin</a> · <a href="/de/hamburg/">Hamburg</a> · <a href="/de/frankfurt/">Frankfurt</a> · <a href="/de/muenchen/">München</a> · <a href="/de/koeln/">Köln</a> · <a href="/de/leipzig/">Leipzig</a></p>
"""
        h1 = f"Hotels in {city}: Lage und Wege sinnvoll vergleichen"
    else:
        title = f"Hotels in {city} – Areas, Transport and Booking Tips | FreeHotels.info"
        desc = f"Hotels in {city}: compare {c['center']}, {c['station']}, {c['district']} and {c['business']} with practical transport and booking guidance."
        body = f"""<p class="lead">{escape(c['hook'])} This FreeHotels.info guide continues the domain's historic hotel-reservation theme with practical, current location advice.</p>
<h2>Choose the area before sorting by price</h2><p>Start with <strong>{escape(c['center'])}</strong>, then compare it with {escape(c['district'])}. The best value is often the hotel that reduces the journeys you will make every day, not simply the room with the lowest headline rate.</p>
<h3>Station and arrival</h3><p><strong>{escape(c['station'])}</strong> is a useful reference point. Consider {escape(c['arrival'])}, especially for early departures, late arrivals or luggage-heavy trips.</p>
<h2>Business and event trips</h2><p>If your main destination is {escape(c['business'])}, check direct public-transport links before choosing a central hotel. Event dates can change room availability and prices sharply.</p>
<h2>Compare the total stay cost</h2><p>Include breakfast, parking, local taxes, transfers, cancellation terms and payment conditions. Flexible dates and two or three candidate districts usually give a more realistic comparison.</p>
<h2>FreeHotels.info historical continuity</h2><p>The domain historically focused on hotels in Germany and Europe. Old numeric hotel routes are redirected only where a real destination hub exists, avoiding irrelevant mass redirects.</p>"""
        h1 = f"Hotels in {city}: choose the right area"
    schema = {
      "@context":"https://schema.org","@type":"WebPage","name":title,"description":desc,"url":canon,
      "about":{"@type":"City","name":city},
      "isPartOf":{"@type":"WebSite","name":"FreeHotels.info","url":"https://freehotels.info/"}
    }
    html = f"""<!doctype html><html lang="{lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{escape(title)}</title><meta name="description" content="{escape(desc)}"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="{canon}"><link rel="stylesheet" href="/assets/site.css"><script type="application/ld+json">{json.dumps(schema,ensure_ascii=False,separators=(',',':'))}</script></head><body><header><div class="wrap"><nav><a class="logo" href="/">FREE<span>HOTELS</span></a><div class="navlinks"><a href="/de/">Deutsch</a><a href="/en/">English</a><a href="/">Home</a></div></nav></div></header><main class="wrap"><section class="hero"><div class="eyebrow">FreeHotels.info · {escape(country)}</div><h1>{escape(h1)}</h1>{body}</section></main><footer><div class="wrap">FreeHotels.info · <a href="/a-propos/">Über uns</a> · <a href="/affiliate-disclosure/">Affiliate-Hinweis</a></div></footer></body></html>"""
    dest.write_text(html, encoding="utf-8")
    return True

created = sum(write_city(c,i) for i,c in enumerate(cities))

verified = [
 {"old":"/de/leipzig/list.html","target":"/de/leipzig/","evidence":"Railway HTTP log"},
 {"old":"/de/halle_an_der_saale/8434","target":"/de/halle-an-der-saale/","evidence":"Railway HTTP log"},
 {"old":"/de/krakau/18541","target":"/de/krakau/","evidence":"Railway HTTP log"},
 {"old":"/de/mykonos/24532","target":"/de/mykonos/","evidence":"Railway HTTP log"},
 {"old":"/en/leipzig/329.html","target":"/en/leipzig/","evidence":"Railway HTTP log"},
 {"old":"/en/napoli/17914","target":"/en/napoli/","evidence":"Railway HTTP log"},
]
direct = [
 "/de/berlin/45.html","/de/koeln/133.html","/de/frankfurt/14.html","/en/berlin/45.html"
]

for row in verified:
    target_file = root / row["target"].strip("/") / "index.html"
    if not target_file.exists():
        raise SystemExit(f"missing verified target: {row['target']}")
for url in direct:
    if not (root / url.strip("/")).exists():
        raise SystemExit(f"missing direct historic file: {url}")

hub_files = sorted(list(root.glob("de/*/index.html")) + list(root.glob("en/*/index.html")))
hubs = ["/" + p.relative_to(root).as_posix().removesuffix("index.html") for p in hub_files]

# Sitemap must include the full rebuilt corpus, not only first-level city hubs.
# This keeps city-intent clusters (cheap hotels, station, airport, parking, etc.)
# discoverable and prevents the build from silently shrinking the recovery sitemap.
indexable_files = sorted(set(
    list(root.glob("de/**/index.html")) +
    list(root.glob("en/**/index.html")) +
    [p for p in (root/"de"/"index.html", root/"en"/"index.html") if p.exists()]
))
indexable_urls = ["/" + p.relative_to(root).as_posix().removesuffix("index.html") for p in indexable_files]

required_growth = [
 "/de/berlin/guenstige-hotels/","/de/berlin/hauptbahnhof/","/de/berlin/flughafen/",
 "/de/muenchen/guenstige-hotels/","/de/muenchen/hauptbahnhof/","/de/muenchen/flughafen/",
 "/de/hamburg/guenstige-hotels/","/de/hamburg/hauptbahnhof/","/de/hamburg/flughafen/",
 "/de/frankfurt/guenstige-hotels/","/de/frankfurt/hauptbahnhof/","/de/frankfurt/flughafen/",
 "/de/koeln/guenstige-hotels/","/de/koeln/hauptbahnhof/","/de/koeln/flughafen/",
 "/de/duesseldorf/guenstige-hotels/","/de/duesseldorf/hauptbahnhof/","/de/duesseldorf/flughafen/",
]
missing_growth=[u for u in required_growth if not (root/u.strip("/")/"index.html").exists()]
if missing_growth:
    raise SystemExit("missing growth cluster: "+json.dumps(missing_growth,ensure_ascii=False))

issues=[]
seen_titles={}
for p in hub_files:
    s=p.read_text(encoding="utf-8",errors="ignore")
    rel="/"+p.relative_to(root).as_posix()
    if len(re.findall(r"<h1(?:\s|>)",s,re.I)) != 1: issues.append([rel,"h1_count"])
    if len(re.findall(r"<h2(?:\s|>)",s,re.I)) < 2: issues.append([rel,"h2_count"])
    if 'rel="canonical"' not in s: issues.append([rel,"canonical_missing"])
    if len(s) < 1800: issues.append([rel,"too_short"])
    weak_placeholder = (
        "historisch ein Hotelreservierungs- und Informationsportal" in s
        or "Diese wiederaufgebaute Seite setzt genau diese thematische Kontinuität" in s
    )
    if weak_placeholder: issues.append([rel,"legacy_placeholder_template"])
    m=re.search(r"<title>(.*?)</title>",s,re.I|re.S)
    if m:
        t=re.sub(r"\s+"," ",m.group(1)).strip().lower()
        if t in seen_titles: issues.append([rel,"duplicate_title",seen_titles[t]])
        seen_titles[t]=rel
if issues:
    raise SystemExit("corpus audit failed: "+json.dumps(issues[:30],ensure_ascii=False))

sitemap = ['<?xml version="1.0" encoding="UTF-8"?>','<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for u in indexable_urls:
    priority = "0.9" if u in ("/de/","/en/") else ("0.8" if u.count("/") <= 3 else "0.7")
    sitemap.append(f"  <url><loc>https://freehotels.info{u}</loc><changefreq>weekly</changefreq><priority>{priority}</priority></url>")
sitemap.append("</urlset>")
(root/"sitemap-legacy.xml").write_text("\n".join(sitemap)+"\n",encoding="utf-8")

# Build the single master sitemap endpoint. Submitting /sitemap.xml is enough
# for discovery of the modern, News and restored historical URL corpora.
master_children.append("https://freehotels.info/sitemap-legacy.xml")
if (root/"sitemap-news.xml").exists():
    master_children.append("https://freehotels.info/sitemap-news.xml")
master_children = list(dict.fromkeys(master_children))
master = ['<?xml version="1.0" encoding="UTF-8"?>','<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for loc in master_children:
    master.append(f"  <sitemap><loc>{loc}</loc></sitemap>")
master.append("</sitemapindex>")
(root/"sitemap.xml").write_text("\n".join(master)+"\n",encoding="utf-8")

robots=root/"robots.txt"
rt=robots.read_text(encoding="utf-8",errors="ignore") if robots.exists() else "User-agent: *\nAllow: /\n"
rt=re.sub(r"(?im)^Sitemap:\s*.*$","",rt).strip()
rt=rt+"\nSitemap: https://freehotels.info/sitemap.xml\n"
robots.write_text(rt,encoding="utf-8")

manifest={
 "generated_at_build":True,
 "strategy":"historic URL recovery via verified exact mappings plus city-aware route-family redirects",
 "verified_historic_routes":verified,
 "direct_historic_200":direct,
 "city_hubs":hubs,
 "city_hub_count":len(hubs),
 "sitemap_url_count":len(indexable_urls),
 "generated_city_count":created,
 "route_families":[
   "/{lang}/{city}/list.html",
   "/{lang}/{city}/{numeric_id}",
   "/{lang}/{city}/{numeric_id}.html",
   "/{lang}/{city}/{numeric_id}/index.html"
 ],
 "unknown_city_policy":"404 (no mass redirect to homepage)"
}
(root/"legacy-corpus.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")
if len(indexable_urls) < 80:
    raise SystemExit(f"recovery sitemap unexpectedly small: {len(indexable_urls)}")
audit={"status":"PASS","hub_count":len(hubs),"sitemap_url_count":len(indexable_urls),"generated":created,"verified_routes":len(verified),"direct_historic":len(direct),"growth_clusters":len(required_growth),"issues":[]}
(root/"legacy-audit.json").write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding="utf-8")

# IndexNow ownership proof. The key is intentionally public and is not a secret.
indexnow_key="268d53f637eeacf2e56853f16afb545a23d04faeffe760cc5c9f73c233822070"
(root/f"{indexnow_key}.txt").write_text(indexnow_key+"\n",encoding="utf-8")

print(json.dumps(audit))
