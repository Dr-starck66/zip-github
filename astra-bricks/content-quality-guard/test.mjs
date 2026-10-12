import assert from "node:assert/strict";
import {test} from "node:test";
import {auditCorpus,checkOne,adaptCibaoContent} from "./quality.mjs";
const sourceURLs=["https://agricultura.gob.do/noticia/constanza","https://ambiente.gob.do/parque-valle-nuevo/","https://presidencia.gob.do/noticias/carretera-constanza"];
const subjects=[
 {h:"Cultivos del valle y zonas de produccion",details:"El valle contiene fincas de papa, zanahoria y lechuga. Los productores organizan la siembra, seleccionan semillas y dependen del agua para mantener la actividad horticola en distintas temporadas.",fact:"Las fincas de papa y zanahoria dependen del agua del valle"},
 {h:"Aguas Blancas y su acceso por montana",details:"La cascada Aguas Blancas constituye un destino conocido por el paisaje boscoso y las temperaturas frescas. El estado de la carretera no puede deducirse de una fotografia antigua, porque las tormentas alteran los accesos.",fact:"El Salto de Aguas Blancas presenta paisaje boscoso y temperaturas frescas"},
 {h:"Valle Nuevo, pinos y conservacion",details:"El parque nacional de Valle Nuevo conserva ecosistemas de montana, nacimientos hidricos y una vegetacion singular. Los senderistas deben respetar las zonas autorizadas y los avisos de las autoridades responsables.",fact:"El parque nacional de Valle Nuevo conserva ecosistemas de montana"},
 {h:"Las Piramides y memoria de caminos",details:"Las Piramides se encuentran en el entorno de Valle Nuevo. Su presencia recuerda las conexiones terrestres historicas entre poblaciones de montana, cuya mejora modifico las oportunidades para los residentes.",fact:"Las Piramides se encuentran en el entorno de Valle Nuevo"},
 {h:"Tireo, La Culata y economia agricola",details:"Las comunidades de Tireo y La Culata tienen relacion con la produccion agricola del municipio. El comercio de productos del campo implica labores de cosecha, clasificacion y transporte a otros mercados.",fact:"Las comunidades de Tireo y La Culata tienen relacion con la produccion agricola"},
 {h:"Historia y patrimonio de Constanza",details:"El municipio de Constanza pertenece a la provincia de La Vega. Las instituciones locales cuentan su historia administrativa, las migraciones agricolas y las conexiones con otras poblaciones de la Cordillera Central.",fact:"El municipio de Constanza pertenece a la provincia de La Vega"},
];
function makePage(){
 const sections=subjects.map((s,i)=>({heading:s.h,paragraphs:Array.from({length:5},(_,k)=>
   s.details+" "+["Los visitantes pueden conocer los lugares con informacion local comprobada. ","El contexto de la comarca ayuda a diferenciar estos sectores geograficos. ","Esta actividad tiene actores concretos y relaciones locales que merecen una explicacion. ","El acceso responsable requiere conocer las condiciones de terreno de cada comunidad. ","La interpretacion exige contrastar testimonios y documentación municipal. "][k]+
   ["El cultivo y el paisaje se presentan sin inventar precios o rendimientos.","La montaña merece consejos concretos sin prometer horarios de acceso.","Las áreas protegidas no deben confundirse con servicios comerciales.","La historia de los caminos se explica con documentos identificables.","La actividad rural depende de infraestructura y de cadenas logísticas.","La memoria municipal se separa de la promoción turística."][i]+" "+
   "Este capítulo se centra en "+s.h.toLowerCase()+" dentro de Constanza, provincia La Vega, y explica la relación de este lugar con la vida cotidiana del municipio."
 ))}));
 const sources=sourceURLs.map((url,i)=>({title:["Ministerio de Agricultura","Ministerio de Medio Ambiente","Presidencia"][i],url}));
 const evidence=subjects.map((s,i)=>({claim:s.fact,sourceUrl:sourceURLs[i%3],sourceLocator:"sección "+s.h+" · comprobación editorial"}));
 // Claims must appear verbatim in actual text.
 for(let i=0;i<subjects.length;i++)sections[i].paragraphs[0]+=" "+subjects[i].fact+".";
 return {path:"/constanza/",title:"Constanza: agricultura, montaña, turismo y actualidad",type:"guide",
  language:"es",factAsOf:"2026-10-12",
  sections,description:"Guía sobre agricultura y turismo de Constanza",
  sources,evidence,review:{approved:true,reviewer:"Test editor",date:"2026-10-12",factualSpotcheck:true},changed:true};
}
const valid=makePage();
const mutate=fn=>{const x=structuredClone(valid);fn(x);return x};
test("real editorial guide baseline with multiple sections, 1500 words and linked factual evidence passes",()=>{
 const r=checkOne(valid);assert.equal(r.status,"PASS",JSON.stringify(r.issues));
 assert.ok(r.words>=1500);
});
test("Google/SEO self-reference padding is blocked in Spanish, French and English",()=>{
 for(const bad of ["Reconstrucción SEO con un estándar mínimo de calidad","Quelles informations changent et lesquelles doivent rester constantes","This page is designed to increase organic traffic and keyword density"]){
  const x=mutate(p=>{p.sections[0].paragraphs[0]+=" "+bad});
  assert.ok(checkOne(x).issues.some(i=>i.code==="EDITORIAL_OR_SEO_FILLER"),bad);
 }
});
test("repeated generic headers across different local guides rejected",()=>{
 const copy=structuredClone(valid);
 copy.path="/jarabacoa/";
 const another=structuredClone(valid);another.path="/la-vega/";
 const third=structuredClone(valid);third.path="/santiago/";
 const result=checkOne(valid,[copy,another,third]);
 assert.ok(result.issues.some(i=>i.code==="REPEATED_HEADING"));
});
test("long identical paragraphs on separate pages are rejected",()=>{
 const other=makePage();other.path="/la-vega/";
 // Even one long shared paragraph is a blocker.
 assert.ok(checkOne(valid,[other]).issues.some(i=>i.code==="CROSS_PAGE_COPY"));
});
test("duplicate paragraphs inside page get rejected even at 1500+ words",()=>{
 const x=mutate(p=>p.sections[0].paragraphs.push(p.sections[0].paragraphs[0]));
 assert.ok(checkOne(x).issues.some(i=>i.code==="DUPLICATED_PARAGRAPH"));
});
test("long but no fact evidence, fake links, or unreviewed article must fail",()=>{
 for(const changed of [
  p=>{p.evidence=[]},p=>{p.review.approved=false},p=>{p.sources=[]},
  p=>{p.evidence[0].sourceUrl="https://unknown.example/evidence"},p=>{p.evidence[1].sourceLocator=""},
 ]){
  const x=mutate(changed);assert.equal(checkOne(x).status,"FAIL");
 }
});
test("manual reviewer approval cannot be replaced by keyword stuffing",()=>{
 const x=mutate(p=>{p.review={approved:false};p.sections[0].paragraphs[0]+=" Constanza ".repeat(250)});
 assert.ok(checkOne(x).issues.some(i=>i.code==="EDITORIAL_REVIEW_MISSING"));
});
test("topicless content fails when actual title entities absent",()=>{
 const x=mutate(p=>{p.title="Arqueologia romana en Pompeya antigua";});
 assert.ok(checkOne(x).issues.some(i=>i.code==="OFF_TOPIC"));
});
test("short editorial article fails long-form proof but short policy page can pass structure gate",()=>{
 const x=mutate(p=>{p.sections=[{heading:"Historia de Constanza",paragraphs:["Constanza tiene un valle de montana y campos de cultivo."]}];});
 assert.ok(checkOne(x).issues.some(i=>i.code==="THIN_SUBSTANCE"));
});
test("cross-site rollout audits old pages without mass noindex; changed pages block",()=>{
 const old=mutate(p=>{p.path="/legacy/";p.sections=p.sections.slice(0,1);p.changed=false;});
 const c=auditCorpus([old],{enforce:"changed"});
 assert.equal(c.status,"PARTIAL");assert.deepEqual(c.releaseBlockers,[]);
 old.changed=true;
 assert.deepEqual(auditCorpus([old],{enforce:"changed"}).releaseBlockers,["/legacy/"]);
});
test("production Cibao format adapter enumerates guide and news",()=>{
 const p=adaptCibaoContent({pages:[{p:"/constanza/",t:"Constanza",b:[],sections:[],a:false}],currentNews:[{path:"/news/",title:"News"}]},["/news/"]);
 assert.equal(p.length,2);assert.equal(p[0].changed,false);assert.equal(p[1].changed,true);
});
