import fs from 'node:fs';
import crypto from 'node:crypto';

const sources = JSON.parse(fs.readFileSync('data/sources.json', 'utf8'));
const articles = JSON.parse(fs.readFileSync('data/articles.json', 'utf8'));
const now = new Date();
const log = (m) => console.log(`[scout] ${m}`);

async function fetchText(url) {
  const r = await fetch(url, {
    headers: { 'user-agent': 'PhotovoltaicBulgariaBot/1.1 (+editorial monitoring)' },
    signal: AbortSignal.timeout(15000)
  });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return await r.text();
}

function strip(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreSource(html, src) {
  const text = strip(html);
  const lower = text.toLowerCase();
  const terms = [
    'фотоволта', 'солар', 'термопомп', 'саниран', 'енергийна ефективност',
    'електроенерг', 'ток', 'парно', 'газ', 'декарбонизац', 'батери',
    'обновяване', 'домакинств', 'енергия'
  ];
  const hits = terms.filter((t) => lower.includes(t));
  const excerpt = text.slice(0, 7000);
  return {
    source: src.name,
    url: src.url,
    priority: src.priority,
    score: hits.length,
    matchedTerms: hits,
    excerpt,
    fingerprint: crypto.createHash('sha256').update(excerpt).digest('hex').slice(0, 16)
  };
}

const rows = [];
for (const src of sources) {
  try {
    const row = scoreSource(await fetchText(src.url), src);
    if (row.score > 0) rows.push(row);
  } catch (e) {
    log(`source failed ${src.name}: ${e.message}`);
  }
}

rows.sort((a, b) => (b.score + b.priority) - (a.score + a.priority));
fs.mkdirSync('data/queue', { recursive: true });

const queue = {
  created: now.toISOString(),
  purpose: 'Source scouting only. No article is generated or published by this script.',
  existingTitles: articles.slice(-40).map((a) => a.title),
  candidates: rows.slice(0, 8)
};

fs.writeFileSync('data/queue/latest.json', JSON.stringify(queue, null, 2) + '\n');
log(`queued ${queue.candidates.length} sourced candidates; no content generated`);
