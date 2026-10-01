import test from "node:test";
import assert from "node:assert/strict";
import {classifyInventory, looksLikeClone, releaseGate} from "./guard.mjs";

test("detects numbered clones", () => {
  assert.equal(looksLikeClone("betgpt-v2","betgpt"), true);
  assert.equal(looksLikeClone("betgpt-complete-v6","betgpt"), false);
});

test("exactly one canonical service passes inventory when support is declared", () => {
  const r=classifyInventory({
    canonicalService:"betgpt",
    allowedSupport:["betgpt-chat-model","betgpt-source-inspector"],
    services:[
      {name:"betgpt"},
      {name:"betgpt-chat-model"},
      {name:"betgpt-source-inspector"}
    ]
  });
  assert.equal(r.state,"PASS");
});

test("clone makes inventory partial, never false PASS", () => {
  const r=classifyInventory({
    canonicalService:"betgpt",
    services:[{name:"betgpt"},{name:"betgpt-v2"}]
  });
  assert.equal(r.state,"PARTIAL");
  assert.equal(r.clones.length,1);
});

test("release gate requires public/domain verification for full PASS", () => {
  const r=releaseGate({
    canonicalService:"betgpt",
    services:[{name:"betgpt"}],
    latestDeploymentStatus:"SUCCESS",
    healthcheckPath:"/api/health",
    sourceRepo:"Dr-starck66/zip-github",
    sourceRevisionVerified:true,
    customDomainVerified:false,
    publicRouteVerified:true
  });
  assert.equal(r.state,"PARTIAL");
});

test("release gate PASS with all evidence", () => {
  const r=releaseGate({
    canonicalService:"betgpt",
    services:[{name:"betgpt"}],
    latestDeploymentStatus:"SUCCESS",
    healthcheckPath:"/api/health",
    sourceRepo:"Dr-starck66/zip-github",
    sourceRevisionVerified:true,
    customDomainVerified:true,
    publicRouteVerified:true
  });
  assert.equal(r.state,"PASS");
});
