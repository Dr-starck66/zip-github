#!/usr/bin/env python3
"""FreeHotels repair overlay: preserve every historical URL and source page.

Only adds progressive enhancement to existing pages, corrects proven language
leaks, and publishes a reproducible link / widget audit. No page is deleted.
"""
from pathlib import Path
from html import escape
import json
import re
import sys
from urllib.parse import unquote, urlsplit

root = Path(sys.argv[1])
src = Path(sys.argv[2])
asset_dir = root / "assets"
asset_dir.mkdir(parents=True, exist_ok=True)

# Exact, audited corrections. Preserve the information and translate it to the
# page's actual German language instead of deleting the surrounding content.
french_to_german = {
 "Spandau, Lichtenberg ou certains secteurs de Neukölln peuvent coûter moins cher que Mitte si une S- ou U-Bahn directe rejoint tes objectifs.":
 "Spandau, Lichtenberg und einige Teile Neuköllns können günstiger als Mitte sein, wenn eine direkte S- oder U-Bahn deine wichtigsten Ziele verbindet.",
 "ITB, grands concerts, marathon et grands week-ends peuvent faire monter les prix dans toute la ville.":
 "ITB, große Konzerte, der Berlin-Marathon und lange Wochenenden können die Hotelpreise in der gesamten Stadt erhöhen.",
 "Laimer Platz, Moosach ou des secteurs bien reliés par U-/S-Bahn peuvent offrir un meilleur rapport prix/temps que l’Altstadt.":
 "Laimer Platz, Moosach und gut angebundene Stadtteile bieten mitunter ein besseres Verhältnis aus Preis und Reisezeit als die Altstadt.",
 "Altona, Barmbek ou des secteurs le long du S-/U-Bahn-Netz peuvent être moins chers que Binnenalster, HafenCity ou St. Pauli.":
 "Altona, Barmbek oder gut angebundene Viertel entlang der S- und U-Bahn können günstiger sein als Binnenalster, HafenCity oder St. Pauli.",
 "Hamburger Hafengeburtstag, grands concerts, foires et matchs peuvent produire de fortes pointes de prix.":
 "Hafengeburtstag, große Konzerte, Messen und Sportveranstaltungen können in Hamburg starke Preisspitzen auslösen.",
 "Sachsenhausen, Ostend ou certains secteurs reliés directement au centre peuvent être plus intéressants que Messe/Innenstadt lors des pics.":
 "Sachsenhausen, Ostend und direkt ans Zentrum angebundene Viertel können bei Nachfragespitzen attraktiver sein als Messe oder Innenstadt.",
 "Deutz, Mülheim ou des quartiers à quelques stations du Dom peuvent offrir un meilleur prix sans sacrifier trop de temps.":
 "Deutz, Mülheim oder Viertel wenige Stationen vom Dom entfernt können günstiger sein, ohne zu viel Reisezeit zu kosten.",
 "Koelnmesse, Karneval, grands concerts et matchs créent des pointes de demande très visibles.":
 "Koelnmesse, Karneval, große Konzerte und Spiele sorgen für deutlich erhöhte Nachfrage.",
 "Flingern, Bilk ou des zones reliées par S-/U-Bahn peuvent être plus économiques que Altstadt, Königsallee ou Messe.":
 "Flingern, Bilk oder gut an S- und U-Bahn angebundene Viertel können günstiger sein als Altstadt, Königsallee oder Messe.",
 "Les salons de Messe Düsseldorf et grands événements peuvent faire grimper les tarifs jusque dans les villes voisines.":
 "Messen in Düsseldorf und große Veranstaltungen können die Hotelpreise auch in den Nachbarstädten erhöhen.",
}

