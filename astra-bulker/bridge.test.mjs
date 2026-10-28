import test from 'node:test';
import assert from 'node:assert/strict';
import {safeLocalModelUrl,verifyResearch,draftWithExistingModel} from './generator.mjs';
import {NATIVE_SITES,routeFor,nativeHandoff} from './native-handoff.mjs';
const snapshot={sites:Object.fromEntries(Object.entries(NATIVE_SITES).map(([host,x])=>[host,{...x,repo:x.repo,branch:x.branch,kind:x.kind,language:x.lang,sourceAdapterVerified:true}]))};
const manifest=(host)=>({schema:'astra-bulker/1',site:{domain:'https://'+host+'/',language:NATIVE_SITES[host].lang,pathPrefix:NATIVE_SITES[host].prefix.replace(/^\/+|\/+$/g,'')},topics:[]});
const brief={path:'/news/editorial-test/',title:'A detailed editorial article about robots and accountability',language:'en',keyword:'robot accountability',angle:'documented research',questions:['What are the sources?']};
const sources=[1,2,3].map(i=>({url:`https://publisher-${i}.example/news/${i}`,title:`Publisher ${i}`,locator:`paragraph ${i}`,excerpt:`This official research record documents significant changes in robot safety and traceable results for assessment ${i}. `.repeat(6),fetchedAt:'2026-10-28',verifiedBy:'ASTRA-CRAWL-PROOF-DECLARED'}));
test('existing local endpoint accepted without ever selecting a paid API',()=>{
 assert.equal(safeLocalModelUrl('http://127.0.0.1:8080/v1'),'http://127.0.0.1:8080/v1/chat/completions');
 assert.equal(safeLocalModelUrl('https://astra-model.railway.internal/v1'),'https://astra-model.railway.internal/v1/chat/completions');
 assert.throws(()=>safeLocalModelUrl('https://api.openai.com/v1'),/MODEL_NOT_APPROVED_ZERO_COST_LOCAL/);
 assert.throws(()=>safeLocalModelUrl('https://api.openrouter.ai/v1'),/MODEL_NOT_APPROVED_ZERO_COST_LOCAL/);
 assert.throws(()=>safeLocalModelUrl('https://evil.com/v1'),/MODEL_NOT_APPROVED_ZERO_COST_LOCAL/);
});
test('reject unverified or correlated sources and never generate from absent evidence',()=>{
 assert.throws(()=>verifyResearch(brief,sources.slice(0,2)),/THREE_VERIFIED_SOURCES_REQUIRED/);
 assert.throws(()=>verifyResearch(brief,sources.map(s=>({...s,url:'https://same.example/'+s.locator}))),/THREE_INDEPENDENT_SOURCE_HOSTS_REQUIRED/);
 assert.throws(()=>verifyResearch(brief,sources.map(s=>({...s,verifiedBy:''}))),/THREE_VERIFIED_SOURCES_REQUIRED/);
});
test('no model endpoint => no draft, no fallback to paid API',async()=>{
 await assert.rejects(draftWithExistingModel(brief,sources,{base:'',fetchFn:async()=>{throw Error('network must not be called')}}),/Invalid URL/);
});
test('model insufficient evidence fails without publishing',async()=>{
 let calls=0;
 await assert.rejects(draftWithExistingModel(brief,sources,{base:'http://localhost:8080/v1',fetchFn:async()=>{calls++;return {ok:true,json:async()=>({choices:[{message:{content:'{"insufficient_evidence":true}'},finish_reason:'stop'}]})}}}),/MODEL_INSUFFICIENT_EVIDENCE/);
 assert.equal(calls,1);
});
test('model cannot return invented source or review, even if API says 200',async()=>{
 let n=0;
 await assert.rejects(draftWithExistingModel(brief,sources,{base:'http://localhost:8080/v1',fetchFn:async()=>{
  n++;return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({heading:'Unique heading for source',paragraphs:['A long enough sentence explaining source comparisons and the difference between reports.','Another long enough sentence explaining traceability evidence and material limitations.'],evidence:[{claim:'a long enough sentence explaining',sourceUrl:'https://fake.invalid/1',sourceLocator:'fake'}]})}}]})};
 }}),/MODEL_CLAIM_SOURCE_NOT_IN_RESEARCH/);
 assert.equal(n,1);
});
test('four native routes match precisely, fifth without adapter is explicitly blocked',()=>{
 for(const host of Object.keys(NATIVE_SITES))assert.equal(routeFor(manifest(host),snapshot).kind,NATIVE_SITES[host].kind);
 assert.throws(()=>routeFor({schema:'astra-bulker/1',site:{domain:'https://avocat-belgique.com/',language:'fr',pathPrefix:'guides'}},snapshot),/NATIVE_ADAPTER_NOT_REGISTERED/);
});
test('route drift, language mismatch and wrong paths fail before touching source',()=>{
 const clone=structuredClone(snapshot);clone.sites['betgpt.live'].branch='wrong';
 assert.throws(()=>routeFor(manifest('betgpt.live'),clone),/NATIVE_ADAPTER_SOURCE_DRIFT/);
 const fr=manifest('betgpt.live');fr.site.language='en';assert.throws(()=>routeFor(fr,snapshot),/NATIVE_LANGUAGE_CONFLICT/);
 const wrong=manifest('betgpt.live');wrong.site.pathPrefix='blog';assert.throws(()=>routeFor(wrong,snapshot),/NATIVE_ROUTE_PREFIX_MISMATCH/);
});
test('unreviewed content and missing image cannot escape via native handoff',()=>{
 const m=manifest('gamicnews.com');m.topics=[{keyword:'original robot news',title:'A researched report on original robot news',cluster:'tech'}];
 assert.throws(()=>nativeHandoff({manifest:m,pages:[{path:'/news/original-robot-news/',review:{approved:false}}],routeSnapshot:snapshot}),/ANSWER_FIRST_MISSING/);
});
test('FreeHotels nested native path is preserved in canonical by existing BULKER planner',async()=>{
 const {plan}=await import('./bulker.mjs');
 const m=manifest('freehotels.info');m.topics=[{keyword:'holiday policy 2026',title:'Holiday policies and traveler rights explained',cluster:'hospitality'}];
 assert.equal(plan(m).briefs[0].path,'/news/en/holiday-policy-2026/');
 assert.equal(plan(m).briefs[0].canonical,'https://freehotels.info/news/en/holiday-policy-2026/');
});
test('Belgian legal publisher gets nine original sections plus introduction, but NEVER a forged approval',async()=>{
 const legalBrief={...brief,canonical:'https://avocat-belgique.com/blog/registre-dossier-juridique/',path:'/blog/registre-dossier-juridique/',language:'fr'};
 let calls=0;
 const intro='Le lecteur vérifie auprès de l’institution belge les documents nécessaires avant la consultation juridique afin de distinguer une règle officielle d’une hypothèse. '.repeat(9);
 const mock=async(_url,opt)=>{
  calls++;
  const payload=JSON.parse(opt.body);
  assert.ok(payload.messages[1].content.includes('section '+calls+'/9'));
  const claim='Donnée institutionnelle vérifiable numéro '+calls+' identifiée grâce aux trois sources publiques.';
  const prose=claim+' Cette analyse décrit les pièces utiles, les limites et les vérifications spécifiques à effectuer en Belgique avec les références institutionnelles obtenues. '.repeat(6);
  const json={heading:'Étape légale documentée spécifique '+calls,paragraphs:[prose,prose+' Vérification complémentaire '+calls+'.'],evidence:[{claim,sourceUrl:sources[0].url,sourceLocator:sources[0].locator}],...(calls===1?{introParagraphs:[intro]}:{})};
  return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(json)}}]})};
 };
 const draft=await draftWithExistingModel(legalBrief,sources,{base:'http://localhost:8080/v1',fetchFn:mock});
 assert.equal(calls,9);
 assert.equal(draft.page.sections.length,9);
 assert.equal(draft.page.introParagraphs.length,1);
 assert.ok(draft.page.sources.every(s=>s.checkedAt==='2026-10-28'));
 assert.equal(draft.page.review.approved,false);
 assert.equal(draft.publicationCount,0);
});
