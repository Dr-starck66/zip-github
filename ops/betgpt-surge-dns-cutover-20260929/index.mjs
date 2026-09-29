import dns from "node:dns/promises";
import crypto from "node:crypto";

const DOMAIN = process.env.DOMAIN || "betgpt.live";
const API = "https://api.porkbun.com/api/json/v3";
const KEY = process.env.PORKBUN_API_KEY;
const SECRET = process.env.PORKBUN_SECRET_API_KEY;
const APPLY = process.env.DNS_CUTOVER_APPLY === "yes";
const TARGET_A = "138.197.235.123";
const TARGET_WWW = "geo.surge.world";

if (!KEY || !SECRET) throw new Error("Missing Porkbun API credentials");
if (!APPLY) throw new Error("DNS_CUTOVER_APPLY is not yes");

const headers = {
  "content-type": "application/json",
  "X-API-Key": KEY,
  "X-Secret-API-Key": SECRET,
};

async function req(path, opts={}) {
  const res = await fetch(API + path, { ...opts, headers: { ...headers, ...(opts.headers||{}) } });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return { ok: res.ok, status: res.status, body };
}
function safe(label, obj) {
  const copy = JSON.parse(JSON.stringify(obj));
  const scrub = v => {
    if (!v || typeof v !== "object") return;
    for (const k of Object.keys(v)) {
      if (/key|secret|token/i.test(k)) v[k] = "[REDACTED]";
      else scrub(v[k]);
    }
  };
  scrub(copy);
  console.log(label, JSON.stringify(copy));
}
function idem(prefix) {
  return crypto.createHash("sha256").update(prefix + "|" + DOMAIN + "|surge-v1").digest("hex").slice(0,32);
}

console.log("CUTOVER_START", DOMAIN);

const pre = await req("/dns/preflight/" + encodeURIComponent(DOMAIN));
safe("PREFLIGHT", pre);
if (!pre.ok || pre.body?.status === "ERROR") throw new Error("Porkbun preflight failed");

// Refuse a false PASS if Porkbun is not authoritative.
const preText = JSON.stringify(pre.body).toLowerCase();
if (preText.includes("nameservers-ours") && (preText.includes('"passed":false') || preText.includes('"ok":false') || preText.includes('"status":"fail"'))) {
  throw new Error("Porkbun is not authoritative for this domain");
}

const before = await req("/dns/retrieve/" + encodeURIComponent(DOMAIN));
safe("ZONE_BEFORE", before);
if (!before.ok || before.body?.status === "ERROR") throw new Error("Cannot retrieve Porkbun DNS zone");
const records = before.body?.records || [];
const fqdn = s => (s || "").replace(/\.$/,"").toLowerCase();
const apex = DOMAIN.toLowerCase();
const www = "www." + apex;
const webTypes = new Set(["A","AAAA","CNAME","ALIAS","ANAME"]);
const conflicts = records.filter(r => webTypes.has(String(r.type).toUpperCase()) && [apex,www,""].includes(fqdn(r.name)));

const exactA = records.filter(r => String(r.type).toUpperCase()==="A" && [apex,""].includes(fqdn(r.name)) && String(r.content).trim()===TARGET_A);
const exactWww = records.filter(r => String(r.type).toUpperCase()==="CNAME" && fqdn(r.name)===www && fqdn(r.content)===TARGET_WWW);

const bad = conflicts.filter(r => !exactA.includes(r) && !exactWww.includes(r));
if (bad.length===0 && exactA.length===1 && exactWww.length===1) {
  console.log("NOOP_ALREADY_CORRECT");
} else {
  // Dry-run destructive operations first.
  for (const r of conflicts) {
    const dr = await req("/dns/delete/" + encodeURIComponent(DOMAIN) + "/" + encodeURIComponent(r.id), {
      method:"POST", body:JSON.stringify({dryRun:true})
    });
    safe("DRY_DELETE_" + r.id, dr);
    if (!dr.ok || dr.body?.status === "ERROR" || dr.body?.wouldSucceed === false) throw new Error("Dry-run delete failed for record " + r.id);
  }
  for (const spec of [
    {type:"A", content:TARGET_A, ttl:"600"},
    {type:"CNAME", name:"www", content:TARGET_WWW, ttl:"600"}
  ]) {
    const dr = await req("/dns/create/" + encodeURIComponent(DOMAIN), {
      method:"POST", body:JSON.stringify({...spec,dryRun:true})
    });
    safe("DRY_CREATE_" + spec.type, dr);
    // Duplicate is acceptable only if the exact target record already exists and will not be deleted.
    const dup = dr.status===400 && dr.body?.code==="DUPLICATE_RECORD";
    if ((!dr.ok || dr.body?.status === "ERROR" || dr.body?.wouldSucceed === false) && !dup) {
      throw new Error("Dry-run create failed for " + spec.type);
    }
  }

  // Apply: remove web-hosting conflicts only.
  for (const r of conflicts) {
    const del = await req("/dns/delete/" + encodeURIComponent(DOMAIN) + "/" + encodeURIComponent(r.id), {
      method:"POST",
      headers:{"Idempotency-Key":idem("delete-"+r.id)},
      body:JSON.stringify({})
    });
    safe("DELETE_" + r.id, del);
    if (!del.ok || del.body?.status === "ERROR") throw new Error("Delete failed for record " + r.id);
  }

  for (const spec of [
    {type:"A", content:TARGET_A, ttl:"600"},
    {type:"CNAME", name:"www", content:TARGET_WWW, ttl:"600"}
  ]) {
    const cr = await req("/dns/create/" + encodeURIComponent(DOMAIN), {
      method:"POST",
      headers:{"Idempotency-Key":idem("create-"+spec.type)},
      body:JSON.stringify(spec)
    });
    safe("CREATE_" + spec.type, cr);
    if (!cr.ok || cr.body?.status === "ERROR") throw new Error("Create failed for " + spec.type);
    if (Array.isArray(cr.body?.warnings) && cr.body.warnings.length) throw new Error("Porkbun write warning: authoritative DNS mismatch");
  }
}

const after = await req("/dns/retrieve/" + encodeURIComponent(DOMAIN));
safe("ZONE_AFTER", after);
if (!after.ok || after.body?.status === "ERROR") throw new Error("Cannot verify Porkbun DNS zone");
const ar = after.body?.records || [];
const aOk = ar.some(r => String(r.type).toUpperCase()==="A" && [apex,""].includes(fqdn(r.name)) && String(r.content).trim()===TARGET_A);
const wOk = ar.some(r => String(r.type).toUpperCase()==="CNAME" && fqdn(r.name)===www && fqdn(r.content)===TARGET_WWW);
if (!aOk || !wOk) throw new Error("Post-write zone verification failed");

try {
  const ns = await dns.resolveNs(DOMAIN);
  console.log("AUTHORITATIVE_NS", JSON.stringify(ns));
} catch (e) { console.log("AUTHORITATIVE_NS_ERROR", e.message); }
try {
  const a = await dns.resolve4(DOMAIN);
  console.log("PUBLIC_A", JSON.stringify(a));
} catch (e) { console.log("PUBLIC_A_ERROR", e.message); }
try {
  const c = await dns.resolveCname("www."+DOMAIN);
  console.log("PUBLIC_WWW_CNAME", JSON.stringify(c));
} catch (e) { console.log("PUBLIC_WWW_CNAME_ERROR", e.message); }

console.log("CUTOVER_PASS_ZONE_CONFIG");
