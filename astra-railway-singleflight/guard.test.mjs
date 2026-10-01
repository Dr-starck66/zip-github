import test from "node:test";
import assert from "node:assert/strict";
import {classifyInventory, looksLikeClone, releaseGate, detectDomainState} from "./guard.mjs";

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

test("domain guard detects stuck/orphaned claim pattern and forbids blind retry", () => {
  const r=detectDomainState({
    expectedDomain:"betgpt.live",
    listedCustomDomains:[],
    createAttempt:{
      attempted:true,
      success:false,
      error:"Failed to create custom domain, please try again"
    }
  });
  assert.equal(r.state,"CLAIM_STUCK_SUSPECTED");
  assert.equal(r.retry,false);
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
    publicRouteVerified:true,
    domainState:{state:"MISSING"}
  });
  assert.equal(r.state,"PARTIAL");
});

test("stuck domain claim keeps release PARTIAL", () => {
  const r=releaseGate({
    canonicalService:"betgpt",
    services:[{name:"betgpt"}],
    latestDeploymentStatus:"SUCCESS",
    healthcheckPath:"/api/health",
    sourceRepo:"Dr-starck66/zip-github",
    sourceRevisionVerified:true,
    customDomainVerified:false,
    publicRouteVerified:true,
    domainState:{state:"CLAIM_STUCK_SUSPECTED"}
  });
  assert.equal(r.state,"PARTIAL");
  assert.equal(r.checks.noStuckDomainClaim,false);
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
    publicRouteVerified:true,
    domainState:{state:"ATTACHED"}
  });
  assert.equal(r.state,"PASS");
});


test("verified ROUTER_ONLY alias can satisfy domain gate", () => {
  const r=releaseGate({
    canonicalService:"betgpt",
    services:[{name:"betgpt"}],
    latestDeploymentStatus:"SUCCESS",
    healthcheckPath:"/api/health",
    sourceRepo:"Dr-starck66/zip-github",
    sourceRevisionVerified:true,
    customDomainVerified:false,
    verifiedAlias:true,
    aliasMode:"ROUTER_ONLY",
    publicRouteVerified:true,
    domainState:{state:"ATTACHED_VIA_ALIAS"}
  });
  assert.equal(r.state,"PASS");
});

test("verified alias must be routing-only", () => {
  const r=releaseGate({
    canonicalService:"betgpt",
    services:[{name:"betgpt"}],
    latestDeploymentStatus:"SUCCESS",
    healthcheckPath:"/api/health",
    sourceRepo:"Dr-starck66/zip-github",
    sourceRevisionVerified:true,
    verifiedAlias:true,
    aliasMode:"SECOND_APP_SOURCE",
    publicRouteVerified:true,
    domainState:{state:"ATTACHED_VIA_ALIAS"}
  });
  assert.equal(r.state,"PARTIAL");
});
