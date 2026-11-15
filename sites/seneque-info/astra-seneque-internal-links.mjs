/** ASTRA-276 / Sénèque: maillage contextuel non destructif. 20 propositions vérifiées contre un crawl du 15/11/2026. */
export const LINK_PLAN = Object.freeze([
  [
    "seneque-citation-temps",
    "carpe-diem-horace",
    "la formule carpe diem chez Horace"
  ],
  [
    "seneque-citation-temps",
    "seneque-desir-stoicisme",
    "la réflexion de Sénèque sur le désir"
  ],
  [
    "seneque-desir-stoicisme",
    "stoicisme-amour",
    "le stoïcisme face à l'amour"
  ],
  [
    "seneque-desir-stoicisme",
    "seneque-citation-temps",
    "le rapport de Sénèque au temps"
  ],
  [
    "stoicisme-amour",
    "venus-deesse-amour",
    "Vénus et les représentations romaines de l'amour"
  ],
  [
    "stoicisme-amour",
    "amor-fati-signification",
    "le sens d'amor fati"
  ],
  [
    "amor-fati-signification",
    "carpe-diem-horace",
    "l'origine de carpe diem"
  ],
  [
    "carpe-diem-horace",
    "seneque-citation-temps",
    "la réflexion de Sénèque sur le temps"
  ],
  [
    "fetes-romaines",
    "banquets-plaisirs-rome",
    "les banquets dans la société romaine"
  ],
  [
    "saturnales-noel-origine",
    "banquets-plaisirs-rome",
    "les pratiques des banquets romains"
  ],
  [
    "bacchanales-definition",
    "bacchus-dieu-vin",
    "le culte romain de Bacchus"
  ],
  [
    "bacchus-dieu-vin",
    "banquets-plaisirs-rome",
    "le vin dans les banquets de Rome"
  ],
  [
    "lupercales-saint-valentin",
    "venus-deesse-amour",
    "la déesse romaine Vénus"
  ],
  [
    "venus-deesse-amour",
    "lupercales-saint-valentin",
    "les Lupercales romaines"
  ],
  [
    "orgies-romaines-mythe",
    "mythes-libertinage-romain",
    "les idées reçues sur le libertinage romain"
  ],
  [
    "mythes-libertinage-romain",
    "orgies-romaines-mythe",
    "les représentations des orgies romaines"
  ],
  [
    "banquets-plaisirs-rome",
    "orgies-romaines-mythe",
    "la différence entre banquet et orgie romaine"
  ],
  [
    "lupanar-pompei",
    "mythes-libertinage-romain",
    "les mythes sur les mœurs romaines"
  ],
  [
    "lupanar-pompei",
    "orgies-romaines-mythe",
    "les récits des orgies romaines"
  ],
  [
    "saturnales-noel-origine",
    "fetes-romaines",
    "les principales fêtes romaines"
  ]
]);
const SITE = 'https://seneque.info';
const escapeHtml = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const canonicalPath = u => {
  try {
    const x = new URL(u.replace(/&amp;/g,'&'), SITE);
    if (x.origin !== SITE) return null;
    return x.pathname.replace(/\/+$/,'') + '/';
  } catch { return null; }
};
export function addContextLinks(html, route) {
  if (typeof html !== 'string') throw new TypeError('HTML_REQUIRED');
  const source = canonicalPath(route);
  const links = LINK_PLAN.filter(([from]) => canonicalPath('/' + from + '/') === source);
  if (!links.length) return { html, applicable: 0, inserted: 0, existing: 0 };
  const present = new Set();
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/gi)) {
    const dest = canonicalPath(m[2]);
    if (dest) present.add(dest);
  }
  const missing = links.filter(([,to]) => !present.has(canonicalPath('/' + to + '/')));
  if (!missing.length) return { html, applicable: links.length, inserted: 0, existing: links.length };
  if (!/<\/article\s*>/i.test(html)) throw new Error('ASTRA_SENEQUE_LINKER_ARTICLE_MISSING ' + route);
  const list = missing.map(([,to,anchor]) => '<li><a href="/' + to + '/">' + escapeHtml(anchor) + '</a></li>').join('');
  const aside = '<aside class="astra-related-reading" data-astra-seneque-linker="v1" aria-label="Lectures complémentaires"><h2>Pour approfondir</h2><ul>' + list + '</ul></aside>';
  const output = html.replace(/<\/article\s*>/i, aside + '</article>');
  return { html: output, applicable: links.length, inserted: missing.length, existing: links.length - missing.length };
}
