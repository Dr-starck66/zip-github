import crypto from "node:crypto";

const ISSUER="https://token.actions.githubusercontent.com";
const JWKS_URL="https://token.actions.githubusercontent.com/.well-known/jwks";

function decodeJson(part){
  try{return JSON.parse(Buffer.from(part,"base64url").toString("utf8"))}
  catch{throw new Error("invalid_jwt_encoding")}
}
function audOk(aud,expected){
  return typeof aud==="string"?aud===expected:Array.isArray(aud)&&aud.includes(expected);
}
export function decodeGithubJwt(token){
  const parts=String(token||"").split(".");
  if(parts.length!==3)throw new Error("invalid_jwt");
  return {header:decodeJson(parts[0]),payload:decodeJson(parts[1]),parts};
}
export async function verifyGithubOidc(token,{audience="evidenlock",fetchFn=fetch,trustResolver,now=Math.floor(Date.now()/1000)}={}){
  const {header,payload,parts}=decodeGithubJwt(token);
  if(header.alg!=="RS256"||!header.kid)throw new Error("unsupported_jwt_header");
  if(payload.iss!==ISSUER)throw new Error("invalid_issuer");
  if(!audOk(payload.aud,audience))throw new Error("invalid_audience");
  if(typeof payload.exp!=="number"||payload.exp<now-30)throw new Error("token_expired");
  if(typeof payload.nbf==="number"&&payload.nbf>now+30)throw new Error("token_not_active");
  if(typeof payload.iat==="number"&&payload.iat>now+60)throw new Error("invalid_iat");
  if(typeof payload.repository!=="string"||typeof payload.sha!=="string")throw new Error("missing_github_claims");

  const response=await fetchFn(JWKS_URL,{headers:{"accept":"application/json"}});
  if(!response.ok)throw new Error("jwks_unavailable");
  const jwks=await response.json();
  const jwk=Array.isArray(jwks.keys)?jwks.keys.find(k=>k.kid===header.kid&&k.kty==="RSA"):null;
  if(!jwk)throw new Error("unknown_signing_key");
  const publicKey=crypto.createPublicKey({key:jwk,format:"jwk"});
  const ok=crypto.verify("RSA-SHA256",Buffer.from(parts[0]+"."+parts[1]),publicKey,Buffer.from(parts[2],"base64url"));
  if(!ok)throw new Error("invalid_signature");

  const trust=trustResolver?await trustResolver(payload.repository):null;
  if(!trust||trust.enabled===false)throw new Error("repository_not_trusted");
  if(Array.isArray(trust.allowedEvents)&&trust.allowedEvents.length&&!trust.allowedEvents.includes(payload.event_name))throw new Error("event_not_trusted");
  if(trust.requiredRef&&payload.ref!==trust.requiredRef)throw new Error("ref_not_trusted");

  return {
    repository:payload.repository,
    repositoryId:payload.repository_id,
    repositoryOwner:payload.repository_owner,
    sha:payload.sha,
    ref:payload.ref,
    eventName:payload.event_name,
    actor:payload.actor,
    actorId:payload.actor_id,
    workflow:payload.workflow,
    workflowRef:payload.workflow_ref,
    jobWorkflowRef:payload.job_workflow_ref,
    runId:payload.run_id,
    runNumber:payload.run_number,
    runAttempt:payload.run_attempt,
    subject:payload.sub
  };
}
