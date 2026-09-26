import type { Config, Context } from "@netlify/functions";
import { getStore, getDeployStore } from "@netlify/blobs";
import { createHash, randomUUID } from "node:crypto";

const POLICIES={
  strict:{id:"strict",name:"Strict Release Gate",pass:82,partial:52,requireEvidence:true,requireCountertest:true,requireRepro:true,maxUrls:5},
  balanced:{id:"balanced",name:"Balanced Reliability",pass:72,partial:42,requireEvidence:true,requireCountertest:false,requireRepro:false,maxUrls:5},
  exploratory:{id:"exploratory",name:"Exploratory Research",pass:66,partial:36,requireEvidence:false,requireCountertest:false,requireRepro:false,maxUrls:3}
} as const;

const CERT=["100%","garanti","certain","toujours","jamais","aucune erreur","parfaitement","irréfutable","termine","fini","validé","pass","déployé","fonctionne"];
const PROOF=["http 200","status 200","test","log","preuve","evidence","mesure","benchmark","capture","screenshot","commit","curl","playwright","pytest","source","citation","sha","hash","verified"];
const COUNTER=["contre-test","countertest","red team","false-pass","faux pass","adversarial","contre-exemple","counterexample"];
const REPRO=["reprodu","second run","seconde exécution","clean run","fresh run","indépendant","independent","repeat","répété"];
const norm=(s:any)=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const hits=(s:any,a:string[])=>a.reduce((n,x)=>n+(norm(s).includes(norm(x))?1:0),0);
const split=(s:any)=>String(s||"").split(/(?<=[.!?])\s+|\n+/).map((x:string)=>x.trim()).filter((x:string)=>x.length>10).slice(0,50);
const tokens=(s:any)=>new Set(norm(s).replace(/https?:\/\/\S+/g," ").replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter((x:string)=>x.length>4));
const overlap=(a:string,b:string)=>{const A=tokens(a),B=tokens(b);if(!A.size||!B.size)return 0;let n=0;A.forEach((x:any)=>B.has(x)&&n++);return n/Math.min(A.size,B.size)};
const policy=(id:any)=>(POLICIES as any)[id]||POLICIES.strict;

