import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const pkg=JSON.parse(readFileSync(new URL("../package.json",import.meta.url),"utf8"));
const workflow=readFileSync(new URL("../../.github/workflows/astra-zero-cost.yml",import.meta.url),"utf8");
test("Local app has no paid-API SDK or hosted subscription dependency",()=>{
  assert.deepEqual(Object.keys(pkg.dependencies||{}).sort(),["sharp"]);
  assert.equal(Object.keys(pkg.optionalDependencies||{}).length,0);
  assert.equal(Object.keys(pkg.peerDependencies||{}).length,0);
  assert.equal(pkg.private,true);
});
test("Independent shared zero-extra-spend guard is wired into push and PR CI",()=>{
  assert.match(workflow,/ASTRA ZERO-COST GUARD/);
  assert.match(workflow,/pull_request:/);
  assert.match(workflow,/push:/);
  assert.match(workflow,/astra-zero-cost-reusable\.yml/);
});
