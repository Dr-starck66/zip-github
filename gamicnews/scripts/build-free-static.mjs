#!/usr/bin/env node
/**
 * ASTRA GAMIC production-safe static builder.
 * Source mirror stays noindex on GitHub Pages; dist is indexable ONLY for
 * URLs currently listed in the original GAMIC sitemap.
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
   const indexable=paths.has(norm);
   let h=buf.toString('utf8');
   h=h.replace(/\/zip-github\/gamicnews\//g,'/');
   h=h.replace(/<meta\s+name=["']robots["'][^>]*>/gi,'');
   const content=indexable?'index,follow,max-image-preview:large':'noindex,follow';
   h=h.replace(/<head([^>]*)>/i,'<head$1><meta name="robots" content="'+content+'">');
   if(indexable&&!/<link\s+rel=["']canonical["'][^>]+href=["']https:\/\/gamicnews\.com/i.test(h))
     throw Error('MISSING_PRODUCTION_CANONICAL: '+sub);
   buf=Buffer.from(h,'utf8');
   pages.push({path:sub,canonical:norm,indexable,bytes:buf.length});
  }
  fs.writeFileSync(dst,buf);
  files.push(sub);
 }
}
walk(root);
const allowed=pages.filter(x=>x.indexable);
if(allowed.length!==paths.size)
 throw Error('SITEMAP_HTML_MISMATCH '+allowed.length+' vs '+paths.size);
const receipt={schema:'astra-gamic-static-build/1',generatedAt:new Date().toISOString(),
 sourceMirror:'Dr-starck66/zip-github:gamicnews',sourceSha:process.env.GITHUB_SHA||null,
 status:'PASS_BUILD_ONLY',publishedToPublicHost:false,productionHttp:'UNVERIFIED',
 indexableRoutes:allowed.length,stagingNoindexRoutes:pages.length-allowed.length,
 preservedFiles:files.length,legacyHistoricalComplete:false,
 notes:['This build preserves existing canonical URLs and stages indexable HTML only for 38 verified sitemap entries.',
        'Historical URL inventory is not proven complete; 15,617 archive candidates are not equivalent to recovered pages.']};
fs.mkdirSync(path.join(dist,'.well-known'),{recursive:true});
fs.writeFileSync(path.join(dist,'.well-known','astra-release.json'),JSON.stringify(receipt,null,2)+'\n');
console.log('ASTRA_GAMIC_BUILD',JSON.stringify({status:receipt.status,indexable:allowed.length,stagingNoindex:receipt.stagingNoindexRoutes,files:files.length}));
