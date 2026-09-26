import type { Config, Context } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import dns from "node:dns/promises";
import net from "node:net";
import crypto from "node:crypto";
import { audit, policies, hashApiKey, createApiKey, hasScope } from "../../src/core.mjs";
import { verifyGithubOidc } from "../../src/github-oidc.mjs";

function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
}
async function body(req:Request){
  const len=Number(req.headers.get("content-length")||0);
  if(len>1_000_000)throw new Error("payload_too_large");
  return req.json().catch(()=>({}));
}
function isPrivateIp(ip:string){
  if(net.isIP(ip)===4){
    const p=ip.split(".").map(Number);
    return p[0]===10||p[0]===127||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168)||p[0]===0;
  }
  if(net.isIP(ip)===6){
    const x=ip.toLowerCase();
    return x==="::1"||x==="::"||x.startsWith("fc")||x.startsWith("fd")||x.startsWith("fe80:");
  }
  return true;
}
async function safeHttpUrl(raw:string){
  const u=new URL(raw);
  if(!["http:","https:"].includes(u.protocol))throw new Error("unsupported_protocol");
  if(["localhost","localhost.localdomain"].includes(u.hostname.toLowerCase()))throw new Error("private_target");
  const resolved=await dns.lookup(u.hostname,{all:true,verbatim:true});
  if(!resolved.length||resolved.some(r=>isPrivateIp(r.address)))throw new Error("private_target");
  return u;
}
async function verifyUrl(raw:string){
  let current=(await safeHttpUrl(raw)).toString();
  for(let hop=0;hop<4;hop++){
    const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),3500);
    try{
      const res=await fetch(current,{method:"HEAD",redirect:"manual",signal:ctrl.signal,headers:{"user-agent":"EvidenLock-Gateway/3.1"}});
      if(res.status>=300&&res.status<400){
        const loc=res.headers.get("location");if(!loc)return {url:raw,status:"UNREACHABLE",httpStatus:res.status};
        current=(await safeHttpUrl(new URL(loc,current).toString())).toString();continue;
      }
      return {url:raw,status:res.ok?"VERIFIED":"UNREACHABLE",httpStatus:res.status,finalUrl:current};
    }catch(e:any){return {url:raw,status:"ERROR",reason:e?.name==="AbortError"?"timeout":String(e?.message||"fetch_failed")}}
    finally{clearTimeout(timer)}
  }
  return {url:raw,status:"ERROR",reason:"too_many_redirects"};
}
async function authenticate(req:Request,requiredScope:string){
  const header=req.headers.get("authorization")||"";
  if(!header.startsWith("Bearer "))return {ok:false,response:json({error:"unauthorized"},401)};
  const hash=hashApiKey(header.slice(7).trim()),db=getDatabase();
  const rows=await db.sql`SELECT id,name,scopes,active FROM api_keys WHERE key_hash=${hash} LIMIT 1`;
  const key=rows[0] as any;
  if(!key||!key.active)return {ok:false,response:json({error:"unauthorized"},401)};
  if(!hasScope(key.scopes,requiredScope))return {ok:false,response:json({error:"forbidden",requiredScope},403)};
  await db.sql`UPDATE api_keys SET last_used_at=NOW() WHERE id=${key.id}`;
  return {ok:true,key};
}
async function createStoredKey(name:string,scopes:string[]){
  const db=getDatabase(),k=createApiKey(),id="key_"+crypto.randomBytes(8).toString("hex");
  await db.sql`INSERT INTO api_keys(id,name,key_prefix,key_hash,scopes) VALUES (${id},${name},${k.prefix},${k.hash},${JSON.stringify(scopes)}::jsonb)`;
  return {id,name,key:k.raw,keyPrefix:k.prefix,scopes};
}

