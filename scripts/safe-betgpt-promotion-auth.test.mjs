import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const yml=readFileSync(".github/workflows/astra-safe-betgpt-promotion.yml","utf8");
const header = 'Authorization: Bearer $GH_TOKEN';
test("all GitHub REST calls in the SAFE promotion controller use Actions auth",()=>{
  assert.equal(yml.split(header).length-1,4, "two shared header arrays and two lineage curl calls must be authenticated");
  assert.equal(yml.split('GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}').length-1,3,"token injected in all three API-reading steps");
  assert.match(yml,/HDR=\(-H "Accept: application\/vnd\.github\+json"[^\\n]+-H "Authorization: Bearer \$GH_TOKEN"\)/);
});
test("GREEN release proofs and rollback restrictions remain active",()=>{
  for(const invariant of [
    '(.path | endswith("/astra-never-fail.yml"))',
    'ASTRA_RELEASE_TRAIN_NO_ROLLBACK',
    'ASTRA_RELEASE_TRAIN_BLOCKED_NON_ANCESTOR',
    'ASTRA_RELEASE_TRAIN_BLOCKED_LINEAGE_CHANGED',
    'ASTRA_BETGPT_PERSONALITY_POSTFLIGHT_PASS',
  ])assert.ok(yml.includes(invariant), "missing release invariant "+invariant);
  assert.match(yml,/cancel-in-progress: false/);
});
