import test from "node:test";
import assert from "node:assert/strict";
import {audit,hashApiKey,createApiKey,hasScope,policies} from "../src/core.mjs";

test("policies",()=>assert.deepEqual(Object.keys(policies),["strict","balanced","exploratory"]));
test("unsupported certainty fails",()=>assert.equal(audit({answer:"Garanti à 100% et parfaitement validé.",evidence:""},"balanced").verdict,"FAIL"));
test("robust evidence passes",()=>assert.equal(audit({task:"PASS si tests, source et second run indépendant.",answer:"Tests validés. Red Team exécutée. Résultat reproduit sur un second run indépendant.",evidence:"https://example.com source\nPlaywright test PASS\ncommit SHA abc"},"balanced").verdict,"PASS"));
test("strict blocks missing red team",()=>assert.notEqual(audit({task:"PASS si test.",answer:"Le test passe.",evidence:"Playwright test PASS"},"strict").verdict,"PASS"));
test("api key hashes deterministically",()=>{const k=createApiKey();assert.ok(k.raw.startsWith("el_live_"));assert.equal(k.hash,hashApiKey(k.raw));assert.equal(k.hash.length,64)});
test("scope wildcard",()=>{assert.equal(hasScope(["*"],"keys:write"),true);assert.equal(hasScope(["audit:read"],"keys:write"),false)});
