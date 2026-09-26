import http from "node:http";import {audit,policies,verifyEvidence,githubCommitEvidence} from "./src/core.mjs";
const ledger=[];
const json=(res,status,data)=>{res.writeHead(status,{"content-type":"application/json","access-control-allow-origin":"*","access-control-allow-headers":"content-type,authorization","access-control-allow-methods":"GET,POST,OPTIONS"});res.end(JSON.stringify(data))};
const body=req=>new Promise((resolve,reject)=>{let d="";req.on("data",c=>{d+=c;if(d.length>1e6)reject(new Error("payload_too_large"))});req.on("end",()=>{try{resolve(d?JSON.parse(d):{})}catch(e){reject(e)}})});
export async function handler(req,res){
 if(req.method==="OPTIONS")return json(res,204,{});
 const u=new URL(req.url,"http://localhost");
 try{
  if(req.method==="GET"&&u.pathname==="/health")return json(res,200,{ok:true,service:"trustloom-gateway",version:"3.0.0"});
  if(req.method==="GET"&&u.pathname==="/v1/policies")return json(res,200,{policies});
  if(req.method==="GET"&&u.pathname==="/v1/audits")return json(res,200,{audits:ledger.slice(-100).reverse(),persistence:"process-local"});
  if(req.method==="POST"&&u.pathname==="/v1/audits"){const b=await body(req),r=audit(b,b.policy);ledger.push(r);return json(res,200,r)}
  if(req.method==="POST"&&u.pathname==="/v1/evidence/verify"){const b=await body(req);return json(res,200,{results:await verifyEvidence(b.items||[])})}
  if(req.method==="POST"&&u.pathname==="/v1/evidence/github"){const b=await body(req),r=await githubCommitEvidence(b);return json(res,r.ok?200:422,r)}
  return json(res,404,{error:"not_found"});
 }catch(e){return json(res,400,{error:e.message||"bad_request"})}
}
if(process.env.VERCEL!== "1"){http.createServer(handler).listen(process.env.PORT||8787,()=>console.log("TrustLoom Gateway on :"+(process.env.PORT||8787)))}