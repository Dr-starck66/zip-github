#!/usr/bin/env node
/**
 * ASTRA GAMIC production-safe static builder.
 * Preserve source robots directives for production-canonical public URLs,
 * including new /news/ articles absent from the source sitemap. Only known
 * staging/duplicate copies and the five author profiles remain noindex.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.resolve(root,process.argv[2]||'dist');
if(dist===root||!dist.startsWith(root+path.sep))throw Error('INVALID_DIST_DIRECTORY');
const xml=fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
const originals=[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1].replace(/&amp;/g,'&'));
const paths=new Set();
for(const url of originals){
 const u=new URL(url);
 if(u.hostname!=='gamicnews.com'||u.protocol!=='https:')throw Error('SITEMAP_EXTERNAL_ORIGIN');
 paths.add((u.pathname.replace(/\/$/,'')||'/'));
}
if(paths.size<30)throw Error('INSUFFICIENT_SITEMAP_BASELINE');
const authorPaths=new Set([...paths].filter(p=>p.startsWith('/authors/')));
if(authorPaths.size!==5)throw Error('AUTHOR_NOINDEX_BASELINE_MISMATCH '+authorPaths.size);
if(fs.existsSync(dist))fs.rmSync(dist,{recursive:true});
const pages=[],files=[];
function walk(dir,rel=''){
 for(const item of fs.readdirSync(dir,{withFileTypes:true})){
  if(rel===''&&['scripts','dist','.git','node_modules'].includes(item.name))continue;
  const sub=path.join(rel,item.name),full=path.join(dir,item.name);
  if(item.isSymbolicLink())throw Error('UNSAFE_SYMLINK');
  if(item.isDirectory()){walk(full,sub);continue}
  if(!item.isFile())continue;
  const dst=path.join(dist,sub);
  if(!dst.startsWith(dist+path.sep))throw Error('OUTPUT_ESCAPE');
  fs.mkdirSync(path.dirname(dst),{recursive:true});
  let buf=fs.readFileSync(full);
  if(sub.endsWith('.html')){
   const urlPath='/'+sub.replace(/\/index\.html$/,'').replace(/^index\.html$/,'');
   const norm=urlPath.replace(/\/$/,'')||'/';
   let h=buf.toString('utf8');
   h=h.replace(/\/zip-github\/gamicnews\//g,'/');
   // The source robots tag is authoritative for a canonical public page.
   // In particular, never turn a new /news/ article into noindex merely
   // because a manual sitemap update has not yet been committed.
   const tags=[...h.matchAll(/<meta\s+name=["']robots["'][^>]*>/gi)];
   if(tags.length!==1)throw Error('SOURCE_ROBOTS_TAG_COUNT: '+sub+' '+tags.length);
   const directive=tags[0][0].match(/\bcontent=["']([^"']+)["']/i)?.[1];
   if(!directive)throw Error('SOURCE_ROBOTS_CONTENT_MISSING: '+sub);
   const tokens=directive.toLowerCase().split(',').map(x=>x.trim());
   const sourceIndex=tokens.includes('index')&&!tokens.includes('noindex');
   const sourceNoindex=tokens.includes('noindex');
   if(!sourceIndex&&!sourceNoindex)throw Error('SOURCE_ROBOTS_POLICY_INVALID: '+sub);
   const canonicalHref=h.match(/<link\s+rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i)?.[1];
   const canonicalUrl=canonicalHref?new URL(canonicalHref):null;
   const canonicalMatches=Boolean(canonicalUrl&&canonicalUrl.origin==='https://gamicnews.com'&&
     (canonicalUrl.pathname.replace(/\/$/,'')||'/')===norm&&!canonicalUrl.search&&!canonicalUrl.hash);
   const newCanonicalNews=norm.startsWith('/news/')&&sub.endsWith('/index.html')&&canonicalMatches&&sourceIndex;
   const indexable=!authorPaths.has(norm)&&(paths.has(norm)||newCanonicalNews);
   if(indexable){
     // A public canonical must retain the original index directive, without
     // a build-time replacement and without accidental noindex.
     if(!sourceIndex)throw Error('PUBLIC_SOURCE_NOINDEX: '+sub);
     if(!canonicalMatches)throw Error('PUBLIC_CANONICAL_MISMATCH: '+sub);
   }else if(sourceIndex){
     // Only known staging/duplicate copies are intentionally noindex.
     // Unknown pages abort the build instead of silently losing indexability.
     if(!(sub.startsWith('editorial-20261106/')||sub==='news/index.html'))
       throw Error('UNCLASSIFIED_SOURCE_INDEXABLE: '+sub);
     h=h.replace(tags[0][0],'<meta name="robots" content="noindex,follow">');
   }
   buf=Buffer.from(h,'utf8');
   pages.push({path:sub,canonical:norm,indexable,bytes:buf.length});
  }
  fs.writeFileSync(dst,buf);
  files.push(sub);
 }
}
walk(root);
const allowed=pages.filter(x=>x.indexable);
const newPublicNews=allowed.filter(x=>!paths.has(x.canonical));
if(allowed.length!==paths.size-authorPaths.size+newPublicNews.length)
 throw Error('SITEMAP_HTML_MISMATCH '+allowed.length+' vs '+(paths.size-authorPaths.size+newPublicNews.length));
if(newPublicNews.length){
 let generated=fs.readFileSync(path.join(dist,'sitemap.xml'),'utf8');
 for(const p of newPublicNews){
  const loc='https://gamicnews.com'+p.canonical;
  generated=generated.replace('</urlset>','<url><loc>'+loc+'</loc></url></urlset>');
 }
 fs.writeFileSync(path.join(dist,'sitemap.xml'),generated);
}
const authors=pages.filter(x=>authorPaths.has(x.canonical));
if(authors.length!==authorPaths.size||authors.some(x=>x.indexable))
 throw Error('AUTHOR_NOINDEX_REGRESSION');
const receipt={schema:'astra-gamic-static-build/1',generatedAt:new Date().toISOString(),
 sourceMirror:'Dr-starck66/zip-github:gamicnews',sourceSha:process.env.GITHUB_SHA||null,
 status:'PASS_BUILD_ONLY',publishedToPublicHost:false,productionHttp:'UNVERIFIED',
 indexableRoutes:allowed.length,authorNoindexRoutes:authors.length,stagingNoindexRoutes:pages.length-allowed.length,
 preservedFiles:files.length,legacyHistoricalComplete:false,
 notes:['Canonical public HTML preserves its source index directive; no blanket robots rewriting.',
        'Unlisted canonical /news/ articles are added to output sitemap automatically.',
        'Historical URL inventory is not proven complete; 15,617 archive candidates are not equivalent to recovered pages.']};
fs.mkdirSync(path.join(dist,'.well-known'),{recursive:true});
fs.writeFileSync(path.join(dist,'.well-known','astra-release.json'),JSON.stringify(receipt,null,2)+'\n');
console.log('ASTRA_GAMIC_BUILD',JSON.stringify({status:receipt.status,indexable:allowed.length,stagingNoindex:receipt.stagingNoindexRoutes,files:files.length}));
