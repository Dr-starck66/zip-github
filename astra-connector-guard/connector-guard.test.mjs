import test from "node:test";
import assert from "node:assert/strict";
import {withConnectorGuard,classifyError} from "./connector-guard.mjs";

test("PASS requires verification",async()=>{
  const r=await withConnectorGuard({
    connector:"railway",
    primary:{
      name:"native",
      authProbe:async()=>true,
      scopeProbe:async()=>true,
      action:async()=>({id:"ok"}),
      verify:async v=>({ok:v.id==="ok"})
    }
  });
  assert.equal(r.state,"PASS");
});

test("transient retry recovers",async()=>{
  let n=0;
  const r=await withConnectorGuard({
    retryBaseMs:1,
    primary:{
      name:"native",
      authProbe:async()=>{n++;if(n===1){const e=new Error("timeout");e.code="ETIMEDOUT";throw e;}return true;},
      action:async()=>true,
      verify:async()=>true
    }
  });
  assert.equal(r.state,"PASS");
  assert.equal(n,2);
});

test("auth failure falls back",async()=>{
  const e=new Error("login required");e.status=401;
  const r=await withConnectorGuard({
    primary:{name:"native",authProbe:async()=>{throw e;},action:async()=>0,verify:async()=>true},
    fallbacks:[{name:"provider-api",authProbe:async()=>true,action:async()=>1,verify:async()=>true}]
  });
  assert.equal(r.state,"PASS");
  assert.equal(r.route,"provider-api");
});

test("unverified mutation never becomes PASS",async()=>{
  const r=await withConnectorGuard({
    safeToReplay:false,
    primary:{name:"native",authProbe:async()=>true,action:async()=>({changed:true}),verify:async()=>false}
  });
  assert.equal(r.state,"PARTIAL");
});

test("all auth routes failing requires user auth",async()=>{
  const bad=()=>{const e=new Error("token expired");e.status=401;return e;};
  const route=name=>({name,authProbe:async()=>{throw bad();},action:async()=>0,verify:async()=>true});
  const r=await withConnectorGuard({primary:route("a"),fallbacks:[route("b")]});
  assert.equal(r.state,"FAIL");
  assert.equal(r.needsUserAuth,true);
});

test("classifier distinguishes auth/transient",()=>{
  const a=new Error("unauthorized");a.status=401;
  const n=new Error("network timeout");n.code="ETIMEDOUT";
  assert.equal(classifyError(a).category,"auth");
  assert.equal(classifyError(n).category,"transient");
});
