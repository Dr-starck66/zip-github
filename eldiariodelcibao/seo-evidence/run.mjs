import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { reportForKeywords } from "./engine.mjs";

const folder = dirname(fileURLToPath(import.meta.url));
const now = new Date().toISOString();
const errors = [];
const keywords = JSON.parse(readFileSync(join(folder,"keywords.json"),"utf8"));
function readOptional(file) {
 const p=join(folder,"input",file);
 if(!existsSync(p))return null;
 try{return JSON.parse(readFileSync(p,"utf8"))}catch(e){errors.push(file+": invalid JSON");return null}
}
function ymd(d){return d.toISOString().slice(0,10)}
function before(days){return ymd(new Date(Date.now()-days*86400000))}
async function post(url,headers,body) {
 const controller = new AbortController();
 const timer=setTimeout(()=>controller.abort(),12000);
 try {
  const res=await fetch(url,{method:"POST",headers:{"content-type":"application/json",...headers},body:JSON.stringify(body),signal:controller.signal});
  if(!res.ok)throw new Error("HTTP "+res.status);
  return await res.json();
 }finally{clearTimeout(timer)}
}
async function officialAds(){
 const {GOOGLE_ADS_ACCESS_TOKEN:access,GOOGLE_ADS_DEVELOPER_TOKEN:developer,GOOGLE_ADS_CUSTOMER_ID:customer,GOOGLE_ADS_LOGIN_CUSTOMER_ID:login}=process.env;
 if(!access||!developer||!customer){errors.push("Google Ads official metrics not configured: need OAuth token, developer token and customer ID");return null}
 const id=String(customer).replace(/-/g,"");
 const headers={"authorization":"Bearer "+access,"developer-token":developer};
 if(login)headers["login-customer-id"]=String(login).replace(/-/g,"");
 const body={customerId:id,keywords:keywords.map(k=>k.keyword),language:"languageConstants/1003",geoTargetConstants:["geoTargetConstants/2214"],keywordPlanNetwork:"GOOGLE_SEARCH"};
 const json=await post("https://googleads.googleapis.com/v24/customers/"+id+":generateKeywordHistoricalMetrics",headers,body);
 if(!Array.isArray(json.results))throw new Error("Google Ads response missing results");
 return {source:"Google Ads KeywordPlanIdeaService.GenerateKeywordHistoricalMetrics",geo:"DO",language:"es",network:"GOOGLE_SEARCH",capturedAt:now,period:"previous twelve months",results:json.results};
}
async function officialGsc(){
 const token=process.env.GSC_ACCESS_TOKEN;
 if(!token){errors.push("GSC not configured: no OAuth access token");return null}
 const site=process.env.GSC_SITE_URL||"sc-domain:eldiariodelcibao.com";
 if(!["sc-domain:eldiariodelcibao.com","https://eldiariodelcibao.com/"].includes(site))throw new Error("GSC_SITE_URL must refer to eldiariodelcibao.com");
 const startDate=before(31),endDate=before(3);
 const body={startDate,endDate,dimensions:["query"],type:"web",rowLimit:25000,dimensionFilterGroups:[{groupType:"and",filters:[{dimension:"country",operator:"equals",expression:"dom"}]}]};
 const json=await post("https://www.googleapis.com/webmasters/v3/sites/"+encodeURIComponent(site)+"/searchAnalytics/query",{authorization:"Bearer "+token},body);
 if(!Array.isArray(json.rows))return {property:site,country:"DOM",searchType:"web",capturedAt:now,startDate,endDate,rows:[]};
 return {property:site,country:"DOM",searchType:"web",capturedAt:now,startDate,endDate,rows:json.rows.map(r=>({query:r.keys?.[0],clicks:r.clicks,impressions:r.impressions,position:r.position}))};
}
let ads=readOptional("google-ads.json");
let gsc=readOptional("gsc.json");
const serp=readOptional("serp.json");
if(process.argv.includes("--fetch-official")){
 try{ads=(await officialAds())||ads}catch(e){errors.push("Google Ads fetch: "+e.message)}
 try{gsc=(await officialGsc())||gsc}catch(e){errors.push("GSC fetch: "+e.message)}
}
const report=reportForKeywords({keywords,ads,gsc,serp,now});
report.connectorNotes=errors;
const out=join(folder,"reports");mkdirSync(out,{recursive:true});
writeFileSync(join(out,"keyword-evidence.json"),JSON.stringify(report,null,2)+"\n");
const quote=x=>'"'+String(x??"").replaceAll('"','""')+'"';
const csv=[["keyword","url","google_monthly_searches_DO","google_volume_status","google_ads_competition_index_NOT_SEO_KD","gsc_site_impressions_DOM_28d","serp_proxy_NOT_SEO_KD","serp_status","evidence_gate"].map(quote).join(",")];
for(const r of report.rows)csv.push([r.keyword,r.url,r.volume.avgMonthlySearches,r.volume.status,r.volume.competitionIndexAds,r.gsc.siteImpressions,r.difficulty.proxyScore,r.difficulty.status,r.evidenceGate].map(quote).join(","));
writeFileSync(join(out,"keyword-evidence.csv"),csv.join("\n")+"\n");
const doc=[
"# ASTRA Keyword Evidence Ω — República Dominicana",
"",
"Generated: "+report.generatedAt,
"Site: "+report.domain+" | geography: DO | language: es",
"",
"**Proof status:** "+(report.summary.unverified?"UNVERIFIED for "+report.summary.unverified+" queries":"No missing queries")+
" — evidence is never fabricated.",
"",
"| Keyword | Google searches/mo (Ads, DO) | GSC site impressions | SERP structure proxy | Gate |",
"|---|---:|---:|---:|---|",
...report.rows.map(r=>"| "+r.keyword.replaceAll("|","/")+" | "+(r.volume.avgMonthlySearches??"UNVERIFIED")+" | "+(r.gsc.siteImpressions??"UNVERIFIED")+" | "+(r.difficulty.proxyScore??"UNVERIFIED")+" | "+r.evidenceGate+" |"),
"",
"**Important:** Google Ads competition is advertising competition, not SEO difficulty. SERP structure proxy is NOT Semrush/Ahrefs KD. GSC impressions concern this site only, not overall Google keyword demand.",
"",
"Google Ads metrics require preexisting eligible API credentials; no paid SEO subscription is used. The tool never buys ads, creates campaigns or spends money.",
"",
"Connector notes:",...errors.map(s=>"- "+s),""
].join("\n");
writeFileSync(join(out,"keyword-evidence.md"),doc);
process.stdout.write(JSON.stringify({output:out,total:report.totalKeywords,summary:report.summary,notes:errors})+"\n");
