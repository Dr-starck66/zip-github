import http from "node:http";
import {readFile} from "node:fs/promises";
import {extname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {audit} from "./engine.mjs";
import {POLICIES,getPolicy} from "./policies.mjs";
import {verifyEvidence,verifyGitHub} from "./verifier.mjs";
import {saveAudit,getAudit,listAudits,registryInfo} from "./registry.mjs";
const ROOT=fileURLToPath(new URL("../public/",import.meta.url));
const PORT=Number(process.env.PORT||8787);
const json=(res,status,data,extra={})=>{res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","x-frame-options":"DENY","referrer-policy":"no-referrer","x-evidorix-registry":registryInfo.mode,...extra});res.end(JSON.stringify(data))};
const body=async req=>{let s="";for await(const c of req){s+=c;if(s.length>1_000_000)throw new Error("body-too-large")}return s?JSON.parse(s):{}};
const type=p=>({".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8"}[extname(p)]||"application/octet-stream");
async function staticFile(req,res,url){let p=url.pathname==="/"?"/index.html":url.pathname;if(p.includes(".."))return false;try{const data=await readFile(join(ROOT,p));res.writeHead(200,{"content-type":type(p),"cache-control":p.endsWith(".html")?"no-cache":"public,max-age=300","x-content-type-options":"nosniff"});res.end(data);return true}catch{return false}}
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,"http://localhost");
 if(req.method==="GET"&&url.pathname==="/healthz")return json(res,200,{status:"ok",service:"Evidorix Gateway",version:"3.0.0",registry:registryInfo});
 if(req.method==="GET"&&url.pathname==="/v1/policies")return json(res,200,{policies:Object.values(POLICIES)});
 if(req.method==="GET"&&url.pathname==="/v1/audits")return json(res,200,{registry:registryInfo,audits:await listAudits(Number(url.searchParams.get("limit")||25))});
 if(req.method==="GET"&&url.pathname.startsWith("/v1/audits/")){const r=await getAudit(url.pathname.split("/").pop());return r?json(res,200,r):json(res,404,{error:"audit-not-found"})}
 if(req.method==="POST"&&url.pathname==="/v1/audits"){try{const x=await body(req),policy=getPolicy(x.policy),evidence=Array.isArray(x.evidence)?x.evidence:String(x.evidence||"").split(/\n+/).filter(Boolean),verified=x.verifyEvidence===false?[]:await verifyEvidence(evidence,policy.maxUrls);const r=audit({task:x.task,answer:x.answer,evidence,verifiedEvidence:verified,policy});await saveAudit(r);return json(res,201,r)}catch(e){return json(res,e.message==="body-too-large"?413:400,{error:e.message||"bad-request"})}}
 if(req.method==="POST"&&url.pathname==="/v1/verify/github"){try{return json(res,200,await verifyGitHub(await body(req)))}catch(e){return json(res,400,{error:"bad-request"})}}
 if(req.method==="GET"&&url.pathname==="/openapi.json"){try{const data=await readFile(join(ROOT,"openapi.json"));res.writeHead(200,{"content-type":"application/json; charset=utf-8"});return res.end(data)}catch{}}
 if(req.method==="GET"&&await staticFile(req,res,url))return;
 json(res,404,{error:"not-found"});
});
server.listen(PORT,()=>console.log("EVIDORIX_GATEWAY_READY port="+PORT));
