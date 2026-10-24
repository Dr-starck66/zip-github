#!/usr/bin/env node
/**
 * Validates reusable evidence produced by BetGPT's immutable upstream CI run.
 * This is a SOURCE-CI proof ONLY, never a Railway or live HTTP publication proof.
 * Hard-fails on stale/missing run, non-GREEN job, missing upstream executable
 * bindings, or a broken mandatory candidate->prebuild->gate chain.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const BRICKS = Object.freeze({
  ASTRA_NO_REPEAT: /astra-no-repeat-guard\.mjs/,
  ASTRA_ZERO_COST: /astra-zero-cost-guard\.mjs/,
  ASTRA_TARDIGRADE: /astra-stream-resilience-guard\.mjs/,
  ASTRA_TRUE_LINEUPS: /test:lineups/,
  ASTRA_FLAG_GUARD: /astra-flag-guard\.mjs/,
  ASTRA_ODDS_TRUTH: /test:odds-truth/,
  ASTRA_ROI_LEDGER: /test:roi5-gate/,
  ASTRA_OPTIMIZER_OMEGA: /astra-semantic-flow-autorepair\.test\.mjs.+astra-seo-self-heal\.test\.mjs/,
  ASTRA_NEWS_ELIGIBILITY: /source-integrity\.test\.ts.+discover-launchpad\.test\.ts/
});
const SRC = "Dr-starck66/betgpt-railway";
const err = (p) => {throw new Error("ASTRA_SOURCE_PROOF_FAIL " + p);};
const insist = (p, why) => {if (!p) err(why);};
const isSha = (s) => typeof s === "string" && /^[a-f0-9]{40}$/.test(s);
const digest = (s) => createHash("sha256").update(s).digest("hex");
function verifyAttestation({ marker, manifest, run, jobs, site, build, pkg, runner, required }) {
  insist(marker.schema === "astra-green-release/v2", "invalid-release-schema");
  insist(marker.sourceRepo === SRC && manifest.sourceRepo === SRC, "unexpected-source-repository");
  insist(isSha(marker.sourceSha) && marker.sourceSha === manifest.sourceSha, "sha-mismatch");
  insist(marker.promotionKey === SRC + "@" + marker.sourceSha &&
    manifest.promotionKey === marker.promotionKey, "promotion-key-mismatch");
  insist(marker.greenVerified === true && marker.lineageVerified === true &&
    marker.monotonicVerified === true && manifest.policy?.immutableShaOnly === true, "source-not-authorized");
  insist(marker.gateWorkflow === "astra-never-fail.yml" &&
    Number.isSafeInteger(marker.workflowRunId) && marker.workflowRunId > 0, "invalid-run-binding");
  insist(run.id === marker.workflowRunId && run.head_sha === marker.sourceSha &&
    run.status === "completed" && run.conclusion === "success" &&
    run.path === ".github/workflows/astra-never-fail.yml" &&
    run.repository?.full_name === SRC && run.head_repository?.full_name === SRC, "upstream-run-not-green-for-sha");
  insist(Array.isArray(jobs.jobs) && jobs.jobs.some((j) =>
    j.name === "Candidate gate" && j.conclusion === "success" &&
    j.steps?.some((s) => s.name === "Run immutable candidate gate" && s.conclusion === "success") &&
    j.steps?.some((s) => s.name === "Confirm GREEN candidate" && s.conclusion === "success")
  ), "immutable-candidate-job-not-green");
  insist(site.schema === "astra-master-site/1" && site.siteId === "betgpt.live", "upstream-site-config-invalid");
  insist(pkg.scripts?.["release:candidate"] === "node scripts/astra-never-fail-build-guard.mjs" &&
    pkg.scripts?.prebuild?.includes("node scripts/astra-master-gate.mjs --task=code"), "upstream-master-gate-not-wired");
  insist(build.requiredChecks?.some((c) => c.id === "prebuild-guards" && c.command === "npm run prebuild") &&
    build.requiredChecks?.some((c) => c.id === "production-bundle" && c.command === "npm run build") &&
    build.requiredChecks?.some((c) => c.id === "stream-resilience" && c.command === "npm run guard:stream-resilience"),
    "mandatory-candidate-checks-not-wired");
  insist(runner.includes("no-proof-defined") && runner.includes('status:"UNVERIFIED"') &&
    runner.includes("checkDefinition(c)") && runner.includes("process.exitCode=1"),
    "upstream-proof-gate-disabled");
  insist(required.includes("ASTRA_NEVER_FAIL_PROMOTION_BLOCKED") &&
    required.includes("process.exit(78)") && required.includes('report.status = "GREEN"'),
    "candidate-gate-not-fail-closed");
  for (const [brick, re] of Object.entries(BRICKS)) {
    const checks = site.checks?.[brick];
    insist(Array.isArray(checks) && checks.some((c) => c.type === "command" &&
      typeof c.run === "string" && re.test(c.run)), "missing-executable-upstream-proof:" + brick);
  }
  return {
    scope: "SOURCE_CI_ONLY", sourceSha: marker.sourceSha,
    upstreamRunId: marker.workflowRunId, upstreamJob: "Candidate gate",
    brickBindings: Object.keys(BRICKS), sourceSite: site.siteId
  };
}
async function getJson(url) {
  const r = await fetch(url, {headers: {"Accept":"application/vnd.github+json","User-Agent":"ASTRA-Immutable-Proof/1"},
    signal:AbortSignal.timeout(15000)});
  if (!r.ok) err("http-" + r.status + ":" + new URL(url).pathname);
  return r.json();
}
async function getSource(ref, file, json = true) {
  const r = await fetch("https://raw.githubusercontent.com/" + SRC + "/" + ref + "/" + file,
    {headers: {"User-Agent":"ASTRA-Immutable-Proof/1"},signal:AbortSignal.timeout(15000)});
  if (!r.ok) err("upstream-source-http-" + r.status + ":" + file);
  const t = await r.text();
  return json ? JSON.parse(t) : t;
}
async function main() {
  const requested = process.argv.find((a) => a.startsWith("--brick="))?.slice(8);
  insist(Object.hasOwn(BRICKS, requested || ""), "unknown-brick");
  const marker = JSON.parse(fs.readFileSync("betgpt-railway-live/.astra-green-release.json","utf8"));
  const manifest = JSON.parse(fs.readFileSync("betgpt-railway-live/source-manifest.json","utf8"));
  insist(isSha(marker.sourceSha), "invalid-sha");
  insist(Number.isSafeInteger(marker.workflowRunId) && marker.workflowRunId > 0, "invalid-run-id");
  const [run, jobs, site, build, pkg, runner, required] = await Promise.all([
    getJson("https://api.github.com/repos/" + SRC + "/actions/runs/" + marker.workflowRunId),
    getJson("https://api.github.com/repos/" + SRC + "/actions/runs/" + marker.workflowRunId + "/jobs"),
    getSource(marker.sourceSha, "config/astra-master-site.json"),
    getSource(marker.sourceSha, "config/astra-never-fail-build-guard.json"),
    getSource(marker.sourceSha, "package.json"),
    getSource(marker.sourceSha, "scripts/astra-master-gate.mjs", false),
    getSource(marker.sourceSha, "scripts/astra-never-fail-build-guard.mjs", false)
  ]);
  const att = verifyAttestation({marker,manifest,run,jobs,site,build,pkg,runner,required});
  const reportDir = "artifacts/astra-master-gate";
  fs.mkdirSync(reportDir,{recursive:true});
  const reportFile=path.join(reportDir,"upstream-source-proof.json");
  let report={schema:"astra-immutable-source-proof/v1",scope:"SOURCE_CI_ONLY",
    sourceSha:att.sourceSha,upstreamRunId:att.upstreamRunId,gitCommit:process.env.GITHUB_SHA||null,results:{}};
  if (fs.existsSync(reportFile)) {
    const previous=JSON.parse(fs.readFileSync(reportFile,"utf8"));
    if(previous.sourceSha===report.sourceSha && previous.upstreamRunId===report.upstreamRunId &&
      previous.gitCommit===report.gitCommit) report=previous;
  }
  report.results[requested]={status:"PASS",kind:"immutable-upstream-run-and-executable-binding",
    sourceConfigSha256:digest(JSON.stringify(site)),verifiedAt:new Date().toISOString()};
  fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+"\n");
  console.log("ASTRA_SOURCE_PROOF_PASS brick="+requested+" sha="+att.sourceSha+
    " run="+att.upstreamRunId+" scope=SOURCE_CI_ONLY (not Railway or public publication)");
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {console.error(e.message);process.exitCode=1;});
}
export {BRICKS, verifyAttestation};
