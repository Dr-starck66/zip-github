#!/usr/bin/env node
/**
 * ASTRA MASTER GATE Ω
 * No external dependencies. A catalog entry without executable evidence cannot PASS.
 * CLI: node scripts/astra-master-gate.mjs --task=code|content|seo|deploy|all --strict
 */
import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = process.cwd();
const args = process.argv.slice(2);
const arg = (name, fallback) => args.find(v => v.startsWith(name + "="))?.slice(name.length + 1) ?? fallback;
const task = arg("--task", "all");
const strict = args.includes("--strict");
const validTasks = new Set(["code", "content", "seo", "deploy", "all"]);
const reportFile = resolve(root, arg("--report", "artifacts/astra-master-gate/report.json"));
const configFile = resolve(root, arg("--config", "config/astra-master-site.json"));
const registryFile = resolve(root, arg("--registry", "config/astra-brick-registry.json"));
const startedAt = new Date().toISOString();
const sha256 = text => createHash("sha256").update(text).digest("hex");

function safePath(value) {
  if (!value || typeof value !== "string") throw new Error("File path is missing");
  const p = resolve(root, value);
  if (p !== root && !p.startsWith(root + "/")) throw new Error("Path escapes project root");
  return p;
}
function json(path) { return JSON.parse(readFileSync(path, "utf8")); }
function writeReport(report) {
  mkdirSync(dirname(reportFile), {recursive:true});
  writeFileSync(reportFile, JSON.stringify(report, null, 2) + "\n");
}
function checkDefinition(c) {
  if (!c || !["file", "contains", "command", "http"].includes(c.type)) throw new Error("Unknown evidence type");
  if (c.type === "file" || c.type === "contains") {
    const file = safePath(c.path);
    if (!existsSync(file) || !statSync(file).isFile()) return {type:c.type, status:"FAIL", path:c.path, reason:"missing-file"};
    if (c.type === "contains") {
      if (!Array.isArray(c.needles) || !c.needles.length || !c.needles.every(s => typeof s === "string" && s.length > 0))
        throw new Error("contains needs nonempty needles");
      const body=readFileSync(file, "utf8");
      const missing=c.needles.filter(s => !body.includes(s));
      return {type:c.type,status:missing.length?"FAIL":"WIRED",path:c.path,missing};
    }
    return {type:c.type,status:"WIRED",path:c.path};
  }
  if (c.type === "command") {
    if (!c.run || typeof c.run !== "string") throw new Error("command.run missing");
    const t=Date.now();
    const timeoutMs=Math.min(Math.max(c.timeoutMs || 90000,1000),300000);
    const run=spawnSync("bash",["-lc",c.run],{cwd:root,encoding:"utf8",timeout:timeoutMs,
      env:{...process.env,ASTRA_MASTER_GATE_ACTIVE:"1"},maxBuffer:1024*1024});
    const result={type:"command",command:c.run,status:run.status===0&&!run.error?"PASS":"FAIL",
      exitCode:run.status,durationMs:Date.now()-t,outputSha256:sha256((run.stdout||"")+(run.stderr||""))};
    if (run.error) result.error=run.error.code || run.error.message;
    return result;
  }
  if (c.type === "http") return {type:"http",status:"PENDING",url:c.url};
}
async function httpCheck(c) {
  if (typeof c.url!=="string" || !/^https:\/\//.test(c.url)) throw new Error("http URL must be HTTPS");
  const t=Date.now();
  try {
    const r=await fetch(c.url,{redirect:"follow",signal:AbortSignal.timeout(Math.min(c.timeoutMs||10000,30000))});
    const body=await r.text();
    const expected=typeof c.contains==="string" && c.contains.length>0 && body.includes(c.contains);
    return {type:"http",url:c.url,finalUrl:r.url,httpStatus:r.status,status:r.status===(c.status||200)&&expected?"PASS":"FAIL",
      durationMs:Date.now()-t,bodySha256:sha256(body),expectedContentFound:expected};
  } catch(e) {return {type:"http",url:c.url,status:"FAIL",reason:String(e?.cause?.code||e?.name||"network-error"),durationMs:Date.now()-t};}
}
async function main() {
  if (!validTasks.has(task)) throw new Error("Bad --task");
  const registry=json(registryFile), config=json(configFile);
  if (registry.schema!=="astra-brick-registry/1" || !Array.isArray(registry.bricks) || !registry.bricks.length) throw new Error("Missing registry");
  if (config.schema!=="astra-master-site/1" || !config.siteId || !Array.isArray(config.capabilities) || !config.checks || typeof config.checks!=="object") throw new Error("Invalid site configuration");
  if (registry.bricks.length < 39) throw new Error("Registry shrinkage detected: at least 39 known ASTRA bricks required");
  const core=["ASTRA_MASTER_GATE","ASTRA_BRICK_PROOF_GATE","ASTRA_NO_REPEAT","ASTRA_ZERO_COST","ASTRA_AUTOMATION_EVIDENCE"];
  for (const id of core) if (!registry.bricks.some(b => b.id===id)) throw new Error("Mandatory global brick removed: "+id);
  const signalFiles={
    seo:["config/portfolio-sites.json","scripts/generate-sitemaps.mjs","scripts/astra-semantic-flow-guard.mjs"],
    editorial:["scripts/content-quality-gate.mjs","src/lib/editorial","scripts/astra-editorial-corpus-audit.ts"],
    news:["scripts/discover-news-gate.mjs","src/lib/editorial/discover-launchpad.test.ts"],
    football:["scripts/astra-flag-guard.mjs","src/engine/official-lineups.test.ts"],
    affiliate:["scripts/astra-affiliate-conversion-guard.mjs","scripts/astra-affiliate-direct.mjs"],
    railway:["railway.json","railway.toml"],
    runtime:["scripts/serve.mjs","scripts/astra-stream-resilience-guard.mjs"]
  };
  const inferredCapabilities=Object.entries(signalFiles).filter(([, paths]) => paths.some(p=>existsSync(resolve(root,p)))).map(([cap])=>cap);
  const capabilities=new Set([...config.capabilities,...inferredCapabilities]);
  const ids=new Set(), results=[];
  for (const b of registry.bricks) {
    if (!b.id || ids.has(b.id) || !Array.isArray(b.on) || !b.scope) throw new Error("Duplicate or malformed brick ID");
    ids.add(b.id);
    const applies=(b.scope==="universal"||capabilities.has(b.scope)) &&
      (task==="all"||b.on.includes(task));
    if (!applies) { results.push({id:b.id,scope:b.scope,status:"N/A",reason:"not-applicable-to-this-task-or-site"}); continue; }
    const checks=config.checks[b.id];
    if (!Array.isArray(checks) || !checks.length) {
      results.push({id:b.id,scope:b.scope,status:"UNVERIFIED",reason:"no-proof-defined"});
      continue;
    }
    const evidence=[];
    for (const c of checks) {
      try { evidence.push(c.type==="http"?await httpCheck(c):checkDefinition(c)); }
      catch(e){ evidence.push({type:c?.type||"invalid",status:"FAIL",reason:e.message}); }
    }
    const executed=evidence.some(e=>e.type==="command"||e.type==="http");
    const failed=evidence.some(e=>e.status==="FAIL");
    const status=failed?"FAIL":executed && evidence.every(e=>e.status==="PASS"||e.status==="WIRED")?"PASS":"UNVERIFIED";
    results.push({id:b.id,scope:b.scope,status,evidence});
  }
  // Discovery: any ASTRA script outside the evidence matrix is visible and blocks PASS.
  // Exemptions require a human-readable, substantive reason: never silently ignore a brick.
  const exemptions=config.scriptExemptions && typeof config.scriptExemptions==="object" ? config.scriptExemptions : {};
  const scriptsDir=join(root,"scripts");
  const astraScripts=existsSync(scriptsDir)?readdirSync(scriptsDir,{withFileTypes:true})
    .filter(d=>d.isFile() && /^astra-.+\.(?:mjs|js|ts)$/.test(d.name) && !/\.test\./.test(d.name))
    .map(d=>"scripts/"+d.name):[];
  const evidenceBindings=JSON.stringify(config.checks);
  const untrackedScripts=astraScripts.filter(file=>{
    if(file==="scripts/astra-master-gate.mjs" || file==="scripts/astra-onboard-site.mjs") return false;
    if(evidenceBindings.includes(file)) return false;
    return !(typeof exemptions[file]==="string" && exemptions[file].trim().length>=24);
  });
  const invalidExemptions=Object.entries(exemptions).filter(([file,reason])=>!astraScripts.includes(file) || typeof reason!=="string" || reason.trim().length<24).map(([file])=>file);
  const unknownBindings=Object.keys(config.checks).filter(id=>!ids.has(id));
  const failures=results.filter(r=>r.status==="FAIL");
  const unverified=results.filter(r=>r.status==="UNVERIFIED");
  const report={schema:"astra-master-gate/report-v1",generatedAt:startedAt,siteId:config.siteId,task,strict,
    commit:process.env.GITHUB_SHA||process.env.RAILWAY_GIT_COMMIT_SHA||null,
    registrySha256:sha256(readFileSync(registryFile,"utf8")),
    siteConfigSha256:sha256(readFileSync(configFile,"utf8")),
    effectiveCapabilities:[...capabilities],inferredCapabilities,
    summary:{pass:results.filter(x=>x.status==="PASS").length,na:results.filter(x=>x.status==="N/A").length,
      fail:failures.length,unverified:unverified.length,unknownBindings:unknownBindings.length,untrackedScripts:untrackedScripts.length,invalidExemptions:invalidExemptions.length},
    status:failures.length||unverified.length||unknownBindings.length||untrackedScripts.length||invalidExemptions.length?"FAIL":"PASS",unknownBindings,untrackedScripts,invalidExemptions,results};
  writeReport(report);
  console.log("ASTRA_MASTER_GATE",JSON.stringify({siteId:report.siteId,task,status:report.status,summary:report.summary,report:relative(root,reportFile)}));
  for (const r of [...failures,...unverified]) console.error("ASTRA_UNPROVEN_BRICK",r.id,r.status,r.reason||"check-failed");
  if (unknownBindings.length) console.error("ASTRA_UNKNOWN_BINDINGS",unknownBindings.join(","));
  if (untrackedScripts.length) console.error("ASTRA_UNTRACKED_SCRIPTS",untrackedScripts.join(","));
  if (invalidExemptions.length) console.error("ASTRA_INVALID_EXEMPTIONS",invalidExemptions.join(","));
  if (strict&&report.status!=="PASS") process.exitCode=1;
}
main().catch(e=>{
  const report={schema:"astra-master-gate/report-v1",generatedAt:startedAt,task,status:"FAIL",fatal:e.message};
  writeReport(report);
  console.error("ASTRA_MASTER_GATE_FAIL",e.message);
  process.exitCode=1;
});
