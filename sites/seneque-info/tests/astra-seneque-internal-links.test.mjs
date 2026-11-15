import test from 'node:test';
import assert from 'node:assert/strict';
import { LINK_PLAN, addContextLinks } from '../astra-seneque-internal-links.mjs';
const page=(extra='')=>'<html><head><link rel="canonical" href="https://seneque.info/stoicisme-amour/"></head><main><article><h1>Article original</h1>'+extra+'</article></main></html>';
test('20 suggestions, chemins sources et destinations sûrs',()=>{
  assert.equal(LINK_PLAN.length,20);
  assert.equal(new Set(LINK_PLAN.map(([a,b])=>a+'>'+b)).size,20);
  for(const [a,b,anchor] of LINK_PLAN){ assert.match(a,/^[a-z0-9-]+$/); assert.match(b,/^[a-z0-9-]+$/); assert.ok(anchor.length>8); assert.notEqual(a,b); }
});
test('ajoute des liens seulement sur la page concernée',()=>{
  const original=page();const r=addContextLinks(original,'/stoicisme-amour/');
  assert.equal(r.applicable,2); assert.equal(r.inserted,2);
  assert.match(r.html,/href="\/venus-deesse-amour\/"/);
  assert.match(r.html,/href="\/amor-fati-signification\/"/);
  assert.ok(r.html.includes('<h1>Article original</h1>'));
  assert.ok(r.html.includes('<link rel="canonical" href="https://seneque.info/stoicisme-amour/">'));
  assert.equal(addContextLinks(page(),'/non-listed/').inserted,0);
});
test('anti-doublons pour href absolus, relatifs et deuxième passage',()=>{
  const html=page('<a href="https://seneque.info/venus-deesse-amour/">Vénus</a>');
  const r=addContextLinks(html,'/stoicisme-amour/');
  assert.equal(r.inserted,1); assert.equal(r.existing,1);
  assert.equal(addContextLinks(r.html,'/stoicisme-amour/').inserted,0);
  assert.equal((r.html.match(/href="https:\/\/seneque.info\/venus-deesse-amour\/"/g)||[]).length,1);
});
test('fail closed si absence article',()=>{
  assert.throws(()=>addContextLinks('<main>sans article</main>','/stoicisme-amour/'),/ARTICLE_MISSING/);
});
test('plan complet: 5 doublons repérés -> 15 insertions sans doublon',()=>{
  const existing=new Set([1,7,12,13,19]);
  const pages=new Map();
  for(const [from] of LINK_PLAN)if(!pages.has(from))pages.set(from,page());
  LINK_PLAN.forEach(([from,to],i)=>{if(existing.has(i))pages.set(from,pages.get(from).replace('</article>','<a href="https://seneque.info/'+to+'/">existant</a></article>'));});
  let added=0,skipped=0;
  for(const [slug,html] of pages){const r=addContextLinks(html,'/'+slug+'/');added+=r.inserted;skipped+=r.existing;assert.equal(addContextLinks(r.html,'/'+slug+'/').inserted,0);}
  assert.equal(skipped,5);assert.equal(added,15);
});
