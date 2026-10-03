import assert from "node:assert/strict";
import { reliabilityConfig, probeJson, structuredReliabilityEvent } from "./reliability.mjs";

const none=reliabilityConfig({});
assert.equal(none.gatus.status,"UNCONFIGURED");
assert.equal(none.litellm.status,"UNCONFIGURED");
assert.equal(none.trigger.status,"UNCONFIGURED");
assert.equal(none.langfuse.status,"UNCONFIGURED");

const all=reliabilityConfig({
 ASTRA_GATUS_URL:"http://gatus",
 ASTRA_LLM_GATEWAY_BASE:"http://litellm",
 TRIGGER_SECRET_KEY:"x",
 LANGFUSE_PUBLIC_KEY:"p",LANGFUSE_SECRET_KEY:"s",LANGFUSE_BASE_URL:"http://langfuse",
 OTEL_EXPORTER_OTLP_ENDPOINT:"http://otel"
});
assert.equal(all.gatus.status,"CONFIGURED");
assert.equal(all.litellm.status,"CONFIGURED");
assert.equal(all.trigger.status,"CONFIGURED");
assert.equal(all.langfuse.status,"CONFIGURED");
assert.equal(all.railwayTracing.status,"CONFIGURED");

const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>new Response(JSON.stringify({ok:true,service:"test"}),{status:200,headers:{"content-type":"application/json"}});
const pass=await probeJson("https://example.invalid/health",{expect:b=>b?.ok===true&&b?.service==="test"});
assert.equal(pass.status,"PASS");
const fail=await probeJson("https://example.invalid/health",{expect:b=>b?.service==="wrong"});
assert.equal(fail.status,"FAIL");
globalThis.fetch=originalFetch;

assert.equal(structuredReliabilityEvent("SELFTEST",{ok:true},{}).schema,"astra-reliability-event/v1");
console.log("ASTRA_RELIABILITY_SELFTEST_PASS");
