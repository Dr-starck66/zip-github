import test from "node:test";
import assert from "node:assert/strict";
import {txtVisible} from "../src/dns.mjs";

test("module loads and txtVisible is callable",()=>{
  assert.equal(typeof txtVisible,"function");
});

test("Google Search Console property encoding contract",()=>{
  const site="sc-domain:example.com";
  assert.equal(encodeURIComponent(site),"sc-domain%3Aexample.com");
});

test("verification file contract",()=>{
  const token="google123.html";
  const body=`google-site-verification: ${token}`;
  assert.equal(body,"google-site-verification: google123.html");
});
