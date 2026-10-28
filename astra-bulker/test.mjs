import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {plan,prompts,build} from './bulker.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/avocat-belgique.json',import.meta.url),'utf8'));
const clone=x=>JSON.parse(JSON.stringify(x));
test('cinq briefs distincts et canoniques correctes',()=>{
 const p=plan(fixture);assert.equal(p.briefs.length,5);assert.equal(new Set(p.briefs.map(b=>b.path)).size,5);
 assert.ok(p.briefs.every(b=>b.canonical.startsWith('https://avocat-belgique.com/guides/')));
 assert.ok(p.briefs.every(b=>b.links.length===3));assert.equal(p.publicationCount,0);
 assert.equal(prompts(p).length,5);
 assert.ok(prompts(p)[0].prompt.includes('Ne fabrique jamais de citations'));
});
test('une URL historique est protégée',()=>{
 const m=clone(fixture);m.existingPaths=['/guides/avocat-pro-deo-belgique/'];assert.throws(()=>plan(m),/EXISTING_URL_PROTECTED/);
});
test('slug en double interdit',()=>{
 const m=clone(fixture);m.topics[1].slug=m.topics[0].keyword;assert.throws(()=>plan(m),/DUPLICATE_TARGET/);
});
test('origine non HTTPS refusée',()=>{
 const m=clone(fixture);m.site.domain='http://avocat-belgique.com/';assert.throws(()=>plan(m),/SITE_ORIGIN_INVALID/);
});
test('article manquant bloque le build',()=>assert.throws(()=>build(fixture,[]),/MISSING_OR_EXTRA_PAGES/));
test('contenu non revu bloque le build',()=>{
 const m=clone(fixture);m.topics=[m.topics[0]];
 const p=plan(m).briefs[0];assert.throws(()=>build(m,[{path:p.path,title:p.title,language:'fr',type:'article',review:{approved:false}}]),/HUMAN_REVIEW_REQUIRED/);
});
test('image sans droits déclarés bloque le build',()=>{
 const m=clone(fixture);m.topics=[m.topics[0]];
 const p=plan(m).briefs[0];assert.throws(()=>build(m,[{path:p.path,title:p.title,language:'fr',type:'article',review:{approved:true,factualSpotcheck:true,reviewer:'test',date:'2026-10-28'},image:{url:'https://example.org/image.png',alt:'Image'}}]),/IMAGE_RIGHTS_MISSING/);
});
test('même avec approbation, article creux refusé par garde existant',()=>{
 const m=clone(fixture);m.topics=[m.topics[0]];
 const p=plan(m).briefs[0];assert.throws(()=>build(m,[{path:p.path,title:p.title,language:'fr',type:'article',review:{approved:true,factualSpotcheck:true,reviewer:'test',date:'2026-10-28'},sections:[{heading:'Test',paragraphs:['Trop court']}],sources:[],evidence:[]}]),/CONTENT_GUARD_FAIL/);
});
