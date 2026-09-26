import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {verifyGithubOidc} from "../src/github-oidc.mjs";

function jwt(privateKey,jwk,claims){
  const header={alg:"RS256",typ:"JWT",kid:jwk.kid};
  const h=Buffer.from(JSON.stringify(header)).toString("base64url");
  const p=Buffer.from(JSON.stringify(claims)).toString("base64url");
  const sig=crypto.sign("RSA-SHA256",Buffer.from(h+"."+p),privateKey).toString("base64url");
  return h+"."+p+"."+sig;
}
function fixture(){
  const {privateKey,publicKey}=crypto.generateKeyPairSync("rsa",{modulusLength:2048});
  const jwk=publicKey.export({format:"jwk"});jwk.kid="test-kid";jwk.use="sig";jwk.alg="RS256";
  const now=Math.floor(Date.now()/1000);
  const claims={iss:"https://token.actions.githubusercontent.com",aud:"evidenlock",exp:now+300,nbf:now-10,iat:now-5,repository:"Dr-starck66/zip-github",repository_id:"1219296140",repository_owner:"Dr-starck66",sha:"a".repeat(40),ref:"refs/heads/main",event_name:"push",actor:"Dr-starck66",workflow:"EVIDENLOCK Attest",run_id:"123",run_number:"1",run_attempt:"1",sub:"repo:Dr-starck66/zip-github:ref:refs/heads/main"};
  const fetchFn=async()=>new Response(JSON.stringify({keys:[jwk]}),{status:200,headers:{"content-type":"application/json"}});
  const trustResolver=async repository=>repository==="Dr-starck66/zip-github"?{enabled:true,allowedEvents:["push","workflow_dispatch"],requiredRef:"refs/heads/main"}:null;
  return {privateKey,jwk,now,claims,fetchFn,trustResolver};
}
test("valid GitHub OIDC token verifies",async()=>{const f=fixture();const out=await verifyGithubOidc(jwt(f.privateKey,f.jwk,f.claims),{fetchFn:f.fetchFn,trustResolver:f.trustResolver,now:f.now});assert.equal(out.repository,"Dr-starck66/zip-github");assert.equal(out.eventName,"push")});
test("wrong audience rejected",async()=>{const f=fixture();const token=jwt(f.privateKey,f.jwk,{...f.claims,aud:"wrong"});await assert.rejects(()=>verifyGithubOidc(token,{fetchFn:f.fetchFn,trustResolver:f.trustResolver,now:f.now}),/invalid_audience/)});
test("tampered signature rejected",async()=>{const f=fixture();const token=jwt(f.privateKey,f.jwk,f.claims);const parts=token.split(".");parts[1]=Buffer.from(JSON.stringify({...f.claims,repository:"evil/repo"})).toString("base64url");await assert.rejects(()=>verifyGithubOidc(parts.join("."),{fetchFn:f.fetchFn,trustResolver:f.trustResolver,now:f.now}),/invalid_signature/)});
test("untrusted ref rejected",async()=>{const f=fixture();const token=jwt(f.privateKey,f.jwk,{...f.claims,ref:"refs/heads/evil"});await assert.rejects(()=>verifyGithubOidc(token,{fetchFn:f.fetchFn,trustResolver:f.trustResolver,now:f.now}),/ref_not_trusted/)});
