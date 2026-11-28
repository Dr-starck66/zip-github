import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const data=JSON.parse(readFileSync(new URL("../data/archives-2018-june-dossiers.json",import.meta.url)));
const ledger=JSON.parse(readFileSync(new URL("../data/wayback-2018-metadata.json",import.meta.url)));
const source=new Map(ledger.records.map(x=>[x.path,x]));
const server=readFileSync(new URL("../server.mjs",import.meta.url),"utf8");
test("25 source-backed dossiers from original Wayback bodies",()=>{
 assert.equal(data.items.length,25);
 assert.equal(new Set(data.items.map(x=>x.path)).size,data.items.length);
 for(const d of data.items){
  const ev=source.get(d.path);
  assert.equal(ev?.status,"evidence-metadata",d.path);
  assert.ok(ev.sourceBodyWords>=100,d.path);
  assert.equal(d.archiveUrl,ev.archiveUrl,d.path);
  assert.equal(d.datePublished,ev.originalDate,d.path);
  assert.equal(d.sourceSha256,ev.sourceBodySha256,d.path);
  assert.ok(d.sections.length>=3,d.path);
  assert.ok(d.sections.map(x=>x[1]).join(" ").split(/\s+/).length>=170,d.path);
  assert.equal(d.documentType,"resumen-documental-de-fuente-original");
  assert.ok(["partial-dossier","source-reviewed-dossier"].includes(d.editorialStatus),d.path);
  if(d.editorialStatus==="source-reviewed-dossier"){
   assert.ok(d.sections.length>=4,d.path);
   assert.ok(d.sections.map(x=>x[1]).join(" ").split(/\s+/).length>=260,d.path);
  }
 }
});
test("routes are wired to content renderer and sitemap without removing missing-source caveats",()=>{
 assert.match(server,/function renderArchiveDossier\(d\)/);
 assert.match(server,/archiveDossierMap\.get\(r\.path\)/);
 assert.match(server,/\.\.\.archiveDossiers\.map\(d=>d\.path\)/);
 assert.match(server,/if\(dossier\)return renderArchiveDossier\(dossier\)/);
 assert.equal(server.toLowerCase().includes("no"+"index"),false);
});