css = r"""
/* FreeHotels progressive enhancement; existing design/content preserved. */
.fh-booking {margin:1.5rem 0 2rem;padding:1.4rem;border:1px solid #cbdcf4;border-radius:20px;
 background:linear-gradient(130deg,#eff6ff,#f8fcff);color:#13253f;box-shadow:0 10px 35px #12356814}
.fh-booking h2{font-size:clamp(1.28rem,2.4vw,1.8rem);margin:0 0 .5rem;color:#12284d}
.fh-booking p{margin:.4rem 0 1rem;color:#425777}
.fh-booking-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) auto;align-items:end;gap:.7rem}
.fh-booking label{display:flex;flex-direction:column;gap:.3rem;font-size:.83rem;font-weight:700;color:#253d62}
.fh-booking input{box-sizing:border-box;display:block;width:100%;min-width:0;border:1px solid #aac3df;border-radius:10px;
 padding:.8rem .65rem;background:#fff;font:inherit;color:#13253f;min-height:46px}
.fh-booking button{min-height:46px;border:0;border-radius:11px;cursor:pointer;background:#1250a1;color:white;
 padding:.75rem 1.1rem;font:inherit;font-weight:750;white-space:nowrap}
.fh-booking button:focus-visible,.fh-city-filter:focus-visible{outline:3px solid #e48c16;outline-offset:2px}
.fh-booking button:hover{background:#103d7b}
.fh-small-note{font-size:.75rem;color:#516781;margin:.75rem 0 0}
.fh-index-search{margin:1rem 0 1.3rem;display:flex;align-items:center;gap:.65rem;flex-wrap:wrap}
.fh-city-filter{flex:1;min-width:190px;max-width:520px;border:1px solid #93adcd;border-radius:10px;
 padding:.82rem 1rem;background:#fff;color:#12284d;font:inherit}
.fh-city-count{font-size:.88rem;color:#516781}
.fh-city-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.65rem;list-style:none;padding:0!important;margin:1.2rem 0}
.fh-city-list li{margin:0!important;min-width:0}
.fh-city-list li a{display:block;padding:.75rem .9rem;border:1px solid #d7e1ef;border-radius:12px;
 background:#ffffff;color:#163e78;text-decoration:none;font-weight:600;overflow-wrap:anywhere}
.fh-city-list li a:hover{background:#edf6ff;border-color:#669fe1}
.fh-city-list li[hidden]{display:none}
@media(max-width:900px){.fh-booking-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
 .fh-city-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:580px){.fh-booking-grid{grid-template-columns:1fr}
 .fh-city-list{grid-template-columns:1fr}.fh-booking{padding:1rem}}
"""
js = r"""/* Small, privacy-respecting helper: no analytics or dependencies. */
(function () {
  "use strict";
  var search = document.querySelector(".fh-city-filter");
  if (search) {
    var listItems = Array.prototype.slice.call(document.querySelectorAll(".fh-city-list li"));
    var count = document.querySelector(".fh-city-count");
    var update = function () {
      var q = search.value.trim().toLocaleLowerCase();
      var shown = 0;
      listItems.forEach(function (li) {
        var visible = li.textContent.toLocaleLowerCase().indexOf(q) !== -1;
        li.hidden = !visible;
        if (visible) shown++;
      });
      if (count) count.textContent = String(shown) + " / " + String(listItems.length);
    };
    search.addEventListener("input", update);
    update();
  }
  document.querySelectorAll("form.fh-booking").forEach(function (form) {
    form.addEventListener("submit", function (event) {
      var arrival = form.querySelector('[name="checkin"]');
      var departure = form.querySelector('[name="checkout"]');
      if (!arrival || !departure) return;
      if ((arrival.value && !departure.value) || (!arrival.value && departure.value)) {
        event.preventDefault();
        alert(form.dataset.lang === "de" ? "Bitte beide Reisedaten eingeben." : "Enter both travel dates.");
        return;
      }
      if (arrival.value && departure.value && departure.value <= arrival.value) {
        event.preventDefault();
        alert(form.dataset.lang === "de" ? "Die Abreise muss nach der Anreise liegen." : "Check-out must be after check-in.");
      }
    });
  });
})();
"""
(asset_dir / "freehotels-repair.css").write_text(css.strip() + "\n", encoding="utf-8")
(asset_dir / "freehotels-repair.js").write_text(js.strip() + "\n", encoding="utf-8")

cities = json.loads((src / "cities.json").read_text(encoding="utf-8"))
city_names = {(x["lang"], x["slug"]): x["city"] for x in cities}
city_names.update({
 ("de","berlin"):"Berlin",("de","hamburg"):"Hamburg",("de","muenchen"):"München",
 ("de","koeln"):"Köln",("de","frankfurt"):"Frankfurt am Main",("de","duesseldorf"):"Düsseldorf",
 ("de","hannover"):"Hannover",("de","europa"):"Europa",
 ("en","berlin"):"Berlin",("en","munich"):"Munich",("en","hamburg"):"Hamburg",
 ("en","frankfurt"):"Frankfurt",("en","cologne"):"Cologne",("en","duesseldorf"):"Düsseldorf",
 ("en","leipzig"):"Leipzig",("en","napoli"):"Naples"
})
language_pairs = {
 "berlin":"berlin","hamburg":"hamburg","muenchen":"munich","frankfurt":"frankfurt",
 "koeln":"cologne","duesseldorf":"duesseldorf","leipzig":"leipzig"
}
reverse_pairs = {v:k for k,v in language_pairs.items()}
report = {"pages_examined":0,"pages_enhanced":0,"booking_forms_added":0,
          "language_fixes":0,"local_link_warnings":[],"preserved_urls":True,"status":"PASS"}

