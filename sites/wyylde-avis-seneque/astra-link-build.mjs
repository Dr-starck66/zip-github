#!/usr/bin/env node
/** ASTRA ORPHAN GUARD Ω — build-time source-to-output repair; no credentials/dependencies. */
import fs from 'node:fs/promises';
import {enrich} from './astra-depth-content.mjs';
import path from 'node:path';
const ROOT=process.cwd(), OUT=path.join(ROOT,'dist'), BASE='https://wyylde-avis.seneque.info/';
const sitemapFile=path.join(ROOT,'sitemap.xml');
const esc=x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const normalize=(raw,src=BASE)=>{try{const u=new URL(raw,src);if(u.origin!==new URL(BASE).origin)return null;u.hash='';u.search='';return u.href}catch{return null}};
const urlToFile=u=>{const rel=decodeURIComponent(new URL(u).pathname).replace(/^\/+/, '');if(rel.includes('\\')||rel.split('/').includes('..'))throw Error('PATH_ESCAPE '+u);return path.join(OUT,rel,'index.html')};
const title=html=>(html.match(/<title\b[^>]*>([^<]+)<\/title>/i)||[])[1]?.replace(/\s+[|–—].*$/,'').trim()||'Voir le guide';
const anchors=(html,base)=>new Set([...html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)].map(m=>normalize(m[1],base)).filter(Boolean));
const canonical=(html,src)=>{const tag=(html.match(/<link\b[^>]*\brel=["']canonical["'][^>]*>/i)||[])[0]||'';const m=tag.match(/\bhref=["']([^"']+)["']/i);return m?normalize(m[1],src):null};
async function enumerate(dir){const list=[];for(const d of await fs.readdir(dir,{withFileTypes:true})){if(d.name==='dist'||d.name==='.git'||d.name==='node_modules')continue;const full=path.join(dir,d.name);if(d.isSymbolicLink())continue;if(d.isDirectory())list.push(...await enumerate(full));else if(d.isFile()&&d.name==='index.html')list.push(full)}return list}
async function main(){
  await fs.rm(OUT,{recursive:true,force:true});await fs.mkdir(OUT,{recursive:true});
  for(const e of await fs.readdir(ROOT,{withFileTypes:true})){if(['dist','node_modules','.git','astra-link-build.mjs'].includes(e.name)||e.isSymbolicLink())continue;await fs.cp(path.join(ROOT,e.name),path.join(OUT,e.name),{recursive:true})}
  await enrich(OUT);
  const original=await fs.readFile(sitemapFile,'utf8');
  if(!/<urlset\b/i.test(original))throw Error('INVALID_SITEMAP');
  const declared=[...original.matchAll(/<loc\b[^>]*>([^<]+)<\/loc>/gi)].map(m=>m[1].replace(/&amp;/g,'&'));
  const sitemap=new Set(declared.map(x=>normalize(x)).filter(Boolean));
  if(sitemap.size!==declared.length)throw Error('INVALID_OR_DUPLICATE_SITEMAP_URL');
  const paths=await enumerate(ROOT), all=new Map();
  for(const file of paths){
    const route=path.relative(ROOT,path.dirname(file)).split(path.sep).join('/');
    const url=normalize(route?route+'/':BASE);if(!url)throw Error('UNSAFE_ROUTE '+route);
    const html=await fs.readFile(file,'utf8');
    if(/<meta\b[^>]*(?:noindex)/i.test(html)||/<html\b[^>]*\bdata-noindex/i.test(html))continue;
    if(canonical(html,url)!==url)throw Error('CANONICAL_MISMATCH '+url);
    if(all.has(url))throw Error('DUPLICATE_ROUTE '+url);
    all.set(url,{url,html,local:urlToFile(url)});
  }
  if(!all.has(BASE))throw Error('HOMEPAGE_MISSING');
  for(const url of sitemap)if(!all.has(url))throw Error('SITEMAP_PAGE_MISSING '+url);
  let generated=0,appended=0;
  for(const url of all.keys())if(!sitemap.has(url)){sitemap.add(url);generated++}
  if(generated){const entries=[...all.keys()].filter(x=>!declared.includes(x)).map(x=>'<url><loc>'+esc(x)+'</loc></url>').join('\n');const output=original.replace(/<\/urlset\s*>/i,entries+'\n</urlset>');await fs.writeFile(path.join(OUT,'sitemap.xml'),output)}
  const incoming=new Map([...all.keys()].map(u=>[u,new Set()]));
  for(const [src,p] of all)for(const dst of anchors(p.html,src))if(src!==dst&&incoming.has(dst))incoming.get(dst).add(src);
  const orphans=[...all.keys()].filter(u=>u!==BASE&&!incoming.get(u)?.size);
  if(orphans.length){
    const home=all.get(BASE),list=orphans.map(u=>'<li><a href="'+esc(new URL(u).pathname)+'">'+esc(title(all.get(u).html))+'</a></li>').join('');
    if(!/<\/main\s*>/i.test(home.html))throw Error('HOMEPAGE_NO_MAIN');
    const block='<section data-astra-orphan-guard="build-v1" aria-label="Guides du site"><h2>Autres guides Wyylde</h2><ul>'+list+'</ul></section>';
    const fixed=home.html.replace(/<\/main\s*>/i,block+'</main>');
    await fs.writeFile(home.local,fixed,'utf8');appended=orphans.length;
  }
  const after=new Map([...all].map(([u,p])=>[u,{...p,html:p.html}]));
  if(orphans.length)after.get(BASE).html=await fs.readFile(all.get(BASE).local,'utf8');
  const seen=new Map([...after.keys()].map(u=>[u,new Set()]));
  for(const [src,p] of after)for(const dst of anchors(p.html,src))if(src!==dst&&seen.has(dst))seen.get(dst).add(src);
  const still=[...after.keys()].filter(u=>u!==BASE&&!seen.get(u).size);
  if(still.length)throw Error('ORPHANS_REMAIN '+still.join(','));
  console.log(JSON.stringify({component:'ASTRA_ORPHAN_GUARD',status:'PASS_BUILD',pages:all.size,orphansBefore:orphans.length,linksAdded:appended,sitemapUrlsAdded:generated,orphansAfter:0}));
}
main().catch(e=>{console.error('ASTRA_ORPHAN_GUARD_FAIL',String(e?.stack||e));process.exitCode=1});
