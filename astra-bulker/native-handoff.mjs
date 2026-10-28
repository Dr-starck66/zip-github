/** ASTRA BULKER Ω -> existing ASTRA ZERO-RICH native-run adapter, no source mutation. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {build} from './bulker.mjs';
const requireThat=(value,reason)=>{if(!value)throw Error(reason)};
export const NATIVE_SITES=Object.freeze({
 'gamicnews.com':{repo:'Dr-starck66/indexation',branch:'main',kind:'gamic-json-overlay',prefix:'/news/',lang:'en',promotion:'RAILWAY_SOURCE_READBACK'},
 'betgpt.live':{repo:'Dr-starck66/betgpt-railway',branch:'main',kind:'betgpt-manual-editorial',prefix:'/actualites/',lang:'fr',promotion:'IMMUTABLE_GREEN_REQUIRED'},
 'freehotels.info':{repo:'Dr-starck66/freehotels-grok-live',branch:'main',kind:'freehotels-discover-json',prefix:'/news/en/',lang:'en',promotion:'RAILWAY_SOURCE_READBACK'},
 'bizarresexuality.com':{repo:'Dr-starck66/indexation',branch:'bizarresexuality-deploy-root',kind:'bizarre-static-news',prefix:'/news/',lang:'en',promotion:'RAILWAY_SOURCE_READBACK'}
});
const normalizedHost=origin=>new URL(origin).hostname.replace(/^www\./,'').toLowerCase();
const isLocalImage=p=>/^\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.(?:png|jpe?g|webp)$/i.test(p||'');
const words=x=>String(x||'').trim().split(/\s+/).filter(Boolean).length;
/** Compare against the existing native-routes snapshot; deny drift, do not invent an adapter. */
export function routeFor(manifest, routeSnapshot) {
 requireThat(manifest?.schema==='astra-bulker/1','BULKER_MANIFEST_INVALID');
 const origin=manifest.site?.domain,host=normalizedHost(origin),def=NATIVE_SITES[host];
 requireThat(def,'NATIVE_ADAPTER_NOT_REGISTERED_'+host);
 requireThat(manifest.site.language===def.lang,'NATIVE_LANGUAGE_CONFLICT');
 const route=routeSnapshot?.sites?.[host];
 requireThat(route&&route.repo===def.repo&&route.branch===def.branch&&route.kind===def.kind&&route.language===def.lang&&route.sourceAdapterVerified===true,'NATIVE_ADAPTER_SOURCE_DRIFT');
 const expectedPrefix='/'+String(manifest.site.pathPrefix||'').replace(/^\/+|\/+$/g,'')+'/';
 requireThat(expectedPrefix===def.prefix,'NATIVE_ROUTE_PREFIX_MISMATCH');
 return {host,...def};
}
/** All content must first pass the original content guard in build(). */
export function nativeHandoff({manifest,pages,routeSnapshot}) {
 const target=routeFor(manifest,routeSnapshot);
 requireThat(Array.isArray(pages)&&pages.length>0&&pages.length<=100,'NATIVE_BATCH_SIZE_INVALID');
 for(const p of pages){
  requireThat(typeof p.answer==='string'&&words(p.answer)>=30&&words(p.answer)<=95,'ANSWER_FIRST_MISSING');
  requireThat(Array.isArray(p.introParagraphs)&&p.introParagraphs.length>0&&p.introParagraphs.every(q=>String(q).length>45),'NATIVE_INTRO_MISSING');
  requireThat(p.sections?.length>=6&&p.sections.every(s=>s.paragraphs?.length>=2&&s.paragraphs.every(q=>String(q).length>45)),'NATIVE_SECTION_SUBSTANCE_MISSING');
  requireThat(p.image&&isLocalImage(p.image.src)&&p.image.width>=1200&&p.image.height>=600&&p.image.alt?.length>=30&&p.image.rightsEvidence&&p.image.license,'NATIVE_LICENSED_IMAGE_MISSING');
  const expectedImageUrl=new URL(p.image.src,manifest.site.domain).href;
  requireThat(p.image.url===expectedImageUrl,'IMAGE_ORIGIN_MISMATCH');
  if(target.host==='betgpt.live') {
   const ratio=p.image.width/p.image.height;
   requireThat(ratio>=1.45&&ratio<=2.05,'BETGPT_DISCOVER_IMAGE_FORMAT');
  }
  requireThat(p.publishedAt&&Number.isFinite(Date.parse(p.publishedAt)),'NATIVE_PUBLICATION_DATE_MISSING');
  requireThat(p.review?.approved===true&&p.review?.factualSpotcheck===true&&p.review?.reviewer&&p.review?.date,'REVIEW_REQUIRED');
 }
 const bundle=build(manifest,pages);
 requireThat(bundle.status==='BUILT_NOT_DEPLOYED'&&bundle.qualityGate==='PASS_LOCAL_STRUCTURE_ONLY','ASTRA_ORIGINAL_GUARD_NOT_GREEN');
 const drafts=pages.map((p,i)=>{
  const slug=p.path.slice(target.prefix.length).replace(/\/$/,'');
  requireThat(p.path===target.prefix+slug+'/'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug),'NATIVE_URL_MISMATCH');
  const nativeUrl=target.host==='freehotels.info'?`https://${target.host}${p.path}`:`https://${target.host==='bizarresexuality.com'?'www.':''}${target.host}${target.prefix}${slug}`;
  const expected=bundle.files[i];
  requireThat(expected.path===p.path,'BULKER_BUILD_ORDER_DRIFT');
  return {host:target.host,slug,keyword:manifest.topics[i].keyword,language:target.lang,title:p.title,
   description:p.description,answer:p.answer,body:p.introParagraphs,sections:p.sections,
   sources:p.sources.map(s=>s.url),image:{src:p.image.src,width:p.image.width,height:p.image.height,alt:p.image.alt,rightsEvidence:p.image.rightsEvidence},
   publishedAt:p.publishedAt,
   astraBulkerProvenance:{generator:p.generation||null,reviewer:p.review.reviewer,reviewDate:p.review.date,qualityGate:bundle.qualityGate,contentSha256:expected.sha256,sourceEvidence:p.evidence,reviewIsIndependent:'UNVERIFIED'},
   _handoff:{canonical:nativeUrl,sourceRepo:target.repo,sourceBranch:target.branch,promotion:target.promotion}};
 });
 return {schema:'astra-bulker-native-handoff/1',status:'ADAPTER_INPUT_READY_NOT_PUBLISHED',site:target.host,
  nativeAdapter:target.kind,repository:target.repo,promotion:target.promotion,quality:bundle.qualityGate,
  editorialReview:'DECLARED_NOT_INDEPENDENTLY_VERIFIED',sourceVerification:'REQUIRES_EXISTING_NATIVE_RUN_PREFLIGHT',
  publicReadback:'UNVERIFIED',publicationCount:0,drafts};
}
async function main(){
 const [inputPath,routesPath,outputDir]=process.argv.slice(2);
 requireThat(inputPath&&routesPath&&outputDir,'USAGE: node astra-bulker/native-handoff.mjs reviewed-input.json native-routes.json output-dir');
 const source=JSON.parse(readFileSync(inputPath,'utf8'));
 const routes=JSON.parse(readFileSync(routesPath,'utf8'));
 const result=nativeHandoff({manifest:source.manifest,pages:source.pages,routeSnapshot:routes});
 const dir=resolve(outputDir);mkdirSync(dir,{recursive:true});
 for(const row of result.drafts){
  const { _handoff,...native }=row;
  // Native runner ignores _handoff; it is deliberately kept out of its input JSON.
  const file=resolve(dir,row.slug+'.json');requireThat(file.startsWith(dir+'/'),'OUTPUT_PATH_ESCAPE');
  writeFileSync(file,JSON.stringify(native,null,2)+'\n',{flag:'wx'});
 }
 writeFileSync(resolve(dir,'handoff-receipt.json'),JSON.stringify({...result,drafts:result.drafts.map(({_handoff,astraBulkerProvenance,...a})=>({canonical:_handoff.canonical,slug:a.slug,contentSha256:astraBulkerProvenance.contentSha256}))},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({status:result.status,site:result.site,count:result.drafts.length,outputDir:dir,publicationCount:0}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{console.error('ASTRA_BULKER_NATIVE_BLOCKED',e.message);process.exitCode=1});
