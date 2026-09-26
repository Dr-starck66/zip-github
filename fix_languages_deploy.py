from pathlib import Path
import re, sys, html

root = Path(sys.argv[1] if len(sys.argv) > 1 else 'site-public')

FR_HEADER='<header class="header"><div class="shell nav"><a class="brand" href="/">FreeHotels<b>.info</b></a><nav class="links"><a href="/">Accueil</a><a href="/news/">Actualités</a><a href="/fr/">Guides France</a><a href="/fr/voyage/europe-pas-cher/">Voyager moins cher</a></nav><span class="badge">✓ Édition française</span></div></header>'
FR_FOOTER='<footer class="footer"><div class="shell"><div class="footer-grid"><div><h3>FreeHotels.info</h3><p>Guides et actualités en français pour comparer le coût réel d’un séjour.</p></div><div><h3>Guides</h3><a href="/fr/paris/hotel-pas-cher/">Paris</a><a href="/fr/nice/hotel-pas-cher/">Nice</a><a href="/fr/annecy/hotel-pas-cher/">Annecy</a><a href="/fr/voyage/europe-pas-cher/">Europe pas chère</a></div><div><h3>Rédaction</h3><a href="/news/">Actualités</a><a href="/politique-editoriale/">Politique éditoriale</a><a href="/a-propos/">À propos</a><a href="/contact/">Contact</a></div></div><div class="legal">FreeHotels.info est un site éditorial indépendant. Vérifiez toujours les prix, disponibilités et conditions auprès du fournisseur. Les liens affiliés éventuels sont signalés.</div></div></footer>'
DE_HEADER='<header class="header"><div class="shell nav"><a class="brand" href="/de/">FreeHotels<b>.info</b></a><nav class="links"><a href="/de/">Startseite</a><a href="/de/berlin/">Berlin</a><a href="/de/frankfurt/">Frankfurt</a><a href="/de/hannover/">Hannover</a><a href="/de/hotels/fruehstueck-inklusive/">Frühstück inklusive</a></nav><span class="badge">✓ Deutsche Ausgabe</span></div></header>'
DE_FOOTER='<footer class="footer"><div class="shell"><div class="footer-grid"><div><h3>FreeHotels.info</h3><p>Unabhängige Hotelguides auf Deutsch: Lage, Verkehr, Stornierung und enthaltene Leistungen vergleichen.</p></div><div><h3>Städte</h3><a href="/de/berlin/">Berlin</a><a href="/de/frankfurt/">Frankfurt</a><a href="/de/koeln/">Köln</a><a href="/de/hannover/">Hannover</a></div><div><h3>Weitere Guides</h3><a href="/de/hamburg/">Hamburg</a><a href="/de/muenchen/">München</a><a href="/de/duesseldorf/">Düsseldorf</a></div></div><div class="legal">FreeHotels.info ist eine neue unabhängige Publikation und nicht das frühere Unternehmen, das diese Domain historisch nutzte.</div></div></footer>'
EN_HEADER='<header class="header"><div class="shell nav"><a class="brand" href="/en/">FreeHotels<b>.info</b></a><nav class="links"><a href="/en/">Home</a><a href="/en/berlin/45.html">Berlin</a></nav><span class="badge">✓ English edition</span></div></header>'
EN_FOOTER='<footer class="footer"><div class="shell"><div class="legal">FreeHotels.info is a new independent publication and is not the former company that historically used this domain.</div></div></footer>'

def shell(s,h,f):
    s=re.sub(r'<header class="header">.*?</header>',h,s,flags=re.S)
    s=re.sub(r'<footer class="footer">.*?</footer>',f,s,flags=re.S)
    return s

def remove_links(s,prefixes):
    for p in prefixes:
        s=re.sub(r'<a class="card"(?=[^>]*href="'+re.escape(p)+r')[^>]*>.*?</a>','',s,flags=re.S)
        s=re.sub(r'<div class="decision-card">(?:(?!</div>).)*?<a href="'+re.escape(p)+r'[^"]*"(?:(?!</div>).)*?</div>','',s,flags=re.S)
        s=re.sub(r'<a[^>]+href="'+re.escape(p)+r'[^"]*"[^>]*>.*?</a>','',s,flags=re.S)
    return s

for p in root.glob('fr/**/*.html'):
    p.write_text(remove_links(shell(p.read_text(),FR_HEADER,FR_FOOTER),['/de/','/en/']))
for p in root.glob('de/**/*.html'):
    s=remove_links(shell(p.read_text(),DE_HEADER,DE_FOOTER),['/fr/','/en/','/news/'])
    s=s.replace('✓ Guide indépendant','✓ Unabhängiger Guide').replace('Berlin, Germany','Berlin, Deutschland')
    p.write_text(s)
