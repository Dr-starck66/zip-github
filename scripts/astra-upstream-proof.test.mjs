import test from "node:test";
import assert from "node:assert/strict";
import {BRICKS,verifyAttestation} from "./astra-upstream-proof.mjs";
const sha="a".repeat(40),runId=12345;
function fixture() {
  const marker={schema:"astra-green-release/v2",sourceRepo:"Dr-starck66/betgpt-railway",sourceSha:sha,
    promotionKey:"Dr-starck66/betgpt-railway@"+sha,greenVerified:true,lineageVerified:true,
    monotonicVerified:true,gateWorkflow:"astra-never-fail.yml",workflowRunId:runId};
  const manifest={sourceRepo:marker.sourceRepo,sourceSha:sha,promotionKey:marker.promotionKey,policy:{immutableShaOnly:true}};
  const run={id:runId,head_sha:sha,status:"completed",conclusion:"success",
    path:".github/workflows/astra-never-fail.yml",repository:{full_name:marker.sourceRepo},
    head_repository:{full_name:marker.sourceRepo}};
  const jobs={jobs:[{name:"Candidate gate",conclusion:"success",steps:[
    {name:"Run immutable candidate gate",conclusion:"success"},
    {name:"Confirm GREEN candidate",conclusion:"success"}]}]};
  const strings={ASTRA_NO_REPEAT:"astra-no-repeat-guard.mjs",ASTRA_ZERO_COST:"astra-zero-cost-guard.mjs",
    ASTRA_TARDIGRADE:"astra-stream-resilience-guard.mjs",ASTRA_TRUE_LINEUPS:"npm run test:lineups",
    ASTRA_FLAG_GUARD:"astra-flag-guard.mjs",ASTRA_ODDS_TRUTH:"test:odds-truth",
    ASTRA_ROI_LEDGER:"test:roi5-gate",
    ASTRA_OPTIMIZER_OMEGA:"astra-semantic-flow-autorepair.test.mjs scripts/astra-seo-self-heal.test.mjs",
    ASTRA_NEWS_ELIGIBILITY:"source-integrity.test.ts src/lib/editorial/discover-launchpad.test.ts"};
  const site={schema:"astra-master-site/1",siteId:"betgpt.live",
    checks:Object.fromEntries(Object.entries(strings).map(([id,run])=>[id,[{type:"command",run}]]))};
  const build={requiredChecks:[{id:"prebuild-guards",command:"npm run prebuild"},
    {id:"production-bundle",command:"npm run build"},
    {id:"stream-resilience",command:"npm run guard:stream-resilience"}]};
  const pkg={scripts:{"release:candidate":"node scripts/astra-never-fail-build-guard.mjs",
    prebuild:"node scripts/astra-master-gate.mjs --task=code"}};
  return {marker,manifest,run,jobs,site,build,pkg,
    runner:'no-proof-defined status:"UNVERIFIED" checkDefinition(c) process.exitCode=1',
    required:'ASTRA_NEVER_FAIL_PROMOTION_BLOCKED process.exit(78) report.status = "GREEN"'};
}
test("all nine immutable source-CI bindings are audited",()=>{
  assert.equal(Object.keys(BRICKS).length,9);
  assert.equal(verifyAttestation(fixture()).brickBindings.length,9);
});
test("mismatched SHA never passes",()=>{
  const f=fixture();f.run.head_sha="b".repeat(40);
  assert.throws(()=>verifyAttestation(f),/upstream-run-not-green-for-sha/);
});
test("a GREEN label with failed candidate job is rejected",()=>{
  const f=fixture();f.jobs.jobs[0].steps[0].conclusion="failure";
  assert.throws(()=>verifyAttestation(f),/immutable-candidate-job-not-green/);
});
test("missing brick command is rejected",()=>{
  const f=fixture();delete f.site.checks.ASTRA_NEWS_ELIGIBILITY;
  assert.throws(()=>verifyAttestation(f),/missing-executable-upstream-proof:ASTRA_NEWS_ELIGIBILITY/);
});
test("a no-op or missing mandatory build is rejected",()=>{
  const f=fixture();f.build.requiredChecks[1].command="echo GREEN";
  assert.throws(()=>verifyAttestation(f),/mandatory-candidate-checks-not-wired/);
});
test("disabled upstream strict failure mechanism is rejected",()=>{
  const f=fixture();f.runner="no-proof-defined";
  assert.throws(()=>verifyAttestation(f),/upstream-proof-gate-disabled/);
});
