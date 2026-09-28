const http = require("http");
const crypto = require("crypto");

const domain = process.env.AUTODNS_DOMAIN || "pantomime.org";
const rootTarget = process.env.ROOT_TARGET;
const wwwTarget = process.env.WWW_TARGET;
const rawKey = (process.env.DYNADOT_API_KEY || "").trim().replace(/^['"]|['"]$/g, "");
const secret = (process.env.DYNADOT_API_SECRET || "").trim().replace(/^['"]|['"]$/g, "");
let state = { ok:false, phase:"boot", domain };

function candidateKeys(key) {
  const vals = [key];
  if (key.startsWith("9") && key.length > 1) vals.push(key.slice(1));
  else vals.push("9" + key);
  return [...new Set(vals.filter(Boolean))];
}

async function restCall(apiKey, method, payload) {
  const path = "/restful/v2/domains/" + domain + "/records";
  const body = payload ? JSON.stringify(payload) : "";
  const requestId = crypto.randomUUID();
  const signature = crypto.createHmac("sha256", secret)
    .update(apiKey + "\n" + path + "\n" + requestId + "\n" + body)
    .digest("base64");
  const res = await fetch("https://api.dynadot.com" + path, {
    method,
    headers: {
      "Accept":"application/json",
      "Authorization":"Bearer " + apiKey,
      "X-Request-ID":requestId,
      "X-Signature":signature,
      ...(payload ? {"Content-Type":"application/json"} : {})
    },
    body: payload ? body : undefined
  });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; }
  catch { json = { raw:text.slice(0,500) }; }
  return { status:res.status, body:json };
}

function lists(payload) {
  const glue = payload?.data?.glue_info || {};
  return {
    main: Array.isArray(glue.dns_main_list) ? glue.dns_main_list : [],
    sub: Array.isArray(glue.dns_sub_list) ? glue.dns_sub_list : []
  };
}

const typeOf = r => String(r?.record_type || "").toLowerCase();
const hostOf = r => String(r?.sub_host || "").toLowerCase().replace(/\.$/, "");

async function run() {
  if (!rawKey || !secret || !rootTarget || !wwwTarget) throw new Error("missing configuration");

  let apiKey = null;
  let current = null;
  for (const k of candidateKeys(rawKey)) {
    const test = await restCall(k, "GET");
    if (test.status === 200) {
      apiKey = k;
      current = test.body;
      break;
    }
  }
  if (!apiKey) throw new Error("Dynadot authentication failed");

  const { main, sub } = lists(current);
  const web = new Set(["a","aaaa","cname","aname","forward","stealth"]);
  const removeMain = main.filter(r => web.has(typeOf(r)));
  const removeSub = sub.filter(r => hostOf(r) === "www" && web.has(typeOf(r)));

  if (removeMain.length || removeSub.length) {
    const payload = {};
    if (removeMain.length) payload.dns_main_list = removeMain;
    if (removeSub.length) payload.dns_sub_list = removeSub;
    const del = await restCall(apiKey, "DELETE", payload);
    if (del.status !== 200) throw new Error("Dynadot DELETE failed HTTP " + del.status);
  }

  const addPayload = {
    dns_main_list: [
      { record_type:"cname", record_value1:rootTarget, record_value2:"" }
    ],
    dns_sub_list: [
      { sub_host:"www", record_type:"cname", record_value1:wwwTarget, record_value2:"" }
    ]
  };
  const add = await restCall(apiKey, "POST", addPayload);
  if (add.status !== 200) throw new Error("Dynadot POST failed HTTP " + add.status);

  const verify = await restCall(apiKey, "GET");
  if (verify.status !== 200) throw new Error("Dynadot verification read failed");
  const after = lists(verify.body);
  const rootOk = after.main.some(r => typeOf(r) === "cname" && String(r.record_value1 || "").replace(/\.$/,"") === rootTarget);
  const wwwOk = after.sub.some(r => hostOf(r) === "www" && typeOf(r) === "cname" && String(r.record_value1 || "").replace(/\.$/,"") === wwwTarget);

  state = {
    ok: rootOk && wwwOk,
    phase:"verified",
    domain,
    rootOk,
    wwwOk,
    rootTarget,
    wwwTarget,
    checkedAt:new Date().toISOString()
  };
  console.log("PANTOMIME_DNS_FIX", JSON.stringify(state));
}

run().catch(err => {
  state = { ok:false, phase:"error", domain, error:String(err?.message || err), checkedAt:new Date().toISOString() };
  console.error("PANTOMIME_DNS_FIX", JSON.stringify(state));
});

http.createServer((req,res) => {
  res.writeHead(req.url === "/health" ? (state.ok ? 200 : 503) : 200, {"content-type":"application/json"});
  res.end(JSON.stringify(state));
}).listen(Number(process.env.PORT || 8080), "0.0.0.0");
