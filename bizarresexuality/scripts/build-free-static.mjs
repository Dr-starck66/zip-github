#!/usr/bin/env node
/** ASTRA BizarreSexuality original 32-page production rebuild, no change to Pages preview. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.resolve(root,'dist');
const mirror='https://dr-starck66.github.io/zip-github/bizarresexuality/';
const production='https://bizarresexuality.com/';
const prefix='/zip-github/bizarresexuality/';
const sitemap=fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
const locs=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gi)].map(m=>m[1].replace(/&amp;/g,'&'));
if(locs.length!==32||new Set(locs).size!==32||locs.some(s=>!s.startsWith(mirror)))throw Error('UNVERIFIED_PREVIEW_32');
const allowed=new Map();
for(const u of locs){
 const route=u.slice(mirror.length).replace(/\/$/,'');
 if(route.split('/').includes('..')||/[?#]/.test(route))throw Error('UNSAFE_ROUTE');
 allowed.set(route,route?route+'/index.html':'index.html');
}
if(!dist.startsWith(root+path.sep))throw Error('UNSAFE_OUTPUT');
if(fs.existsSync(dist))fs.rmSync(dist,{recursive:true});
const pages=[],files=[];
function walk(dir,rel=''){
 for(const item of fs.readdirSync(dir,{withFileTypes:true})){
  if(!rel&&['dist','scripts','.git','node_modules','.well-known'].includes(item.name))continue;
  const sub=path.join(rel,item.name),src=path.join(dir,item.name);
  if(item.isSymbolicLink())throw Error('UNSAFE_SYMLINK');
  if(item.isDirectory()){walk(src,sub);continue}
  if(!item.isFile())continue;
  const dest=path.join(dist,sub);
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  let buf=fs.readFileSync(src);
  if(/\.(?:html|css|js|json)$/i.test(sub)){
   let text=buf.toString('utf8').replaceAll(prefix,'/');
   if(sub.endsWith('.html')){
    const route=sub==='index.html'?'':sub.replace(/\/index\.html$/,'');
    const indexed=allowed.has(route);
    text=text.replace(/<meta\b[^>]*\bname\s*=\s*["']robots["'][^>]*>/gi,'');
    text=text.replace(/<head\b([^>]*)>/i,'<head$1><meta name="robots" content="'+(indexed?'index,follow,max-image-preview:large':'noindex,follow')+'">');
    if(indexed){
     const canonical=(text.match(/<link\s+rel=["']canonical["'][^>]*href=["']([^"']+)/i)||[])[1];
     const expected=production+route;
     if(!canonical||canonical.replace(/\/$/,'')!==expected.replace(/\/$/,''))throw Error('CANONICAL_MISMATCH:'+sub+'->'+canonical);
     pages.push({path:sub,canonical});
    }
   }
   buf=Buffer.from(text,'utf8');
  }
  fs.writeFileSync(dest,buf);files.push(sub);
 }
}
walk(root);
if(pages.length!==32||files.length<90)throw Error('INCOMPLETE_RELEASE_PACKAGE');
const prodSitemap=sitemap.replaceAll(mirror,production);
if((prodSitemap.match(/<loc>/g)||[]).length!==32||prodSitemap.includes('github.io'))throw Error('SITEMAP_CONVERSION_FAILED');
fs.writeFileSync(path.join(dist,'sitemap.xml'),prodSitemap);
fs.writeFileSync(path.join(dist,'robots.txt'),'User-agent: *\nAllow: /\nSitemap: https://bizarresexuality.com/sitemap.xml\nSitemap: https://bizarresexuality.com/news-sitemap.xml\n');
const receipt={schema:'astra-bizarre-production-candidate/1',sourceSha:process.env.GITHUB_SHA||null,
 origin:'ZIP_GITHUB_8_SHARDS',snapshotOriginalHtml:32,preservedFiles:files.length,
 expectedProductionPages:pages.length,sitemapUrls:locs.length,stagingPreviewUnaffected:true,
 domainProduction:'UNVERIFIED',allHistoricalUrlsRestored:false};
fs.mkdirSync(path.join(dist,'.well-known'),{recursive:true});
fs.writeFileSync(path.join(dist,'.well-known','astra-release.json'),JSON.stringify(receipt,null,2)+'\n');
console.log('ASTRA_BIZARRE_PRODUCTION_BUILD',JSON.stringify(receipt));
