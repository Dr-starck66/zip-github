#!/usr/bin/env node
/**
 * BizarreSexuality ASTRA rescue: recover original static bytes embedded in
 * the user's existing eight archived Bun shards. GitHub Pages *preview only*.
 * Never changes live DNS; do not claim full historical restoration.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=path.resolve(process.cwd());
const out=path.resolve(process.argv[2]||'artifacts/bizarresexuality-mirror/site');
const base='https://dr-starck66.github.io/zip-github/bizarresexuality/';
const prefix='/zip-github/bizarresexuality/';
const forbidden=(rel)=>!rel||rel.startsWith('/')||rel.includes('\\')||
  !/^[A-Za-z0-9_./-]+$/.test(rel)||rel.split('/').some(x=>x==='.'||x==='..');
function save(rel,content){
 if(forbidden(rel))throw Error('UNSAFE_ARCHIVED_PATH: '+rel);
 const dest=path.join(out,rel);
 if(!dest.startsWith(out+path.sep))throw Error('PATH_ESCAPE');
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 fs.writeFileSync(dest,content);
}
const entries=new Map(),shards=[];
for(let n=0;n<8;n++){
 const p=path.join(root,'bizarre-railway-shards','shard'+n,'index.ts');
 const text=fs.readFileSync(p,'utf8'),marker='const FILES=';
 if(!text.startsWith(marker))throw Error('UNEXPECTED_SHARD_FORMAT: '+p);
 const end=text.indexOf(';\nconst MIME=',marker.length);
 if(end<0)throw Error('UNEXPECTED_SHARD_END: '+p);
 const dict=JSON.parse(text.slice(marker.length,end));
 for(const [rel,content] of Object.entries(dict)){
  if(forbidden(rel)||entries.has(rel))throw Error('DUPLICATE_OR_UNSAFE: '+rel);
  if(!content||!['utf8','base64'].includes(content.encoding))throw Error('INVALID_ARCHIVE_ENCODING');
  entries.set(rel,{content,shard:n});
 }
 shards.push({n,entries:Object.keys(dict).length,sourceBytes:fs.statSync(p).size});
}
const pages=[],written=[];
for(const [rel,{content,shard}] of entries){
 let buf=Buffer.from(content.data,content.encoding==='base64'?'base64':'utf8');
 if(rel.endsWith('.html')){
  let html=buf.toString('utf8');
  html=html.replace(/<meta\b[^>]*\bname\s*=\s*["']robots["'][^>]*>/gi,'');
  html=html.replace(/<head\b([^>]*)>/i,'<head$1><meta name="robots" content="noindex,follow">');
  // Only relative navigation/resource URLs are repointed to the preview path.
  // Production canonical, OpenGraph and JSON-LD remain untouched.
  html=html.replace(/(\b(?:href|src|action|poster)\s*=\s*["'])\/(?!\/)/gi,
    (_m,attr)=>attr+prefix);
  buf=Buffer.from(html,'utf8');
  pages.push(rel);
 } else if(rel.endsWith('.css')){
  const css=buf.toString('utf8').replace(/url\(\s*(["']?)\/assets\//gi,
    (_m,quote)=>'url('+quote+prefix+'assets/');
  buf=Buffer.from(css,'utf8');
 }
 const target=rel==='robots.txt'?'robots-original.txt':
   rel==='sitemap.xml'?'sitemap-production-backup.xml':
   rel==='news-sitemap.xml'?'news-sitemap-production-backup.xml':rel;
 save(target,buf);
 written.push({path:target,bytes:buf.length,sha256:crypto.createHash('sha256').update(buf).digest('hex'),sourceShard:shard});
}
const safePage=rel=>rel==='index.html'?'':rel.slice(0,-'index.html'.length);
const list=pages.filter(p=>p.endsWith('index.html')).sort();
const sitemap='<?xml version="1.0" encoding="UTF-8"?>\n'+
 '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+
 list.map(p=>'  <url><loc>'+base+safePage(p)+'</loc></url>').join('\n')+
 '\n</urlset>\n';
save('sitemap.xml',sitemap);
save('robots.txt','User-agent: *\nDisallow: /\n# Non-indexable historical staging mirror. Production domain unchanged.\n');
if(!fs.existsSync(path.join(out,'index.html')))throw Error('MISSING_HOME');
if(!fs.existsSync(path.join(out,'assets','site.css')))throw Error('MISSING_CSS');
if(!fs.existsSync(path.join(out,'assets','site.js')))throw Error('MISSING_JS');
const paths=new Set(written.map(x=>x.path));
const missingLinks=new Set();
for(const htmlPath of pages){
 const html=fs.readFileSync(path.join(out,htmlPath),'utf8');
 if(!/<meta name="robots" content="noindex,follow">/.test(html))
  throw Error('STAGING_NOINDEX_MISSING: '+htmlPath);
 const urls=[...html.matchAll(/\b(?:href|src)=["'](\/zip-github\/bizarresexuality\/[^"'?#]*)/gi)].map(x=>x[1]);
 for(const u of urls){
  const rel=u.slice(prefix.length);
  if(!rel)continue;
  if(!paths.has(rel)&&!paths.has(rel.replace(/\/?$/,'/')+'index.html'))
    missingLinks.add(rel);
 }
}
const report={schema:'astra-bizarre-shards-recovery/1',
 generatedAt:new Date().toISOString(),source:'ZIP_GITHUB_8_ORIGINAL_SHARDS',
 previewBase:base,productionDomain:'https://bizarresexuality.com/',
 productionStatus:'UNVERIFIED',previewStatus:'NOT_DEPLOYED',
 indexed:false,completeHistoricalInventory:false,sourceSha:process.env.GITHUB_SHA||null,
 shardCount:shards.length,shards,uniqueArchivedFiles:entries.size,
 publishedFiles:written.length+2,htmlPages:list.length,
 htmlUrls:list.map(p=>base+safePage(p)),missingInternalRoutes:[...missingLinks].sort(),
 missingInternalRouteCount:missingLinks.size,
 integrity:{duplicatePaths:0,unsafePaths:0,missingCSS:false,missingJS:false,allHTMLNoindex:true},
 caveats:['Stage is non-indexable and not a substitute for original domain',
 'Production sitemap kept separately as a backup',
 'Source pages absent from the shard archive remain missing until sourced',
 'GitHub Pages URL paths need independent HTTP verification']};
fs.mkdirSync(path.join(out,'.well-known'),{recursive:true});
fs.writeFileSync(path.join(out,'.well-known','astra-recovery-report.json'),JSON.stringify(report,null,2)+'\n');
console.log('ASTRA_BIZARRE_RESTORE',JSON.stringify({shards:report.shardCount,files:report.uniqueArchivedFiles,pages:report.htmlPages,missingInternal:report.missingInternalRouteCount,stagingNoindex:true,sourceSha:report.sourceSha,preview:base}));
if(list.length<30||entries.size<90)throw Error('UNDER_RECOVERED_ARCHIVE');
