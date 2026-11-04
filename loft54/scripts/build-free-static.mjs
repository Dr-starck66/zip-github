#!/usr/bin/env node
/** ASTRA LOFT54 original static release builder — does not modify the existing Pages mirror. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(root,process.argv[2]||'dist');
const preview='https://dr-starck66.github.io/zip-github/loft54/';
const production='https://loft54.club/';
const prefix='/zip-github/loft54/';
const xml=fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
const listed=[...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map(x=>x[1].replace(/&amp;/g,'&'));
if(listed.length!==44||new Set(listed).size!==44)throw Error('LOFT_SITEMAP_44_UNVERIFIED');
const allowed=new Map();
for(const u of listed){
 if(!u.startsWith(preview))throw Error('UNEXPECTED_SITEMAP_ORIGIN:'+u);
 const rel=u.slice(preview.length).replace(/\/+$/,'');
 if(rel.includes('?')||rel.includes('#')||rel.split('/').includes('..'))throw Error('UNSAFE_SITEMAP_PATH');
 allowed.set(rel,rel?rel+'/index.html':'index.html');
}
if(out===root||!out.startsWith(root+path.sep))throw Error('UNSAFE_DIST');
if(fs.existsSync(out))fs.rmSync(out,{recursive:true});
const written=[],pages=[];
function visit(dir,rel=''){
 for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  if(!rel&&['scripts','dist','.git','node_modules'].includes(e.name))continue;
  const p=path.join(rel,e.name),src=path.join(dir,e.name);
  if(e.isSymbolicLink())throw Error('SYMLINK_REFUSED');
  if(e.isDirectory()){visit(src,p);continue;}
  if(!e.isFile()||p==='_headers'||p==='_redirects')continue;
  const dst=path.join(out,p);
  fs.mkdirSync(path.dirname(dst),{recursive:true});
  let bytes=fs.readFileSync(src);
  if(/\.(?:html|css|js|json)$/i.test(p)){
   let txt=bytes.toString('utf8');
   txt=txt.replaceAll(prefix,'/');
   if(p.endsWith('.html')){
    txt=txt.replace(/<meta[^>]+\bname=["']robots["'][^>]*>/gi,'');
    const route=p==='index.html'?'':p.replace(/\/index\.html$/,'');
    const indexable=allowed.has(route);
    txt=txt.replace(/<head([^>]*)>/i,'<head$1><meta name="robots" content="'+(indexable?'index,follow,max-image-preview:large':'noindex,follow')+'">');
    if(indexable){
     const exp=production+route;
     if(!txt.includes('rel="canonical" href="'+exp+'"')&&!(route===''&&txt.includes('href="https://loft54.club/"')))throw Error('BAD_CANONICAL:'+p);
     pages.push({url:exp,file:p});
    }
   }
   bytes=Buffer.from(txt,'utf8');
  }
  fs.writeFileSync(dst,bytes);written.push(p);
 }
}
visit(root);
if(pages.length!==44)throw Error('INDEXABLE_PAGE_COUNT_'+pages.length);
fs.writeFileSync(path.join(out,'robots.txt'),'User-agent: *\nAllow: /\nSitemap: https://loft54.club/sitemap.xml\n');
const prodMap=xml.replaceAll(preview,production);
if((prodMap.match(/<loc>/g)||[]).length!==44||prodMap.includes('github.io'))throw Error('SITEMAP_BAD_CONVERSION');
fs.writeFileSync(path.join(out,'sitemap.xml'),prodMap);
const redirects=fs.readFileSync(path.join(root,'_redirects'),'utf8').split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#')).filter(x=>!x.startsWith('https://www.'));
const parsed=[],rewrites=[];
for(const line of redirects){
 const m=line.match(/^(\/\S+)\s+(\/\S+)\s+(301!?|200)\s*$/);
 if(!m)throw Error('UNSUPPORTED_REDIRECT:'+line);
 if(!m[1].startsWith('/')||!m[2].startsWith('/')||m[1].includes('?'))throw Error('UNSAFE_REDIRECT:'+line);
 if(m[3]==='200')rewrites.push({source:m[1],destination:m[2]});
 else parsed.push({source:m[1],destination:m[2],permanent:true});
}
const config={version:2,cleanUrls:false,redirects:parsed,rewrites};
fs.writeFileSync(path.join(out,'vercel.json'),JSON.stringify(config,null,2)+'\n');
const receipt={schema:'astra-loft54-release/1',sourceSha:process.env.GITHUB_SHA||null,scope:'BUILD_ONLY',
 generatedAt:new Date().toISOString(),originalHTML:pages.length,originalSitemapEntries:listed.length,
 staticFiles:written.length,approvedLegacyRedirects:parsed.length,
 unresolvedHistoricalPaths:155,allHistoricalRestored:false,domainConnected:false,
 productionHttp:'UNVERIFIED',seoNoindexRemovedOnlyInProductionBuild:true};
fs.mkdirSync(path.join(out,'.well-known'),{recursive:true});
fs.writeFileSync(path.join(out,'.well-known','astra-release.json'),JSON.stringify(receipt,null,2)+'\n');
console.log('ASTRA_LOFT54_BUILD',JSON.stringify(receipt));
