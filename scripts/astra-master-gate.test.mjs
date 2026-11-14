import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const runner=fileURLToPath(new URL("./astra-master-gate.mjs",import.meta.url));
function fixture(bricks,checks,capabilities=[]) {
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),"astra-gate-"));
  fs.mkdirSync(path.join(cwd,"config"),{recursive:true});
  const required=["ASTRA_MASTER_GATE","ASTRA_BRICK_PROOF_GATE","ASTRA_NO_REPEAT","ASTRA_ZERO_COST","ASTRA_AUTOMATION_EVIDENCE"];
  const all=[...bricks];
  for (const id of required) if (!all.some(b=>b.id===id)) all.push({id,scope:"universal",on:["seo"]});
  while (all.length<39) all.push({id:"FILLER_"+all.length,scope:"not-applicable",on:["seo"]});
  fs.writeFileSync(path.join(cwd,"config/astra-brick-registry.json"),JSON.stringify({schema:"astra-brick-registry/1",bricks:all}));
  fs.writeFileSync(path.join(cwd,"config/astra-master-site.json"),JSON.stringify({schema:"astra-master-site/1",siteId:"test-site",capabilities,checks}));
  const run=()=> {
    const res=spawnSync(process.execPath,[runner,"--task=code","--strict"],{cwd,encoding:"utf8",timeout:10000});
    const data=JSON.parse(fs.readFileSync(path.join(cwd,"artifacts/astra-master-gate/report.json"),"utf8"));
    if (data.fatal) console.error("ASTRA_FIXTURE_FATAL", data.fatal, "STDERR", res.stderr, "STDOUT", res.stdout);
    return {res,data};
  };
  return {cwd,run};
}
const always={id:"ALWAYS",scope:"universal",on:["code"]};
const nonApplicable={id:"SEO_ONLY",scope:"seo",on:["seo"]};
test("PASS requires a successfully executed command and evidence report",()=>{
  const {run}=fixture([always,nonApplicable],{ALWAYS:[{type:"command",run:"node -e \"process.exit(0)\""}]});
  const {res,data}=run();
  assert.equal(res.status,0);
  assert.equal(data.status,"PASS");
  assert.deepEqual(data.summary,{pass:1,na:38,fail:0,unverified:0,unknownBindings:0,untrackedScripts:0,invalidExemptions:0});
  assert.match(data.registrySha256,/^[a-f0-9]{64}$/);
});
test("missing executable proof is never a PASS",()=>{
  const {run}=fixture([always],{});
  const {res,data}=run();
  assert.notEqual(res.status,0);
  assert.equal(data.results[0].status,"UNVERIFIED");
});
test("a file existing alone cannot establish activation",()=>{
  const f=fixture([always],{ALWAYS:[{type:"file",path:"config/astra-master-site.json"}]});
  const {res,data}=f.run();
  assert.notEqual(res.status,0);
  assert.equal(data.results[0].status,"UNVERIFIED");
});
test("failed executable blocks strict mode",()=>{
  const {run}=fixture([always],{ALWAYS:[{type:"command",run:"node -e \"process.exit(3)\""}]});
  const {res,data}=run();
  assert.notEqual(res.status,0);
  assert.equal(data.results[0].status,"FAIL");
  assert.equal(data.results[0].evidence[0].exitCode,3);
});
test("unregistered binding cannot be silently accepted",()=>{
  const {run}=fixture([always],{ALWAYS:[{type:"command",run:"node -e \"process.exit(0)\""}],UNLISTED:[{type:"command",run:"true"}]});
  const {res,data}=run();
  assert.notEqual(res.status,0);
  assert.deepEqual(data.unknownBindings,["UNLISTED"]);
});

test("unregistered ASTRA scripts cannot bypass the catalog",()=>{
  const f=fixture([always],{ALWAYS:[{type:"command",run:"true"}]});
  fs.mkdirSync(path.join(f.cwd,"scripts"),{recursive:true});
  fs.writeFileSync(path.join(f.cwd,"scripts/astra-hidden-guard.mjs"),"console.log('hidden')");
  const {res,data}=f.run();
  assert.notEqual(res.status,0);
  assert.deepEqual(data.untrackedScripts,["scripts/astra-hidden-guard.mjs"]);
});