for p in root.glob('news/**/*.html'):
    p.write_text(remove_links(shell(p.read_text(),FR_HEADER,FR_FOOTER),['/de/','/en/']))
for rel in ['news/index.html','a-propos/index.html','contact/index.html','politique-editoriale/index.html','affiliate-disclosure/index.html','auteurs/cedric-jeanjean/index.html','404.html']:
    p=root/rel
    if p.exists(): p.write_text(remove_links(shell(p.read_text(),FR_HEADER,FR_FOOTER),['/de/','/en/']))

fr_cards=[
('Paris','/fr/paris/hotel-pas-cher/','Hôtel pas cher à Paris','Quartiers, métro, gares et coût réel du séjour.'),
('Nice','/fr/nice/hotel-pas-cher/','Hôtel pas cher à Nice','Centre, tram, bord de mer et compromis budget/localisation.'),
('Annecy','/fr/annecy/hotel-pas-cher/','Hôtel pas cher à Annecy','Vieille ville, gare, lac et parking à comparer.'),
('Marseille','/fr/marseille/hotel-pas-cher/','Hôtel pas cher à Marseille','Vieux-Port, gares, métro et quartiers pratiques.'),
('Lyon','/fr/lyon/hotel-pas-cher/','Hôtel pas cher à Lyon','Presqu’île, Part-Dieu, métro et budget total.'),
('Londres','/fr/londres/hotel-pas-cher/','Hôtel pas cher à Londres','Zones, Tube et arbitrage prix/temps de trajet.'),
('Barcelone','/fr/barcelone/hotel-pas-cher/','Hôtel pas cher à Barcelone','Quartiers, métro et coûts à vérifier avant de réserver.'),
('Voyage','/fr/voyage/all-inclusive-pas-cher/','All inclusive pas cher','Comparer vol, hôtel, transferts et services inclus.'),
('Voyage','/fr/voyage/derniere-minute/','Voyage dernière minute','Comparer sans se faire piéger par un faux rabais.'),
('Europe','/fr/voyage/europe-pas-cher/','Voyager pas cher en Europe','Destinations et méthode de comparaison du budget complet.')
]
cards=''.join(f'<a class="card" data-card href="{u}"><div><small>{lab}</small><h3>{t}</h3><p>{d}</p></div><span class="arrow">Ouvrir le guide →</span></a>' for lab,u,t,d in fr_cards)
(root/'index.html').write_text(f'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FreeHotels.info – Hôtels pas chers et actualités voyage</title><meta name="description" content="Guides hôtels et actualités voyage en français : quartiers, transports, annulation, petit-déjeuner, parking et coût réel du séjour."><link rel="canonical" href="https://freehotels.info/"><link rel="stylesheet" href="/assets/site.css"><meta name="robots" content="index,follow,max-image-preview:large"><script src="/assets/site.js" defer></script><script src="/assets/affiliate-config.js" defer></script><script src="/assets/affiliate.js" defer></script></head><body><div class="top">Édition française · Guides indépendants · Aucun faux prix en direct</div>{FR_HEADER}<main><section class="hero"><div class="shell hero-grid"><div><div class="eyebrow">Hôtels · Voyage · France & Europe</div><h1>Trouver le bon hôtel sans payer plus que nécessaire.</h1><p class="lede">FreeHotels.info compare ce qui change vraiment le coût d’un séjour : quartier, transports, annulation, petit-déjeuner, parking et transferts.</p></div><aside class="hero-card"><div><div class="eyebrow">Édition française</div><h2>Guides et actualités 100 % en français</h2><p>Les contenus allemands restent dans leur section dédiée et ne sont plus mélangés aux pages françaises.</p></div><p><a class="btn" href="/news/">Voir les actualités →</a></p></aside></div></section><section class="section"><div class="shell"><div class="section-head"><div><div class="eyebrow">Guides en français</div><h2>Choisir une destination</h2></div></div><div class="grid">{cards}</div></div></section></main>{FR_FOOTER}</body></html>''')

(root/'fr/index.html').write_text(f'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Guides hôtels en français | FreeHotels.info</title><meta name="description" content="Guides hôtels en français pour la France et l’Europe."><link rel="canonical" href="https://freehotels.info/fr/"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="stylesheet" href="/assets/site.css"></head><body><div class="top">Édition française · Guides hôtels et voyage</div>{FR_HEADER}<main><section class="page-hero"><div class="shell"><div class="eyebrow">Guides en français</div><h1>Où dormir et comment payer moins cher ?</h1><p class="lede">Choisir le bon quartier, limiter les coûts cachés et comparer les conditions avant de réserver.</p></div></section><section class="section"><div class="shell"><div class="grid">{cards}</div></div></section></main>{FR_FOOTER}</body></html>''')