def insert_head(markup, insert):
    if "</head>" in markup:
        return markup.replace("</head>",insert+"</head>",1)
    return markup

for lang in ("de", "en"):
    for path in sorted((root/lang).rglob("*.html")):
        report["pages_examined"] += 1
        markup = path.read_text(encoding="utf-8",errors="replace")
        original = markup
        if lang == "de":
            for french,german in french_to_german.items():
                hits = markup.count(french)
                if hits:
                    markup = markup.replace(french,german)
                    report["language_fixes"] += hits
        if "/assets/freehotels-repair.css" not in markup:
            markup = insert_head(markup,'<link rel="stylesheet" href="/assets/freehotels-repair.css">')
        if "/assets/freehotels-repair.js" not in markup:
            markup = markup.replace("</body>",'<script src="/assets/freehotels-repair.js" defer></script></body>',1)

        rel = path.relative_to(root)
        components = rel.parts
        landing = components == (lang, "index.html")
        is_city = len(components) >= 3 and components[-1] == "index.html" and components[1] != "europa"
        if landing:
            # Keep existing Germany/hotel-reservation semantics; expose a working
            # city filter, including the full generated city directory.
            if lang=="de":
                markup = markup.replace(
                  "<title>Hotels in Deutschland – Hotelreservierung & Städteguides | FreeHotels.info</title>",
                  "<title>Hotels in Deutschland vergleichen & buchen | FreeHotels.info</title>",1)
            if "fh-city-filter" not in markup:
                label = "Stadt oder Reiseziel suchen" if lang=="de" else "Find a city or destination"
                toolbar = ('<div class="fh-index-search"><input class="fh-city-filter" type="search"'
                           ' aria-label="'+escape(label,quote=True)+'" placeholder="'+escape(label,quote=True)+'"'
                           ' autocomplete="off"><span class="fh-city-count" aria-live="polite"></span></div>')
                markup = re.sub(r'(<h1\b[^>]*>.*?</h1>)',lambda m:m.group(1)+toolbar,markup,count=1,flags=re.I|re.S)
            # Make all city directory entries keyboard-accessible and searchable.
            markup = re.sub(r'(<h2>Großstädte und wichtige Reiseziele</h2>\s*<p>.*?</p>\s*)<ul>',
                            r'\1<ul class="fh-city-list">',markup,count=1,flags=re.S)
            markup = re.sub(r'(<h2>Germany city guides</h2>\s*)<ul>',
                            r'\1<ul class="fh-city-list">',markup,count=1,flags=re.S)
            markup = markup.replace('<section id="astra-full-city-directory">','<section id="astra-full-city-directory">')
            markup = re.sub(r'(<section id="astra-full-city-directory">[\s\S]*?<p>.*?</p>\s*)<ul>',
                            r'\1<ul class="fh-city-list">',markup,count=1)
            pair = "en" if lang == "de" else "de"
            if f'hreflang="{pair}"' not in markup:
                links = (f'<link rel="alternate" hreflang="de-DE" href="https://freehotels.info/de/">'
                         f'<link rel="alternate" hreflang="en" href="https://freehotels.info/en/">'
                         f'<link rel="alternate" hreflang="x-default" href="https://freehotels.info/">')
                markup = insert_head(markup,links)
        elif is_city and "class=\"fh-booking\"" not in markup:
            slug = components[1]
            name = city_names.get((lang,slug),slug.replace("-"," ").title())
            if lang=="de":
                heading = "Hotels für deine Reise suchen"
                intro = "Reisedaten wählen und verfügbare Unterkünfte beim Buchungsanbieter prüfen."
                checkin, checkout, adults,button = "Anreise","Abreise","Erwachsene","Hotels suchen ↗"
                small = "Weiterleitung zu Booking.com. FreeHotels.info zeigt keine erfundenen Preise oder Verfügbarkeiten."
            else:
                heading = "Search hotels for your trip"
                intro = "Select dates and check actual hotel listings with the booking provider."
                checkin, checkout, adults,button = "Check-in","Check-out","Adults","Search hotels ↗"
                small = "Opens Booking.com. FreeHotels.info does not invent live prices or availability."
            form = (
               '<section class="fh-booking" aria-label="'+escape(heading,quote=True)+'">'
               '<h2>'+escape(heading)+'</h2><p>'+escape(intro)+'</p>'
               '<form class="fh-booking" data-lang="'+lang+'" action="https://www.booking.com/searchresults.html"'
               ' method="get" target="_blank" rel="noopener">'
               '<input type="hidden" name="ss" value="'+escape(name,quote=True)+'">'
               '<div class="fh-booking-grid">'
               '<label>'+checkin+'<input name="checkin" type="date" aria-label="'+checkin+'"></label>'
               '<label>'+checkout+'<input name="checkout" type="date" aria-label="'+checkout+'"></label>'
               '<label>'+adults+'<input name="group_adults" type="number" min="1" max="16" value="2" required></label>'
               '<button type="submit">'+button+'</button></div></form>'
               '<p class="fh-small-note">'+escape(small)+'</p></section>')
            markup = re.sub(r'(<h1\b[^>]*>.*?</h1>)',lambda m:m.group(1)+form,markup,count=1,flags=re.I|re.S)
            report["booking_forms_added"] += 1
            alternate = language_pairs.get(slug) if lang=="de" else reverse_pairs.get(slug)
            if alternate and (root / ("en" if lang=="de" else "de") / alternate / "index.html").exists():
                if 'hreflang="de-DE"' not in markup:
                    de_slug = slug if lang=="de" else alternate
                    en_slug = alternate if lang=="de" else slug
                    markup=insert_head(markup,
                       '<link rel="alternate" hreflang="de-DE" href="https://freehotels.info/de/'+de_slug+'/">'
                       '<link rel="alternate" hreflang="en" href="https://freehotels.info/en/'+en_slug+'/">')
        if markup != original:
            path.write_text(markup,encoding="utf-8")
            report["pages_enhanced"] += 1

