const OFFICIAL_HOST_HINTS = [
  ".gov", ".gouv.", "government.", "europa.eu", "dker.bg", "seea.government.bg",
  "fff.fr", "uefa.com", "fifa.com"
];

const SCHEDULE_WORDS = /\b(calendar|calendrier|schedule|fixture|kick[ -]?off|coup d[' ]envoi|horaire|programme|календар|начален час)\b/iu;
const BROADCAST_WORDS = /\b(diffusion|diffuseur|broadcast|broadcaster|tv|television|streaming|cha[iî]ne|излъчване|телевизия)\b/iu;
const OFFICIAL_WORDS = /\b(official|officiel|officielle|fédération|federation|minist[eè]re|commission|agency|agence|regulator|régulateur|официал|министерство|комисия|агенция)\b/iu;
const GENERIC = new Set([
  "avec","dans","pour","plus","moins","cette","comme","sans","entre","apres","avant","article","actualite","news","source","sources",
  "the","and","for","with","from","this","that","news","article","source","sources",
  "това","като","след","преди","през","или","при","към","върху","новини","източник","източници"
]);

export const ASTRA_SOURCE_ROLES = Object.freeze({
  NEWS_SOURCE: "NEWS_SOURCE",
  OFFICIAL_SOURCE: "OFFICIAL_SOURCE",
  SCHEDULE_SOURCE: "SCHEDULE_SOURCE",
  BROADCASTER: "BROADCASTER",
  CONTEXT_ONLY: "CONTEXT_ONLY"
});

export function fold(value = "") {
  return String(value)
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/https?:\/\/\S+/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function host(value = "") {
  try { return new URL(value).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return ""; }
}

function officialHost(h) {
  return Boolean(h) && OFFICIAL_HOST_HINTS.some((hint) =>
    hint.startsWith(".") ? h.endsWith(hint) : h === hint || h.includes(hint)
  );
}

export function sourceEvidence(source = {}) {
  return [
    source.label, source.name, source.publisher, source.title, source.headline,
    source.note, source.description, source.excerpt
  ].filter(Boolean).join(" ");
}

export function classifySource(source = {}) {
  if (source.role && Object.values(ASTRA_SOURCE_ROLES).includes(source.role)) return source.role;
  const evidence = fold(sourceEvidence(source));
  const h = host(source.url);
  if (SCHEDULE_WORDS.test(evidence)) return ASTRA_SOURCE_ROLES.SCHEDULE_SOURCE;
  if (BROADCAST_WORDS.test(evidence) && !OFFICIAL_WORDS.test(evidence)) return ASTRA_SOURCE_ROLES.BROADCASTER;
  if (source.status === "OFFICIAL" || officialHost(h) || OFFICIAL_WORDS.test(evidence)) return ASTRA_SOURCE_ROLES.OFFICIAL_SOURCE;
  if (source.contextOnly === true) return ASTRA_SOURCE_ROLES.CONTEXT_ONLY;
  if (h || source.status === "CORROBORATED" || source.status === "HIGH_CONFIDENCE") return ASTRA_SOURCE_ROLES.NEWS_SOURCE;
  return ASTRA_SOURCE_ROLES.CONTEXT_ONLY;
}

function tokens(value = "") {
  return new Set(
    fold(value).split(" ").filter((t) => t.length >= 4 && !GENERIC.has(t) && !/^\d+$/u.test(t))
  );
}

export function relevance(article, source) {
  const core = tokens([
    article.title, article.h1, article.description, article.lead,
    ...(article.entities || []), ...(article.teams || []), article.competition, article.query
  ].filter(Boolean).join(" "));
  const evidence = tokens(sourceEvidence(source) + " " + (source.url || ""));
  let overlap = 0;
  for (const token of evidence) if (core.has(token)) overlap += 1;
  const ratio = evidence.size ? overlap / evidence.size : 0;
  return { overlap, ratio, coreSize: core.size, evidenceSize: evidence.size };
}

function allArticleText(article) {
  const out = [article.title, article.h1, article.description, article.lead];
  const body = article.body || article.paragraphs || [];
  for (const item of body) {
    if (typeof item === "string") out.push(item);
    else if (item && typeof item === "object") {
      out.push(item.h2, item.h3, item.h4, item.body, item.text);
      for (const sub of item.subsections || []) out.push(sub.h3, sub.h4, sub.body, sub.text);
    }
  }
  return out.filter(Boolean).map(String);
}

export function auditArticle(article, options = {}) {
  const reasons = [];
  const sources = Array.isArray(article.sources) ? article.sources : [];
  const roles = {};
  const seenUrls = new Set();
  const seenLabels = new Set();

  if (!String(article.slug || "").match(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u)) reasons.push("invalid-or-missing-slug");
  if (allArticleText(article).some((t) => /&nbsp;|&#160;|<\/?[a-z][^>]*>/iu.test(t))) reasons.push("visible-html-artifact");
  if (!sources.length && options.allowNoSources !== true) reasons.push("no-sources");

  let relevantOfficial = 0;
  let relevantNews = 0;
  for (const source of sources) {
    const role = classifySource(source);
    roles[source.id || source.url || source.label || String(Object.keys(roles).length)] = role;
    const u = String(source.url || "").trim();
    const label = fold(source.label || source.name || source.publisher || "");
    if (u) {
      if (!/^https?:\/\//i.test(u)) reasons.push("invalid-source-url:" + u);
      if (seenUrls.has(u)) reasons.push("duplicate-source-url:" + u);
      seenUrls.add(u);
    }
    if (label) {
      if (seenLabels.has(label) && options.allowDuplicateLabels !== true) reasons.push("duplicate-source-label:" + label);
      seenLabels.add(label);
    }
    if (role === ASTRA_SOURCE_ROLES.SCHEDULE_SOURCE || role === ASTRA_SOURCE_ROLES.BROADCASTER || role === ASTRA_SOURCE_ROLES.CONTEXT_ONLY) continue;
    const rel = relevance(article, source);
    const hasExplicitEvidence = Boolean(source.title || source.headline || source.note || source.description || source.excerpt);
    const isRelevant = !hasExplicitEvidence || rel.overlap >= (options.minOverlap ?? 1);
    if (!isRelevant) {
      reasons.push("source-semantic-mismatch:" + (source.label || source.url || "unknown"));
      continue;
    }
    if (role === ASTRA_SOURCE_ROLES.OFFICIAL_SOURCE) relevantOfficial += 1;
    if (role === ASTRA_SOURCE_ROLES.NEWS_SOURCE) relevantNews += 1;
  }

  const isNews = article.kind === "news" || article.articleType === "news";
  if (isNews && options.requireCorroboration !== false && relevantOfficial === 0 && relevantNews < 2) {
    reasons.push("insufficient-news-corroboration");
  }

  return { pass: reasons.length === 0, reasons, roles, relevantOfficial, relevantNews };
}

export function auditCollection(articles, options = {}) {
  const reasons = [];
  const slugs = new Set();
  const normalizedTitles = new Set();
  const reports = [];
  for (const article of articles || []) {
    const slug = String(article.slug || "");
    const title = fold(article.title || article.h1 || "");
    if (slug && slugs.has(slug)) reasons.push("duplicate-slug:" + slug);
    if (slug) slugs.add(slug);
    if (title && normalizedTitles.has(title)) reasons.push("duplicate-title:" + title);
    if (title) normalizedTitles.add(title);
    const report = auditArticle(article, options);
    reports.push({ slug, ...report });
    for (const reason of report.reasons) reasons.push((slug || "unknown") + ":" + reason);
  }
  return { pass: reasons.length === 0, reasons, reports };
}

export function filterRelevantSources(article, sources, options = {}) {
  return (sources || []).filter((source) => {
    const role = classifySource(source);
    if (role === ASTRA_SOURCE_ROLES.SCHEDULE_SOURCE || role === ASTRA_SOURCE_ROLES.BROADCASTER) return false;
    const rel = relevance(article, source);
    return rel.overlap >= (options.minOverlap ?? 1);
  });
}
