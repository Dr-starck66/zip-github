import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function slugify(s=''){
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90);
}
export function wordCount(html=''){
  return String(html).replace(/<[^>]*>/g,' ').replace(/&[^;]+;/g,' ')
    .trim().split(/\s+/).filter(Boolean).length;
}
export function isHttpUrl(v=''){
  try{const u=new URL(v);return u.protocol==='http:'||u.protocol==='https:'}catch{return false}
}
export function preflight(packet,site){
  const mode=packet.mode==='PILIER SEO'?'pillar':'reactive';
  const minWords=Number(site.quality?.minWords?.[mode] ?? (mode==='pillar'?1500:500));
  const maxWords=Number(site.quality?.maxWords?.[mode] ?? (mode==='pillar'?3000:1200));
  const wc=wordCount(packet.bodyHtml||packet.body||'');
  const sources=(packet.sources||[]).filter(x=>isHttpUrl(typeof x==='string'?x:x.url));
  const checks={
    siteMatch: packet.siteId===site.id,
    title: String(packet.title||'').trim().length>=25 && String(packet.title||'').trim().length<=110,
    bodyMin: wc>=minWords,
    bodyMax: wc<=Math.max(maxWords, minWords),
    sources: sources.length>=Number(site.quality?.minSources??2),
    canonical: isHttpUrl(packet.canonical||''),
    image: isHttpUrl(packet.image?.url||'') && Number(packet.image?.width||0)>=1200,
    imageAlt: String(packet.image?.alt||'').trim().length>=20,
    schema: ['Article','NewsArticle'].includes(packet.schemaType),
    author: String(packet.author?.name||'').trim().length>=2,
    evidence: ['CONFIRMED NEWS','NEWS + TREND SIGNAL'].includes(packet.evidence),
    discoverClaimSafe: packet.confirmedDiscover!==true,
    originality: packet.originality?.duplicateRisk!=='high',
    sourceTraceability: (packet.sources||[]).every(s=>typeof s==='string'||(s.title&&s.url))
  };
  const blocking=Object.entries(checks).filter(([,v])=>!v).map(([k])=>k);
  return {
    ok:blocking.length===0,
    checks, blocking, wordCount:wc, minWords, maxWords,
    recommendedStatus:blocking.length?'draft':(site.autoPublishWhenGreen?'publish':'draft')
  };
}
export function buildWordPressPayload(packet,status='draft'){
  return {
    title:packet.title,
    content:packet.bodyHtml||packet.body,
    status,
    slug:packet.slug||slugify(packet.title),
    excerpt:packet.excerpt||'',
    meta:{
      astra_evidence:packet.evidence,
      astra_opportunity_score:String(packet.opportunityScore??''),
      astra_discover_signal:String(packet.discoverSignal??''),
      astra_source_count:String((packet.sources||[]).length)
    }
  };
}
export function buildWebhookPayload(packet,preflightResult){
  return {
    type:'astra.autopublish.v1',
    createdAt:new Date().toISOString(),
    siteId:packet.siteId,
    preflight:preflightResult,
    publication:{
      ...packet,
      slug:packet.slug||slugify(packet.title),
      status:preflightResult.recommendedStatus
    }
  };
}
function envPrefix(siteId){return 'ASTRA_'+siteId.toUpperCase().replace(/[^A-Z0-9]+/g,'_')}
async function publishWordPress(packet,site,pf){
  const p=envPrefix(site.id),base=process.env[p+'_WP_BASE'],user=process.env[p+'_WP_USER'],pass=process.env[p+'_WP_APP_PASSWORD'];
  if(!base||!user||!pass)return {ok:false,state:'BLOCKED',reason:'wordpress_credentials_missing'};
  const endpoint=base.replace(/\/$/,'')+'/wp-json/wp/v2/posts';
  const auth=Buffer.from(user+':'+pass).toString('base64');
  const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json','authorization':'Basic '+auth},body:JSON.stringify(buildWordPressPayload(packet,pf.recommendedStatus))});
  const txt=await r.text();let data={};try{data=JSON.parse(txt)}catch{}
  if(!r.ok)return {ok:false,state:'FAILED',status:r.status,reason:data.message||txt.slice(0,300)};
  return {ok:true,state:pf.recommendedStatus==='publish'?'PUBLISHED':'DRAFTED',id:data.id||null,url:data.link||null,status:data.status||pf.recommendedStatus};
}
async function publishWebhook(packet,site,pf){
  const p=envPrefix(site.id),url=process.env[p+'_WEBHOOK_URL'],token=process.env[p+'_WEBHOOK_TOKEN'];
  if(!url)return {ok:false,state:'BLOCKED',reason:'webhook_url_missing'};
  const headers={'content-type':'application/json'};if(token)headers.authorization='Bearer '+token;
  const r=await fetch(url,{method:'POST',headers,body:JSON.stringify(buildWebhookPayload(packet,pf))});
  const txt=await r.text();let data={};try{data=JSON.parse(txt)}catch{}
  if(!r.ok)return {ok:false,state:'FAILED',status:r.status,reason:data.error||txt.slice(0,300)};
  return {ok:true,state:data.state||pf.recommendedStatus.toUpperCase(),url:data.url||null,id:data.id||null,raw:data};
}
export async function publishPacket(packet,site,{send=false}={}){
  const pf=preflight(packet,site);
  if(!pf.ok)return {ok:false,state:'BLOCKED_BY_PREFLIGHT',preflight:pf};
  if(!send)return {ok:true,state:'READY',preflight:pf,payload:site.adapter==='wordpress'?buildWordPressPayload(packet,pf.recommendedStatus):buildWebhookPayload(packet,pf)};
  if(site.configured!==true)return {ok:false,state:'BLOCKED',reason:'site_adapter_not_configured',preflight:pf};
  if(site.adapter==='wordpress')return {...await publishWordPress(packet,site,pf),preflight:pf};
  if(site.adapter==='webhook')return {...await publishWebhook(packet,site,pf),preflight:pf};
  return {ok:false,state:'BLOCKED',reason:'adapter_not_configured',preflight:pf};
}
export function appendLedger(entry,file='autopublish/publication-ledger.jsonl'){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.appendFileSync(file,JSON.stringify({...entry,loggedAt:new Date().toISOString()})+'\n');
}
async function main(){
  const args=process.argv.slice(2),input=args.find(x=>x.endsWith('.json'))||'autopublish/example.packet.json',send=args.includes('--send');
  const sites=JSON.parse(fs.readFileSync('autopublish/sites.json','utf8'));
  const packet=JSON.parse(fs.readFileSync(input,'utf8'));
  const site=sites.sites.find(x=>x.id===packet.siteId);
  if(!site)throw new Error('Unknown siteId: '+packet.siteId);
  const result=await publishPacket(packet,site,{send});
  appendLedger({siteId:packet.siteId,title:packet.title,result});
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.stack||e);process.exit(1)});
