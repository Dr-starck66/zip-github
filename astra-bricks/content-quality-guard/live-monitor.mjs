#!/usr/bin/env node
/**
 * ASTRA CONTENT QUALITY GUARD Ω: cross-platform PUBLIC monitoring.
 * Audits what visitors see, not source code. Never mutates pages, DNS or APIs.
 * It is an AUDIT, not a publishing lock on third-party CMSs.
 */
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
const root=path.dirname(fileURLToPath(import.meta.url));
const config=JSON.parse(readFileSync(process.argv[2]||path.join(root,"portfolio-sites.json"),"utf8"));
const forbidden=[
 /reconstrucci[oó]n seo con un est[aá]ndar m[ií]nimo/iu,
 /qu[eé] informaci[oó]n cambia y qu[eé] debe permanecer estable/iu,
 /c[oó]mo verificamos proyectos, cifras y declaraciones/iu,
 /por qu[eé] esta p[aá]gina importa dentro del cibao/iu,
 /c[oó]mo usar esta gu[ií]a como punto de entrada/iu,
 /intenci[oó]n de b[uú]squeda.{0,60}densidad/iu,
 /reconstruction seo avec un niveau de qualit[eé]/iu,
 /comment nous v[eé]rifions les projets, les chiffres/iu,
 /que recherche un lecteur et comment la r[eé]ponse est-elle organis[eé]e/iu,
 /how to use this guide as a starting point/iu,
 /keyword density.{0,90}organic traffic/iu
];
function decodeHtml(s){return String(s).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(+n,0x10ffff)))
 .replace(/&(?:amp|quot|apos|nbsp|lt|gt);/gi," ").replace(/\s+/g," ");}
const norm=s=>decodeHtml(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
export function inspect(html,url){
 const main=html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]||html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]||html;
 const withoutScripts=main.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ");
 const text=decodeHtml(withoutScripts.replace(/<[^>]+>/g," "));
 const h1=[...withoutScripts.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(x=>decodeHtml(x[1].replace(/<[^>]+>/g," ")));
 const h2=[...withoutScripts.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map(x=>decodeHtml(x[1].replace(/<[^>]+>/g," ")));
 const findings=[];
 for(const term of forbidden)if(term.test(text)||h2.some(h=>term.test(h)))findings.push({code:"GENERIC_EDITORIAL_FILLER",match:String(term)});
 const headings={};
 for(const h of h2){const n=norm(h);if(n.length<12)continue;headings[n]=(headings[n]||0)+1}
 for(const [k,v] of Object.entries(headings))if(v>=3)findings.push({code:"DUPLICATE_H2_ON_PAGE",heading:k,count:v});
 // No artificial minimum applied to homepages or compact info pages.
 const robots=html.match(/<meta\s+name=["']robots["']\s+content=["']([^"']+)/i)?.[1]||"unknown";
 return {url,status:findings.length?"FAIL":"PASS",h1Count:h1.length,h2Count:h2.length,words:text.split(/\s+/).length,robots,findings,headings:h2.map(norm)};
}
async function get(url){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),12000);
 try{
  const r=await fetch(url,{signal:controller.signal,headers:{"User-Agent":"ASTRA-Content-Quality-Audit/1.0 (read-only, +https://github.com/Dr-starck66/zip-github)"},redirect:"follow"});
  if(r.status!==200)return {url,status:"UNVERIFIED",http:r.status,reason:"not HTTP 200"};
  const mime=r.headers.get("content-type")||"";
  if(!mime.includes("text/html"))return {url,status:"UNVERIFIED",http:r.status,reason:"not HTML",mime};
  const body=await r.text();
  if(body.length>1800000)return {url,status:"UNVERIFIED",http:r.status,reason:"page too large"};
  const record=inspect(body,url);return {...record,http:r.status};
 }catch(err){return {url,status:"UNVERIFIED",reason:String(err).slice(0,150)}}
 finally{clearTimeout(timer)}
}
export async function monitor(cfg=config){
 if(cfg.schema!=="astra-content-portfolio/v1"||!Array.isArray(cfg.sites)||cfg.sites.length===0||cfg.sites.some(s=>!Array.isArray(s.checks)||!s.checks.length))throw Error("INVALID_PORTFOLIO_MANIFEST");
 const results=[];
 for(const site of cfg.sites){
  const pages=[];
  for(const url of site.checks||[])pages.push(await get(url));
  // Cross-page duplicated section titles are a true warning, not an excuse
  // to mass-noindex legacy pages or claim all copied prose has been found.
  const names=new Map();
  for(const p of pages)for(const name of new Set(p.headings||[]))
   if(name.length>=24)names.set(name,(names.get(name)||0)+1);
  const duplicated=[...names.entries()].filter(([_,n])=>n>=3).map(([heading,count])=>({heading,count}));
  if(duplicated.length)for(const p of pages){
   if(p.status==="PASS"&&p.headings?.some(h=>duplicated.some(q=>q.heading===h))){
    p.status="FAIL";p.findings.push({code:"CROSS_PAGE_TEMPLATE_HEADINGS",headings:duplicated});
   }
  }
  results.push({id:site.id,type:site.type,checks:pages.length,
    pass:pages.filter(x=>x.status==="PASS").length,
    fail:pages.filter(x=>x.status==="FAIL").length,
    unverified:pages.filter(x=>x.status==="UNVERIFIED").length,
    pages:pages.map(({headings,...safe})=>safe)});
 }
 const all=results.flatMap(x=>x.pages);
 return {schema:"astra-content-live-audit/v1",generatedAt:new Date().toISOString(),
  status:all.some(x=>x.status==="FAIL")?"PARTIAL_LEGACY_QUALITY_FAIL":all.some(x=>x.status==="UNVERIFIED")?"PARTIAL_UNVERIFIED":"PASS_OBSERVED_PAGES_ONLY",
  totalSites:results.length,checkedUrls:all.length,pass:all.filter(x=>x.status==="PASS").length,
  fail:all.filter(x=>x.status==="FAIL").length,unverified:all.filter(x=>x.status==="UNVERIFIED").length,
  scope:"public-read-only; not a CMS prepublication integration",results};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 const r=await monitor();
 const output=process.env.ASTRA_CONTENT_MONITOR_OUTPUT||"";
 if(output){mkdirSync(path.dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(r,null,2)+"\n")}
 console.log("ASTRA_PORTFOLIO_CONTENT_AUDIT",JSON.stringify({status:r.status,totalSites:r.totalSites,checkedUrls:r.checkedUrls,pass:r.pass,fail:r.fail,unverified:r.unverified}));
 for(const site of r.results)console.log("ASTRA_PORTFOLIO_SITE",JSON.stringify({
  id:site.id,pass:site.pass,fail:site.fail,unverified:site.unverified,
  problemPages:site.pages.filter(x=>x.status!=="PASS").map(x=>({url:x.url,status:x.status,codes:(x.findings||[]).map(x=>x.code),reason:x.reason||null}))}));
}
