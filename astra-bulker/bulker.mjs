#!/usr/bin/env node
/** ASTRA BULKER Ω v0.1 — no paid API, no automatic production writes. */
import {readFileSync, mkdirSync, writeFileSync, existsSync} from 'node:fs';
import {join, resolve, sep} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {auditCorpus} from '../astra-bricks/content-quality-guard/quality.mjs';

const text = x => String(x ?? '').trim();
const esc = x => text(x).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sha = x => createHash('sha256').update(x).digest('hex');
const slugify = x => text(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,95);
const assert = (condition,code) => {if(!condition) throw Error(code);};
const sanePath = p => /^\/[a-z0-9/-]+\/$/.test(p) && !p.includes('//') && !p.includes('..');
function host(site){
 const u=new URL(text(site.domain));
 assert(u.protocol==='https:' && !u.username && !u.password && !u.port && u.pathname==='/' && !u.search && !u.hash && /\./.test(u.hostname),'SITE_ORIGIN_INVALID');
 assert(['fr','en','es','nl','de'].includes(site.language),'LANGUAGE_INVALID');
 return u.origin;
}
export function plan(manifest){
 assert(manifest?.schema==='astra-bulker/1','MANIFEST_SCHEMA_INVALID');
 const origin=host(manifest.site||{}), topics=manifest.topics;
 assert(Array.isArray(topics) && topics.length>0 && topics.length<=1000,'TOPIC_COUNT_INVALID');
 const rawPrefix=text(manifest.site.pathPrefix||'');
 assert(!rawPrefix||(/^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/i.test(rawPrefix) && rawPrefix.split('/').every(x=>x!=='..')),'PATH_PREFIX_INVALID');
 const prefix=rawPrefix ? '/'+rawPrefix.split('/').map(slugify).join('/')+'/' : '/';
 const reserved=new Set(manifest.existingPaths||[]), seen=new Set();
 const briefs=topics.map((t,i)=>{
  const keyword=text(t.keyword),title=text(t.title), cluster=text(t.cluster);
  assert(keyword.length>=3 && title.length>=12 && cluster.length>0,'TOPIC_INCOMPLETE_'+i);
  const slug=slugify(t.slug||keyword), path=prefix+slug+'/';
  assert(slug && sanePath(path),'TOPIC_SLUG_INVALID_'+i);
  assert(!seen.has(path),'DUPLICATE_TARGET_'+path);
  assert(!reserved.has(path),'EXISTING_URL_PROTECTED_'+path);
  seen.add(path);
  return {path,canonical:origin+path,keyword,title,cluster,language:manifest.site.language,
   intent:text(t.intent)||'information',angle:text(t.angle),questions:(t.questions||[]).map(text).filter(Boolean),
   sourceCandidates:(t.sourceCandidates||[]).filter(x=>/^https:\/\//.test(x)),links:[]};
 });
 // Linking only inside the same cluster; never invent links to existing URLs.
 for(const b of briefs){
  const siblings=briefs.filter(x=>x.cluster===b.cluster && x.path!==b.path);
  b.links=siblings.slice(0,3).map(x=>({path:x.path,title:x.title}));
 }
 return {schema:'astra-bulker-plan/1',status:'BRIEFS_ONLY_NOT_PUBLISHED',origin,language:manifest.site.language,
  briefs,createdAt:new Date().toISOString(),publicationCount:0};
}
export function prompts(planResult){
 return planResult.briefs.map(b=>({path:b.path,prompt:[
  `Rédige un article ${b.language} original et documenté pour ${b.canonical}.`,
  `Sujet: ${b.title}. Mot-clé: ${b.keyword}. Angle: ${b.angle||'répondre précisément au lecteur'}.`,
  `Questions à traiter: ${b.questions.join(' ; ')||'à rechercher sérieusement'}.`,
  `Sources candidates (vérifier pertinence ET date avant citation): ${b.sourceCandidates.join(' ; ')||'aucune source prévalidée'}.`,
  'Produire un JSON avec path, title, description, type:"article", language, sections:[{heading,paragraphs}], sources:[{title,url}], evidence:[{claim,sourceUrl,sourceLocator}], review.',
  'Au moins 1500 mots de paragraphes utiles, six sections distinctes, trois sources HTTPS distinctes, cinq faits précis traçables.',
  'Ne fabrique jamais de citations, URL, chiffres, prix, jurisprudence, actualité ou validation éditoriale.',
  'Conserver review.approved=false jusqu’à la revue factuelle humaine et ne pas créer de liens fictifs.',
  'Ne pas promettre de classement Google. Aucun texte générique ni permutation de nom de ville.'
 ].join('\n')}));
}
function render(p, b, origin, validPaths){
 const canonical=origin+p.path;
 const sections=p.sections.map(s=>`<section><h2>${esc(s.heading)}</h2>${s.paragraphs.map(q=>`<p>${esc(q)}</p>`).join('\n')}</section>`).join('\n');
 const sources=p.sources.map(s=>`<li><a href="${esc(s.url)}" rel="noopener noreferrer">${esc(s.title||s.url)}</a></li>`).join('');
 const links=b.links.filter(l=>validPaths.has(l.path)).map(l=>`<li><a href="${esc(l.path)}">${esc(l.title)}</a></li>`).join('');
 const schema={ '@context':'https://schema.org','@type':'Article',headline:p.title,description:p.description||'',inLanguage:p.language,
  mainEntityOfPage:canonical,citation:p.sources.map(s=>s.url)};
 const image=p.image && /^https:\/\//.test(p.image.url||'') && text(p.image.license) && text(p.image.alt) ? p.image : null;
 if(image) schema.image=image.url;
 return `<!doctype html>\n<html lang="${esc(p.language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`+
 `<title>${esc(p.title)}</title><meta name="description" content="${esc(p.description||'')}"><meta name="robots" content="index,follow">`+
 `<link rel="canonical" href="${esc(canonical)}"><meta property="og:title" content="${esc(p.title)}">`+
 (image?`<meta property="og:image" content="${esc(image.url)}">`:'')+
 `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g,'\\u003c')}</script></head><body>`+
 `<main><article><h1>${esc(p.title)}</h1>${image?`<figure><img src="${esc(image.url)}" alt="${esc(image.alt)}" loading="lazy"></figure>`:''}`+
 `${sections}<section><h2>Sources</h2><ul>${sources}</ul></section>${links?`<nav aria-label="Articles associés"><h2>À lire aussi</h2><ul>${links}</ul></nav>`:''}`+
 `</article></main></body></html>`;
}
export function build(manifest, pages){
 const p=plan(manifest), validPaths=new Set(p.briefs.map(x=>x.path));
 assert(Array.isArray(pages) && pages.length===p.briefs.length,'MISSING_OR_EXTRA_PAGES');
 const mapped=new Map();
 for(const page of pages){
  assert(validPaths.has(page.path),'UNKNOWN_PAGE_PATH_'+page.path);
  assert(!mapped.has(page.path),'DUPLICATE_ARTICLE_'+page.path);
  mapped.set(page.path,page);
 }
 const ordered=p.briefs.map(b=>mapped.get(b.path));
 for(let i=0;i<ordered.length;i++){
  const page=ordered[i],brief=p.briefs[i];
  assert(page.title===brief.title && page.language===brief.language && page.type==='article','PAGE_BRIEF_MISMATCH_'+brief.path);
  assert(page.review?.approved===true && page.review?.factualSpotcheck===true && text(page.review?.reviewer) && text(page.review?.date),'HUMAN_REVIEW_REQUIRED_'+brief.path);
  assert(!page.image || (/^https:\/\//.test(page.image.url||'') && text(page.image.license) && text(page.image.alt)),'IMAGE_RIGHTS_MISSING_'+brief.path);
  assert(!page.sources?.some(s=>{try{return new URL(s.url).protocol!=='https:';}catch{return true;}}),'SOURCE_URL_INVALID_'+brief.path);
 }
 const report=auditCorpus(ordered,{enforce:'all',language:manifest.site.language});
 assert(report.status==='PASS','CONTENT_GUARD_FAIL '+JSON.stringify(report.results.filter(r=>r.issues.length).map(r=>({path:r.path,issues:r.issues.slice(0,6)}))));
 const files=p.briefs.map((b,i)=>{const html=render(ordered[i],b,p.origin,validPaths);return {path:b.path,canonical:b.canonical,html,sha256:sha(html),bytes:Buffer.byteLength(html)};});
 return {schema:'astra-bulker-build/1',status:'BUILT_NOT_DEPLOYED',qualityGate:'PASS_LOCAL_STRUCTURE_ONLY',
  editorialReview:'DECLARED_NOT_INDEPENDENTLY_VERIFIED',liveHttp:'UNVERIFIED',indexing:'UNVERIFIED',files,
  createdAt:new Date().toISOString(),publicationCount:0};
}
function output(dir, bundle, mode){
 mkdirSync(dir,{recursive:true});
 const safeRoot=resolve(dir);
 for(const f of bundle.files||[]){
  const target=resolve(safeRoot,'.'+f.path+'index.html');
  assert(target.startsWith(safeRoot+sep),'OUTPUT_TRAVERSAL');
  assert(!existsSync(target),'OUTPUT_ALREADY_EXISTS_'+f.path);
  mkdirSync(resolve(target,'..'),{recursive:true});writeFileSync(target,f.html);
 }
 const safe=JSON.parse(JSON.stringify(bundle)); if(safe.files) safe.files=safe.files.map(({html,...rest})=>rest);
 writeFileSync(join(dir, mode==='plan'?'plan.json':'receipt.json'),JSON.stringify(safe,null,2)+'\n');
}
async function main(){
 const [cmd,input,out]=process.argv.slice(2);
 assert(['plan','build'].includes(cmd) && input && out,'USAGE: node bulker.mjs plan|build input.json output_dir');
 const data=JSON.parse(readFileSync(input,'utf8'));
 if(cmd==='plan'){
  const result=plan(data);result.prompts=prompts(result);output(out,result,cmd);
  console.log(JSON.stringify({status:result.status,briefs:result.briefs.length,output:resolve(out)}));
 }else{
  const result=build(data.manifest,data.pages);output(out,result,cmd);
  console.log(JSON.stringify({status:result.status,qualityGate:result.qualityGate,files:result.files.length,publicationCount:0,output:resolve(out)}));
 }
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){main().catch(e=>{console.error('ASTRA_BULKER_FAIL',e.message);process.exitCode=1});}