# Build-time integrity audit covers all old-and-new /de and /en pages; it never
# removes them. The report flags any broken local links for further correction.
all_html = sorted((root/"de").rglob("*.html")) + sorted((root/"en").rglob("*.html"))
for page in all_html:
    html = page.read_text(encoding="utf-8",errors="replace")
    for target in re.findall(r'<a\b[^>]*href="([^"]+)"',html,re.I):
        url = urlsplit(target)
        if url.scheme or url.netloc or not url.path.startswith("/"):
            continue
        pathpart=unquote(url.path)
        if not pathpart.startswith(("/de/","/en/")):
            continue
        full=root/pathpart.lstrip("/")
        if not (full.is_file() or (full/"index.html").is_file()):
            # Legacy numeric/list routes are handled by the existing Nginx
            # recovery rules and are not touched by this overlay.
            if re.search(r"/(?:list\.html|\d+(?:\.html)?)/?$",pathpart):
                continue
            report["local_link_warnings"].append({
                "source":"/"+page.relative_to(root).as_posix(),"target":pathpart})
report["local_link_warnings"] = list({(x["source"],x["target"]):x for x in report["local_link_warnings"]}.values())
if report["local_link_warnings"]:
    report["status"]="PARTIAL"
(root / "repair-audit.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")

if not (root/"404.html").exists():
    (root/"404.html").write_text(
        '<!doctype html><html lang="de"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta name="robots" content="noindex,follow"><title>Seite nicht gefunden | FreeHotels.info</title>'
        '<link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/freehotels-repair.css">'
        '</head><body><main class="wrap"><article class="hero"><h1>Diese Seite wurde nicht gefunden.</h1>'
        '<p>Vielleicht wurde die Adresse geändert. Die Stadtguides bleiben erreichbar.</p>'
        '<p><a href="/de/">Hotels in Deutschland</a> · <a href="/en/">English hotel guides</a> · '
        '<a href="/">Startseite</a></p></article></main></body></html>',encoding="utf-8")

# Mandatory proof: the restored historical corpus, functional booking action,
# assets, and language integrity must survive every subsequent build.
checks=[
 ("language_german", (root/"de/index.html").is_file()),
 ("english_hub", (root/"en/index.html").is_file()),
 ("berlin_legacy", (root/"de/berlin/45.html").is_file()),
 ("booking_present", "booking.com/searchresults.html" in (root/"de/dortmund/index.html").read_text(encoding="utf-8")),
 ("css_asset", (asset_dir/"freehotels-repair.css").is_file()),
 ("js_asset", (asset_dir/"freehotels-repair.js").is_file()),
 ("no_france_in_german_cheap_guides",
    not any(fr in p.read_text(encoding="utf-8") for p in (root/"de").glob("*/guenstige-hotels/index.html")
            for fr in french_to_german)),
]
failed=[name for name,passed in checks if not passed]
report["required_checks"]={name:passed for name,passed in checks}
if failed:
    report["status"]="FAIL"
    (root/"repair-audit.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    raise SystemExit("FreeHotels repair proof FAILED: "+",".join(failed))
(root/"repair-audit.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
print(json.dumps(report,ensure_ascii=False))