de_items=[('Berlin','/de/berlin/'),('Frankfurt','/de/frankfurt/'),('Köln','/de/koeln/'),('Hannover','/de/hannover/'),('Hamburg','/de/hamburg/'),('München','/de/muenchen/'),('Düsseldorf','/de/duesseldorf/'),('Frühstück inklusive','/de/hotels/fruehstueck-inklusive/')]
dc=''.join(f'<a class="card" href="{u}"><div><h3>{t}</h3><p>Unabhängiger Hotelguide auf Deutsch.</p></div><span class="arrow">Guide öffnen →</span></a>' for t,u in de_items)
(root/'de/index.html').write_text(f'''<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hotelguides Deutschland | FreeHotels.info</title><meta name="description" content="Unabhängige Hotelguides auf Deutsch."><link rel="canonical" href="https://freehotels.info/de/"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="stylesheet" href="/assets/site.css"></head><body><div class="top">Deutsche Ausgabe · Unabhängige Hotelguides</div>{DE_HEADER}<main><section class="page-hero"><div class="shell"><div class="eyebrow">Hotelguides Deutschland</div><h1>Erst die richtige Lage wählen, dann Hotelpreise vergleichen</h1><p class="lede">Lage, Verkehr, Stornierung und enthaltene Leistungen bestimmen den Gesamtpreis.</p></div></section><section class="section"><div class="shell"><div class="grid">{dc}</div></div></section></main>{DE_FOOTER}</body></html>''')

(root/'en/index.html').write_text(f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>English hotel guides | FreeHotels.info</title><meta name="description" content="Independent English-language hotel guides."><link rel="canonical" href="https://freehotels.info/en/"><meta name="robots" content="index,follow"><link rel="stylesheet" href="/assets/site.css"></head><body><div class="top">English edition · Independent hotel guides</div>{EN_HEADER}<main><section class="page-hero"><div class="shell"><h1>English-language guides</h1><p class="lede">This section is kept separate from the French and German editions.</p></div></section><section class="section"><div class="shell"><div class="grid"><a class="card" href="/en/berlin/45.html"><div><h3>Berlin Mitte hotel guide</h3><p>Restored historical URL with current guidance in English.</p></div><span class="arrow">Open guide →</span></a></div></div></section></main>{EN_FOOTER}</body></html>''')
p=root/'en/berlin/45.html'
if p.exists():
    s=shell(p.read_text(),EN_HEADER,EN_FOOTER)
    s=re.sub(r'<p><a class="btn" href="/de/berlin/">.*?</a></p>','<p><a class="btn" href="/en/">Back to English guides →</a></p>',s,flags=re.S)
    p.write_text(s)

def urls_under(folder):
    out=[]
    for p in sorted((root/folder).rglob('*.html')):
        rel=p.relative_to(root).as_posix()
        rel=rel[:-10] if rel.endswith('/index.html') else rel
        out.append('https://freehotels.info/'+rel)
    return out
def urlset(urls):
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join(f'<url><loc>{html.escape(u)}</loc><lastmod>2026-09-26</lastmod></url>' for u in dict.fromkeys(urls))+'</urlset>\n'
fr=['https://freehotels.info/','https://freehotels.info/news/','https://freehotels.info/a-propos/','https://freehotels.info/contact/','https://freehotels.info/politique-editoriale/','https://freehotels.info/affiliate-disclosure/','https://freehotels.info/auteurs/cedric-jeanjean/']+urls_under('fr')+urls_under('news/fr')
(root/'sitemap-fr.xml').write_text(urlset(fr))
(root/'sitemap-de.xml').write_text(urlset(urls_under('de')))
(root/'sitemap-en.xml').write_text(urlset(urls_under('en')))
(root/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://freehotels.info/sitemap-fr.xml</loc></sitemap><sitemap><loc>https://freehotels.info/sitemap-de.xml</loc></sitemap><sitemap><loc>https://freehotels.info/sitemap-en.xml</loc></sitemap><sitemap><loc>https://freehotels.info/sitemap-news.xml</loc></sitemap></sitemapindex>\n')
(root/'robots.txt').write_text('User-agent: *\nAllow: /\n\nSitemap: https://freehotels.info/sitemap.xml\nSitemap: https://freehotels.info/sitemap-news.xml\n')

errors=[]
for d,banned in [('fr',['/de/','/en/']),('de',['/fr/','/en/','/news/']),('en',['/fr/','/de/']),('news',['/de/','/en/'])]:
    for p in (root/d).rglob('*.html'):
        s=p.read_text()
        for b in banned:
            if f'href="{b}' in s: errors.append(f'{p}: {b}')
if '/de/' in (root/'index.html').read_text() or '/en/' in (root/'index.html').read_text():
    errors.append('root homepage contains non-French links')
if errors:
    raise SystemExit('\n'.join(errors))
print('LANGUAGE-SEPARATION PASS')
