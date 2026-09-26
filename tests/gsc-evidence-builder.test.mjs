import assert from 'node:assert/strict';

function normalize(raw){
  const clicks=Number(raw.clicks||0), impressions=Number(raw.impressions||0);
  return {clicks,impressions,ctr:Number.isFinite(Number(raw.ctr))?Number(raw.ctr):(impressions?clicks/impressions:0)};
}
function admissible(page){return !!(page.url&&Number(page.impressions)>0)}
function fresh(ts,hours=36){const t=Date.parse(ts||'');return Number.isFinite(t)&&(Date.now()-t)<=hours*36e5}

assert.deepEqual(normalize({clicks:10,impressions:100}),{clicks:10,impressions:100,ctr:.1});
assert.equal(admissible({url:'https://x.test/a',impressions:1}),true);
assert.equal(admissible({url:'https://x.test/a',impressions:0}),false);
assert.equal(admissible({url:'',impressions:10}),false);
assert.equal(fresh(new Date().toISOString()),true);
assert.equal(fresh(new Date(Date.now()-48*36e5).toISOString()),false);
console.log('GSC_EVIDENCE_BUILDER_TEST_PASS');
