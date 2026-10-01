import dns from "node:dns/promises";
import { setTimeout as sleep } from "node:timers/promises";

export async function txtVisible(name, token) {
  try {
    const rows=await dns.resolveTxt(name);
    return rows.map(parts=>parts.join("")).includes(token);
  } catch { return false; }
}

export async function waitForTxt(name, token, {attempts=40,delayMs=7500}={}) {
  for (let i=1;i<=attempts;i++) {
    if (await txtVisible(name,token)) return {ok:true,attempt:i};
    if (i<attempts) await sleep(delayMs);
  }
  throw new Error(`TXT did not propagate: ${name}`);
}

export async function dynadotAppendTxt({domain,host="",value,apiKey,sandbox=false}) {
  if (!apiKey) throw new Error("Missing DYNADOT_API_KEY");
  const base=sandbox?"https://api-sandbox.dynadot.com/api3.json":"https://api.dynadot.com/api3.json";
  const u=new URL(base);
  u.searchParams.set("key",apiKey);
  u.searchParams.set("command","set_dns2");
  u.searchParams.set("domain",domain);
  u.searchParams.set("add_dns_to_current_setting","1");
  if (!host || host==="@") {
    u.searchParams.set("main_record_type0","txt");
    u.searchParams.set("main_record0",value);
  } else {
    u.searchParams.set("subdomain0",host);
    u.searchParams.set("sub_record_type0","txt");
    u.searchParams.set("sub_record0",value);
  }
  const r=await fetch(u);
  const data=await r.json();
  const root=data?.SetDnsResponse;
  if (!r.ok || !root || String(root.ResponseCode??root.SuccessCode)!=="0" || String(root.Status).toLowerCase()!=="success") {
    throw new Error(`Dynadot set_dns2 failed: ${JSON.stringify(data)}`);
  }
  return data;
}

async function porkbun(path, body) {
  const r=await fetch(`https://api.porkbun.com/api/json/v3${path}`,{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)
  });
  const data=await r.json();
  if (!r.ok || data?.status!=="SUCCESS") throw new Error(`Porkbun API failed: ${JSON.stringify(data)}`);
  return data;
}

export async function porkbunUpsertTxt({domain,host="",value,apiKey,secretApiKey}) {
  if (!apiKey || !secretApiKey) throw new Error("Missing PORKBUN_API_KEY/PORKBUN_SECRET_API_KEY");
  const auth={apikey:apiKey,secretapikey:secretApiKey};
  const sub=(!host||host==="@")?"":host;
  const existing=await porkbun(`/dns/retrieveByNameType/${encodeURIComponent(domain)}/TXT/${encodeURIComponent(sub)}`,auth);
  const records=existing?.records||[];
  const match=records.find(x=>x.content===value);
  if (match) return {status:"SUCCESS",skipped:true,id:match.id};
  return porkbun(`/dns/create/${encodeURIComponent(domain)}`,{...auth,name:sub,type:"TXT",content:value,ttl:"600"});
}

export async function publishDnsTxt({provider,domain,host="",value,env=process.env}) {
  const fqdn=(!host||host==="@")?domain:`${host}.${domain}`;
  if (await txtVisible(fqdn,value)) return {provider,skipped:true,reason:"already-visible"};
  if (provider==="dynadot") {
    await dynadotAppendTxt({domain,host,value,apiKey:env.DYNADOT_API_KEY,sandbox:env.DYNADOT_SANDBOX==="1"});
  } else if (provider==="porkbun") {
    await porkbunUpsertTxt({domain,host,value,apiKey:env.PORKBUN_API_KEY,secretApiKey:env.PORKBUN_SECRET_API_KEY});
  } else {
    throw new Error(`Unsupported DNS provider: ${provider}`);
  }
  return {provider,skipped:false};
}
