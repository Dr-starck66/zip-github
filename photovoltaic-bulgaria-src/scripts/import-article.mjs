import fs from 'node:fs';
import crypto from 'node:crypto';

const inbox = process.argv[2] || 'data/inbox/article.json';
if (!fs.existsSync(inbox)) {
  console.error(`[import] missing ${inbox}`);
  process.exit(1);
}

const allowedCategories = new Set(['solar', 'heat-pumps', 'renovation', 'support', 'bills']);
const articles = JSON.parse(fs.readFileSync('data/articles.json', 'utf8'));
const x = JSON.parse(fs.readFileSync(inbox, 'utf8'));

function slugify(s) {
  const base = s.toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9а-я]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70);
  return `${base}-${crypto.createHash('sha1').update(s).digest('hex').slice(0, 5)}`;
}

function normalizeText(v) { return String(v || '').trim(); }
function wordCount(body) { return body.join(' ').trim().split(/\s+/).filter(Boolean).length; }

const errs = [];
if (normalizeText(x.title).length < 25) errs.push('weak-title');
if (normalizeText(x.description).length < 70) errs.push('weak-description');
if (!allowedCategories.has(x.category)) errs.push('bad-category');
if (!Array.isArray(x.body) || x.body.length < 6) errs.push('too-few-paragraphs');
if (Array.isArray(x.body) && wordCount(x.body) < 550) errs.push('too-short');
if (!Array.isArray(x.sources) || x.sources.length < 1) errs.push('no-sources');
if (Array.isArray(x.sources) && x.sources.some((s) => !/^https?:\/\//.test(s.url || ''))) errs.push('invalid-source-url');
if (articles.some((a) => a.title.toLowerCase() === normalizeText(x.title).toLowerCase())) errs.push('duplicate-title');

const titleWords = normalizeText(x.title).toLowerCase().split(/\s+/).filter((w) => w.length > 5);
if (titleWords.length && articles.some((a) => titleWords.filter((w) => a.title.toLowerCase().includes(w)).length >= Math.min(4, titleWords.length))) {
  errs.push('possible-duplicate');
}

if (errs.length) {
  console.error(`[import] FAIL CLOSED: ${errs.join(', ')}`);
  process.exit(1);
}

const published = x.published || new Date().toISOString();
const article = {
  slug: x.slug || slugify(x.title),
  title: normalizeText(x.title),
  description: normalizeText(x.description),
  category: x.category,
  kind: x.kind || 'news',
  published,
  updated: x.updated || published,
  image: x.image || (x.category === 'heat-pumps' ? 'heat-pump' : x.category === 'solar' ? 'solar-roof' : x.category === 'bills' ? 'power-lines' : x.category === 'renovation' ? 'renovation' : 'battery'),
  sources: x.sources.map((s) => ({ label: normalizeText(s.label) || new URL(s.url).hostname, url: s.url })),
  body: x.body.map(normalizeText).filter(Boolean)
};

if (articles.some((a) => a.slug === article.slug)) {
  console.error('[import] FAIL CLOSED: duplicate-slug');
  process.exit(1);
}

articles.push(article);
fs.writeFileSync('data/articles.json', JSON.stringify(articles, null, 2) + '\n');
console.log(`[import] accepted: ${article.title}`);
