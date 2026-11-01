/**
 * ASTRA Ω — Cloudflare Pages static-only release gate.
 * Proves the built tree has the restored URLs, controlled indexation, and no
 * Functions/Workers entrypoints. This is NOT a public-deployment proof.
 */
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {join,relative} from 'node:path';
const dist='dist';
const legacy=[
  'hidden-lease-costs',
  'negotiating-car-lease-deal',
  'business-car-lease',
  'carleasedeal-net-electric-vs-hybrid-lease',
  'top-10-best-cars-to-lease-in-2025'
];
const hubs=[
  'car-lease-guides',
  'lease-costs-and-fees',
  'car-lease-deal-types',
  'car-lease-deals-by-budget'
];
function assert(ok,why){if(!ok)throw Error('CLOUDFLARE_PAGES_GATE_'+why);}
function list(root){
  let entries=[];
  for(const file of readdirSync(root,{withFileTypes:true})){
    const path=join(root,file.name);
    entries.push(...(file.isDirectory()?list(path):[path]));
  }
  return entries;
}
assert(existsSync(dist),'MISSING_DIST');
const paths=list(dist).map(p=>relative(dist,p).replaceAll('\\','/'));
const htmlFiles=paths.filter(p=>p.endsWith('.html'));
assert(htmlFiles.length===17,'HTML_COUNT_'+htmlFiles.length);
for(const path of ['index.html',...legacy.map(p=>p+'/index.html'),...hubs.map(p=>p+'/index.html')]){
  assert(paths.includes(path),'MISSING_ROUTE_'+path);
  const html=readFileSync(join(dist,path),'utf8');
  assert(/<h1[\s>]/i.test(html),'NO_H1_'+path);
  assert(/<title[\s>]/i.test(html),'NO_TITLE_'+path);
}
const indexable=process.env.SITE_INDEX_RELEASE==='1';
if(indexable){
  assert(process.env.DOMAIN_HTTPS_CONFIRMED==='1','DOMAIN_PROOF_REQUIRED');
  assert(paths.includes('sitemap.xml'),'MISSING_SITEMAP');
  assert(paths.includes('robots.txt'),'MISSING_ROBOTS');
  assert(paths.some(p=>p==='sitemap.xml')&&readFileSync(join(dist,'sitemap.xml'),'utf8').includes('carleasedeal.net'),'INVALID_SITEMAP');
}else{
  for(const path of htmlFiles){
    const html=readFileSync(join(dist,path),'utf8');
    assert(/<meta\s+name=["']robots["']\s+content=["']noindex,\s*follow["']/.test(html),'INDEX_NOT_GATED_'+path);
  }
  const headers=readFileSync(join(dist,'_headers'),'utf8');
  assert(headers.includes('X-Robots-Tag: noindex, follow'),'NO_NOINDEX_HEADER');
}
assert(!paths.some(p=>p==='functions'||p.startsWith('functions/')||p==='_worker.js'),'DYNAMIC_BILLING_RISK');
assert(!existsSync('functions'),'FUNCTIONS_SOURCE_PRESENT');
assert(paths.some(p=>p.startsWith('assets/')&&p.endsWith('.js')),'MISSING_JS_BUNDLE');
console.log(JSON.stringify({
 status:'PASS_LOCAL_ARTIFACT',
 host:'CLOUDFLARE_PAGES_FREE_STATIC',
 staticOnly:true,
 functions:false,
 htmlPages:htmlFiles.length,
 legacyPaths:legacy.length,
 topicalHubs:hubs.length,
 indexable,
 productionDeployed:false
}));
