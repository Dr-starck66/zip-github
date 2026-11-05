import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cfg=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
const rules=cfg.redirects||[];
assert.equal(rules.length,287);
const legacy=rules.filter(r=>!r.has);
assert.equal(legacy.length,286);
assert.equal(new Set(legacy.map(r=>r.source)).size,legacy.length);
const allow=new Set(['gadgets.ndtv.com','www.gadgets360.com','gadgets360.com','www.gameinformer.com','gameinformer.com','www.anglicancatholic.org.uk','store.steampowered.com','www.moneycontrol.com','www.reuters.com','www.ndtvprofit.com','www.nintendolife.com']);
const paths=new Map(legacy.map(r=>[r.source,r]));
let pairs=0;
for(const r of legacy){
  assert.equal(r.statusCode,301);
  assert.match(r.source,/^\/[a-zA-Z0-9_./%-]+\/?$/);
  const u=new URL(r.destination);
  assert.equal(u.protocol,'https:');
  assert.ok(allow.has(u.hostname));
  assert.equal(u.username,'');
  assert.equal(u.password,'');
  if(r.source.endsWith('/')){
    const other=paths.get(r.source.slice(0,-1));
    assert.ok(other,'slashless historical variant missing '+r.source);
    assert.equal(other.destination,r.destination);
    pairs++;
  }
}
assert.equal(pairs,143);
assert.equal(rules.at(-1).source,'/:path*');
assert.equal(rules.at(-1).has?.[0]?.value,'www.gamicnews.com');
assert.equal(rules.at(-1).destination,'https://gamicnews.com/:path*');
assert.equal(rules.at(-1).statusCode,301);
assert(!legacy.some(r=>r.source==='/'||r.source.startsWith('/news/')||r.source==='/astra-negative-control-no-redirect'));
const page=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.match(page,/<h1>Latest technology and gaming news<\/h1>/i);
assert.equal([...page.matchAll(/<h1(?:\s|>)/g)].length,1);
console.log('PASS: 143 old URL pairs, 286 permanent 301, canonical www, home H1, negative control');