export default async (req:Request,context:Context)=>{
  const u=new URL(req.url),path=u.pathname,method=req.method.toUpperCase(),db=getDatabase();

  if(method==="GET"&&path==="/health")return json({ok:true,service:"evidenlock-gateway",version:"3.1.0",persistence:"netlify-database"});
  if(method==="GET"&&path==="/v1/policies")return json({policies});

  if(method==="GET"&&path==="/v1/selftest"){
    const phase=u.searchParams.get("phase")||"read";
    if(phase==="write"){
      const nonce=crypto.randomBytes(12).toString("hex");
      const fingerprint=crypto.createHash("sha256").update("EL-SELFTEST:"+nonce).digest("hex");
      const checks=JSON.stringify([{id:"database",score:100,ok:true}]);
      await db.sql`INSERT INTO audits(id,api_key_id,policy,task,answer,evidence,checks,score,verdict,fingerprint,created_at)
        VALUES ('EL-SELFTEST',NULL,'selftest',${nonce},'database self-test','[]'::jsonb,${checks}::jsonb,100,'PASS',${fingerprint},NOW())
        ON CONFLICT (id) DO UPDATE SET task=EXCLUDED.task,checks=EXCLUDED.checks,score=100,verdict='PASS',fingerprint=EXCLUDED.fingerprint,created_at=NOW()`;
      return json({ok:true,phase:"write",nonce,persistence:"netlify-database"});
    }
    if(phase==="security"){
      const http=await verifyUrl("https://example.com");
      let privateBlocked=false;
      try{await safeHttpUrl("http://127.0.0.1:80")}catch(e:any){privateBlocked=e?.message==="private_target"}
      const gh=await fetch("https://api.github.com/repos/Dr-starck66/zip-github/commits/ebea0621761ef825e97e6f6f641e456665696b27",{headers:{"accept":"application/vnd.github+json","user-agent":"EvidenLock-Gateway/3.1"}});
      return json({ok:http.status==="VERIFIED"&&privateBlocked&&gh.ok,phase:"security",http,privateNetworkBlocked:privateBlocked,github:{verified:gh.ok,status:gh.status,commit:"ebea0621761ef825e97e6f6f641e456665696b27"}});
    }
    const rows=await db.sql`SELECT task AS nonce,score,verdict,created_at FROM audits WHERE id='EL-SELFTEST' LIMIT 1`;
    if(!(rows as any[]).length)return json({ok:false,phase:"read",error:"selftest_not_written"},404);
    const keyCount=await db.sql`SELECT COUNT(*)::int AS count FROM api_keys WHERE active=TRUE`;
    return json({ok:true,phase:"read",record:(rows as any[])[0],activeApiKeys:Number((keyCount as any[])[0]?.count||0),persistence:"netlify-database"});
  }

  if(method==="POST"&&path==="/v1/admin/bootstrap"){
    const secret=req.headers.get("x-bootstrap-secret")||"";
    const expected=Netlify.env.get("EVIDENLOCK_BOOTSTRAP_SECRET")||"";
    if(!expected||secret!==expected)return json({error:"forbidden"},403);
    const existing=await db.sql`SELECT COUNT(*)::int AS count FROM api_keys`;
    if(Number((existing[0] as any)?.count||0)>0)return json({error:"already_bootstrapped"},409);
    return json(await createStoredKey("bootstrap-admin",["*"]),201);
  }

  if(method==="POST"&&path==="/v1/api-keys"){
    const auth=await authenticate(req,"keys:write");if(!auth.ok)return auth.response;
    const b=await body(req),scopes=Array.isArray((b as any).scopes)?(b as any).scopes:["audit:write","audit:read","evidence:verify"];
    return json(await createStoredKey(String((b as any).name||"api-key"),scopes),201);
  }

  if(method==="POST"&&path==="/v1/audits"){
    const auth=await authenticate(req,"audit:write");if(!auth.ok)return auth.response;
    const b:any=await body(req),r=audit(b,b.policy);
    await db.sql`INSERT INTO audits(id,api_key_id,policy,task,answer,evidence,checks,score,verdict,fingerprint,created_at)
      VALUES (${r.id},${(auth as any).key.id},${r.policy},${r.task},${r.answer},${JSON.stringify(r.evidence)}::jsonb,${JSON.stringify(r.checks)}::jsonb,${r.score},${r.verdict},${r.fingerprint},${r.createdAt})`;
    return json(r,201);
  }

  if(method==="GET"&&path==="/v1/audits"){
    const auth=await authenticate(req,"audit:read");if(!auth.ok)return auth.response;
    const limit=Math.min(100,Math.max(1,Number(u.searchParams.get("limit")||25)));
    const rows=await db.sql`SELECT id,policy,task,score,verdict,fingerprint,created_at FROM audits ORDER BY created_at DESC LIMIT ${limit}`;
    return json({audits:rows,persistence:"netlify-database"});
  }

  if(method==="POST"&&path==="/v1/evidence/verify"){
    const auth=await authenticate(req,"evidence:verify");if(!auth.ok)return auth.response;
    const b:any=await body(req),items=Array.isArray(b.items)?b.items.slice(0,10):[];
    const results=[];for(const item of items){const url=typeof item==="string"?item:item?.url;if(typeof url==="string")results.push(await verifyUrl(url))}
    return json({results});
  }

  if(method==="POST"&&path==="/v1/github/attest"){
    const header=req.headers.get("authorization")||"";
    if(!header.startsWith("Bearer "))return json({error:"unauthorized"},401);
    const token=header.slice(7).trim();
    let claims:any;
    try{
      claims=await verifyGithubOidc(token,{
        audience:"evidenlock",
        trustResolver:async(repository:string)=>{
          const rows=await db.sql`SELECT repository,enabled,allowed_events,required_ref FROM github_trust_policies WHERE repository=${repository} LIMIT 1`;
          const row=(rows as any[])[0];
          if(!row)return null;
          return {enabled:row.enabled,allowedEvents:row.allowed_events,requiredRef:row.required_ref};
        }
      });
    }catch(e:any){
      return json({error:"oidc_rejected",reason:String(e?.message||"verification_failed")},401);
    }
    const b:any=await body(req);
    const evidence=[
      String(b.evidence||"").trim(),
      "GitHub OIDC verified",
      "repository "+claims.repository,
      "commit SHA "+claims.sha,
      "workflow "+String(claims.workflow||"unknown"),
      "run "+String(claims.runId||"unknown"),
      "independent GitHub Actions attestation"
    ].filter(Boolean).join("\n");
    const r=audit({task:String(b.task||""),answer:String(b.answer||""),evidence},String(b.policy||"strict"));
    const metadata=JSON.stringify({
      repository:claims.repository,
      repositoryId:claims.repositoryId,
      sha:claims.sha,
      ref:claims.ref,
      eventName:claims.eventName,
      actor:claims.actor,
      workflow:claims.workflow,
      workflowRef:claims.workflowRef,
      jobWorkflowRef:claims.jobWorkflowRef,
      runId:claims.runId,
      runNumber:claims.runNumber,
      runAttempt:claims.runAttempt,
      subject:claims.subject
    });
    await db.sql`INSERT INTO audits(id,api_key_id,policy,task,answer,evidence,checks,score,verdict,fingerprint,created_at,principal_type,principal_id,metadata)
      VALUES (${r.id},NULL,${r.policy},${r.task},${r.answer},${JSON.stringify(r.evidence)}::jsonb,${JSON.stringify(r.checks)}::jsonb,${r.score},${r.verdict},${r.fingerprint},${r.createdAt},'github_oidc',${claims.repository+":"+claims.runId},${metadata}::jsonb)`;
    return json({...r,principal:{type:"github_oidc",repository:claims.repository,runId:claims.runId,sha:claims.sha}},201);
  }

  if(method==="POST"&&path==="/v1/evidence/github"){
    const auth=await authenticate(req,"evidence:verify");if(!auth.ok)return auth.response;
    const b:any=await body(req),repository=String(b.repository||""),sha=String(b.sha||"");
    if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)||!/^[a-f0-9]{7,40}$/i.test(sha))return json({error:"invalid_github_evidence"},400);
    const gh=await fetch("https://api.github.com/repos/"+repository+"/commits/"+sha,{headers:{"accept":"application/vnd.github+json","user-agent":"EvidenLock-Gateway/3.1"}});
    return json({verified:gh.ok,status:gh.status,repository,sha},gh.ok?200:422);
  }

  return json({error:"not_found"},404);
};

export const config:Config={
  path:["/health","/v1/policies","/v1/selftest","/v1/admin/bootstrap","/v1/api-keys","/v1/audits","/v1/evidence/verify","/v1/evidence/github","/v1/github/attest"]
};
