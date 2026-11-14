#!/usr/bin/env node
/* ASTRA ZERO-BOILERPLATE LOCAL GUIDE GUARD Ω
   Reject filler and SEO self-reference in rewritten content.
   Report untouched legacy pages separately; no dangerous site-wide noindex. */
import fs from "node:fs";
const data=JSON.parse(fs.readFileSync(new URL("../data/content.json",import.meta.url),"utf8"));
const entries=data.pages||[];
const protectedPaths=["/constanza/"];
const forbidden=[
 /reconstrucci[oó]n seo/i,/estrategia seo/i,/palabras clave/i,
 /qu[eé] busca un lector/i,/c[oó]mo verificamos proyectos/i,
 /c[oó]mo usar esta gu[ií]a como punto de entrada/i,
 /intenci[oó]n de b[uú]squeda/i,/densidad del contenido/i,
 /autoridad entre los contenidos/i,/se posiciona en google/i,
 /nuestra metodolog[ií]a editorial/i,/qu[eé] informaci[oó]n cambia y qu[eé] debe permanecer/i
];
const count=x=>String(x||"").trim().split(/\s+/).filter(Boolean).length;
const headings=entries.flatMap(p=>(p.sections||[]).map(s=>({path:p.p,title:s[0]})));
const histogram=new Map();
for(const h of headings)histogram.set(h.title,(histogram.get(h.title)||0)+1);
const reused=[...histogram.entries()].filter(([k,n])=>n>=5).sort((a,b)=>b[1]-a[1]);
const legacy=entries.filter(p=>!protectedPaths.includes(p.p)&&
 (p.sections||[]).some(s=>histogram.get(s[0])>=5)).map(p=>p.p);
const proofs=[];
for(const route of protectedPaths){
 const x=entries.find(y=>y.p===route);
 if(!x)throw Error("MISSING_GUIDE "+route);
 const body=[...(x.b||[]),...(x.sections||[]).flatMap(s=>[s[0],...(s[1]||[])])].join(" ");
 const problems=forbidden.filter(r=>r.test(body)).map(r=>String(r));
 const genericHeaders=(x.sections||[]).filter(s=>(histogram.get(s[0])||0)>=5).map(s=>s[0]);
 const words=count(body);
 const urls=(x.sources||[]).map(r=>r[1]);
 const official=urls.filter(u=>/^https:\/\/(?:es\.)?(?:godominicanrepublic\.com|agricultura\.gob\.do|ambiente\.gob\.do|presidencia\.gob\.do|ayuntamientoconstanza\.gob\.do)\//.test(u));
 const ok=words>=1500&&x.sections.length>=9&&x.sources.length>=8&&official.length>=7&&problems.length===0&&genericHeaders.length===0&&x.related.length>=5;
 proofs.push({path:route,pass:ok,words,sections:x.sections.length,sources:urls.length,primarySources:official.length,links:x.related.length,forbidden:problems,genericHeaders});
}
const status=proofs.every(p=>p.pass)?"PASS":"FAIL";
console.log("ASTRA_LOCAL_GUIDE_GATE",JSON.stringify({status,proofs,legacyReusedHeadingCount:reused.length,otherPagesStillUsingBoilerplate:legacy.length,legacyExamples:legacy.slice(0,12),mostRepeatedHeadings:reused.slice(0,5)}));
if(status!=="PASS")process.exitCode=1;