function store(){
  const ctx=(globalThis as any).Netlify?.context?.deploy?.context;
  return ctx==="production"?getStore("evidorix-audits",{consistency:"strong"}):getDeployStore("evidorix-audits");
}
function safeUrl(raw:string){try{const u=new URL(raw);if(!["http:","https:"].includes(u.protocol))return null;if(["localhost","127.0.0.1","::1"].includes(u.hostname))return null;return u}catch{return null}}
async function verifyUrl(raw:string){
 const u=safeUrl(raw);if(!u)return {kind:"url",target:raw,status:"FAIL",ok:false,reason:"invalid-or-local-url"};
 const started=Date.now(),c=new AbortController(),t=setTimeout(()=>c.abort(),4500);
 try{let r=await fetch(u,{method:"HEAD",redirect:"follow",signal:c.signal,headers:{"user-agent":"EvidorixVerifier/3.1"}});if(r.status===405||r.status===403)r=await fetch(u,{method:"GET",redirect:"follow",signal:c.signal,headers:{"user-agent":"EvidorixVerifier/3.1","range":"bytes=0-2048"}});const ok=r.status>=200&&r.status<400;return {kind:"url",target:raw,status:ok?"PASS":"FAIL",ok,httpStatus:r.status,finalUrl:r.url,latencyMs:Date.now()-started,checkedAt:new Date().toISOString()}}catch(e:any){return {kind:"url",target:raw,status:"UNKNOWN",ok:false,reason:e?.name==="AbortError"?"timeout":"fetch-error",latencyMs:Date.now()-started,checkedAt:new Date().toISOString()}}finally{clearTimeout(t)}
}
async function verifyEvidence(evidence:any[],maxUrls:number){
 const urls:string[]=[];for(const item of evidence){const text=typeof item==="string"?item:item?.text||"";for(const m of text.match(/https?:\/\/[^\s)\]}>,]+/g)||[])if(!urls.includes(m)&&urls.length<maxUrls)urls.push(m)}return Promise.all(urls.map(verifyUrl))
}
async function verifyGitHub(x:any){
 const repo=String(x.repo||""),sha=String(x.sha||"");if(!/^[\w.-]+\/[\w.-]+$/.test(repo)||!/^[a-f0-9]{7,40}$/i.test(sha))return {status:"FAIL",ok:false,reason:"invalid-input"};
 const h={"accept":"application/vnd.github+json","user-agent":"EvidorixGitHubConnector/3.1"};try{const [c,s,r]=await Promise.all([fetch("https://api.github.com/repos/"+repo+"/commits/"+sha,{headers:h}),fetch("https://api.github.com/repos/"+repo+"/commits/"+sha+"/status",{headers:h}),fetch("https://api.github.com/repos/"+repo+"/actions/runs?head_sha="+sha+"&per_page=20",{headers:h})]);const cj=c.ok?await c.json():null,sj=s.ok?await s.json():null,rj=r.ok?await r.json():null,runs=(rj?.workflow_runs||[]).map((z:any)=>({id:z.id,name:z.name,status:z.status,conclusion:z.conclusion,html_url:z.html_url}));const ok=!!cj&&(sj?.state==="success"||runs.some((z:any)=>z.conclusion==="success"));return {status:ok?"PASS":cj?"PARTIAL":"FAIL",ok,repo,sha:cj?.sha||sha,commitUrl:cj?.html_url||null,combinedStatus:sj?.state||"unknown",workflowRuns:runs,checkedAt:new Date().toISOString()}}catch{return {status:"UNKNOWN",ok:false,reason:"github-fetch-error",checkedAt:new Date().toISOString()}}
}
function audit({task="",answer="",evidence=[],verifiedEvidence=[],p}:any){
 const claims=split(answer).map((text:string,i:number)=>({id:"C"+(i+1),text,risk:hits(text,CERT)}));const ev=(Array.isArray(evidence)?evidence:String(evidence).split(/\n+/)).map((x:any)=>typeof x==="string"?{text:x}:{...x}).filter((x:any)=>x.text?.trim()).slice(0,40).map((x:any,i:number)=>({id:"E"+(i+1),...x,text:x.text.trim()}));const edges:any[]=[];claims.forEach((c:any)=>ev.forEach((e:any)=>{const w=overlap(c.text,e.text);if(w>=.16)edges.push({from:c.id,to:e.id,weight:+w.toFixed(2)})}));const coverage=claims.length?new Set(edges.map(x=>x.from)).size/claims.length:0,combined=answer+"\n"+ev.map((x:any)=>x.text).join("\n"),cert=hits(answer,CERT),proof=hits(combined,PROOF)+ev.length,counter=hits(combined,COUNTER),repro=hits(combined,REPRO),verifiedOk=verifiedEvidence.filter((x:any)=>x.ok).length,verifiedFail=verifiedEvidence.filter((x:any)=>x.status==="FAIL").length;
 const gates=[{id:"objective",label:"Objective Gate",score:/pass|partial|fail|crit[eè]re|objectif|attendu|acceptance/i.test(task)?100:45},{id:"evidence",label:"Evidence Coverage",score:Math.min(100,Math.round(coverage*55+Math.min(45,ev.length*12)))},{id:"verification",label:"Independent Verification",score:verifiedEvidence.length?Math.max(0,Math.min(100,35+verifiedOk*20-verifiedFail*20)):35},{id:"redteam",label:"Red Team",score:counter?Math.min(100,70+counter*10):20},{id:"falsepass",label:"False-Pass Hunter",score:Math.max(0,Math.min(100,100-cert*8-Math.max(0,cert-proof)*15+(proof?8:0)))},{id:"repro",label:"Reproducibility",score:repro?Math.min(100,65+repro*10):20}];
 let score=Math.round(gates.reduce((s,g)=>s+g.score,0)/gates.length);const blockers:string[]=[];if(p.requireEvidence&&!ev.length)blockers.push("evidence-required");if(p.requireCountertest&&!counter)blockers.push("countertest-required");if(p.requireRepro&&!repro)blockers.push("reproducibility-required");if(verifiedFail)blockers.push("verified-evidence-failed");if(cert&&!ev.length)blockers.push("unsupported-certainty");let verdict=blockers.some(x=>x==="verified-evidence-failed"||x==="unsupported-certainty")||score<p.partial?"FAIL":score<p.pass?"PARTIAL":"PASS";if(blockers.length&&verdict==="PASS")verdict="PARTIAL";
 const r:any={schema:"evidorix/audit@3.1",engine:"mythos-astra-omega/3.1",id:"evx_"+randomUUID(),createdAt:new Date().toISOString(),policy:p.id,task,answer,claims,evidence:ev,verifiedEvidence,graph:{nodes:[...claims.map((x:any)=>({id:x.id,kind:"claim",label:x.text})),...ev.map((x:any)=>({id:x.id,kind:"evidence",label:x.text}))],edges},gates,score,verdict,blockers};r.fingerprint=createHash("sha256").update(JSON.stringify(r)).digest("hex");return r
}
async function saveAudit(r:any){const s=store();await s.setJSON("audit/"+Date.now()+"-"+r.id,r)}
async function listAudits(limit=25){const s=store(),{blobs}=await s.list({prefix:"audit/"});const keys=blobs.map(x=>x.key).sort().reverse().slice(0,Math.min(100,limit));return (await Promise.all(keys.map(k=>s.get(k,{type:"json"})))).filter(Boolean)}
async function getAudit(id:string){const s=store(),{blobs}=await s.list({prefix:"audit/"});const hit=blobs.find(x=>x.key.endsWith("-"+id));return hit?await s.get(hit.key,{type:"json"}):null}
const json=(x:any,status=200)=>new Response(JSON.stringify(x),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","x-evidorix-registry":"netlify-blobs"}});
export default async (req:Request,_context:Context)=>{
 const u=new URL(req.url),path=u.pathname;
 if(req.method==="GET"&&path==="/healthz")return json({status:"ok",service:"Evidorix Gateway",version:"3.1.0",registry:{mode:"netlify-blobs",durable:true}});
 if(req.method==="GET"&&path==="/v1/policies")return json({policies:Object.values(POLICIES)});
 if(req.method==="GET"&&path==="/v1/audits")return json({registry:{mode:"netlify-blobs",durable:true},audits:await listAudits(Number(u.searchParams.get("limit")||25))});
 if(req.method==="GET"&&path.startsWith("/v1/audits/")){const r=await getAudit(path.split("/").pop()||"");return r?json(r):json({error:"audit-not-found"},404)}
 if(req.method==="POST"&&path==="/v1/audits"){try{const x=await req.json(),p=policy(x.policy),evidence=Array.isArray(x.evidence)?x.evidence:String(x.evidence||"").split(/\n+/).filter(Boolean),verified=x.verifyEvidence===false?[]:await verifyEvidence(evidence,p.maxUrls),r=audit({task:x.task,answer:x.answer,evidence,verifiedEvidence:verified,p});await saveAudit(r);return json(r,201)}catch(e:any){return json({error:e?.message||"bad-request"},400)}}
 if(req.method==="POST"&&path==="/v1/verify/github"){try{return json(await verifyGitHub(await req.json()))}catch{return json({error:"bad-request"},400)}}
 return json({error:"not-found"},404)
};
export const config:Config={path:["/healthz","/v1/policies","/v1/audits","/v1/audits/*","/v1/verify/github"]};
