import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const audit=JSON.parse(readFileSync(new URL("../data/wayback-2018-nine-audit.json",import.meta.url),"utf8"));
const ledger=JSON.parse(readFileSync(new URL("../data/wayback-2018-metadata.json",import.meta.url),"utf8"));
const existing=new Map(ledger.records.map(x=>[x.path,x]));
test("All nine unverified originals have independently recorded, non-inflated evidence",()=>{
 const bad=ledger.records.filter(x=>x.status!=="evidence-metadata");
 assert.equal(ledger.records.length,259);
 assert.equal(new Set(ledger.records.map(x=>x.path)).size,259);
 assert.equal(bad.length,audit.rows.length);
 assert.equal(new Set(audit.rows.map(x=>x.path)).size,9);
 assert.equal(audit.status,"PARTIAL");
 for(const row of audit.rows){
  const source=existing.get(row.path);
  assert.ok(source,row.path);
  assert.equal(source.status,"capture-incomplete",row.path);
  assert.equal(row.waybackCaptureStatus,source.status,row.path);
  assert.equal(row.originalPublicationDateFromWayback,source.originalDate,row.path);
  assert.equal(row.fullOriginalBodyVerified,false,row.path);
  assert.equal(row.alternativeWaybackCaptureVerified,false,row.path);
  assert.ok(row.note?.length>40,row.path);
  if(row.externalUrl)assert.match(row.externalUrl,/^https:\/\//);
  else assert.equal(row.evidenceType,"unverified");
 }
});
test("Cross-source publications cannot satisfy a Wayback original-body gate",()=>{
 assert.equal(ledger.records.filter(x=>x.status==="evidence-metadata").length,250);
 assert.equal(audit.rows.filter(x=>x.fullOriginalBodyVerified).length,0);
 assert.equal(audit.rows.filter(x=>x.alternativeWaybackCaptureVerified).length,0);
 assert.equal(audit.rows.filter(x=>x.independentPublicationDate!==null).length,8);
});
