import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const p=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../vercel.json');
const config=JSON.parse(fs.readFileSync(p,'utf8'));
const rules=config.redirects||[];
assert.equal(rules.length,144,'legacy mappings plus canonical host');
const legacy=rules.filter(r=>!r.has);
assert.equal(legacy.length,143);
assert.equal(new Set(legacy.map(r=>r.source)).size,legacy.length);
const allow=new Set(['gadgets.ndtv.com','www.gadgets360.com','gadgets360.com','www.gameinformer.com','gameinformer.com','www.anglicancatholic.org.uk','store.steampowered.com','www.moneycontrol.com','www.reuters.com','www.ndtvprofit.com','www.nintendolife.com']);
for(const r of legacy){
  assert.equal(r.statusCode,301);
  assert.match(r.source,/^\/[a-zA-Z0-9_./%-]+\/?$/);
  const u=new URL(r.destination);
  assert.equal(u.protocol,'https:');
  assert.ok(allow.has(u.hostname));
  assert.equal(u.username,'');
  assert.equal(u.password,'');
}
assert.equal(rules.at(-1).source,'/:path*');
assert.equal(rules.at(-1).has?.[0]?.value,'www.gamicnews.com');
assert.equal(rules.at(-1).destination,'https://gamicnews.com/:path*');
assert.equal(rules.at(-1).statusCode,301);
assert(!legacy.some(r=>r.source==='/'||r.source==='/news/passkeys-in-2026-passwords-are-losing-ground'||r.source==='/astra-negative-control-no-redirect'));
console.log('PASS: 143 exact verified legacy 301 redirects, canonical www 301, known article safe, negative control safe');
