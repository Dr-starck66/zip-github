import assert from "node:assert/strict";
import {seoFilename,slugifyImage,assessImage,renderFigure,auditManifest,imageObject,imageMeta,checkRights} from "./index.mjs";
assert.equal(slugifyImage("Monumento à Santiago de los Caballeros"),"monumento-a-santiago-de-los-caballeros");
assert.equal(seoFilename("Monumento de los Heroes",{place:"Santiago",ext:"webp"}),"monumento-de-los-heroes-santiago.webp");
assert.throws(()=>seoFilename("image"),/descriptive/);
const page={path:"/santiago/",title:"Santiago de los Caballeros"};
const valid={path:"/images/monumento-heroes-restauracion-santiago.webp",width:1600,height:900,bytes:160000,mime:"image/webp",alt:"Monumento a los Héroes de la Restauración iluminado en Santiago de los Caballeros",caption:"Vista contemporánea del monumento; no fotografía de 2018.",source:{type:"commons",filePage:"https://commons.wikimedia.org/wiki/File:Example.jpg",licenseEvidenceUrl:"https://commons.wikimedia.org/wiki/File:Example.jpg",checkedAt:"2026-10-12",license:"CC0",author:"Example photographer"},editorial:{reviewed:true,exactSubjectMatch:true,placeMatch:true,nonStockGeneric:true,isModernPhoto:true,modernContextDeclared:true,depictsHistoricalEvent:false}};
const copy=()=>structuredClone(valid);
const result=assessImage(page,valid);
assert.equal(result.status,"PASS",JSON.stringify(result));
assert.ok(result.score>=85);
assert.equal(renderFigure(page,valid,{hero:true}).result.status,"PASS");
assert.match(renderFigure(page,valid).html,/loading="lazy"/);
assert.match(imageMeta("https://example.org",valid),/og:image/);
assert.equal(imageObject("https://example.org",valid).width,1600);
for(const [mutator,expected] of [
 [x=>{x.source.license="all-rights-reserved"},"RIGHTS"],
 [x=>{x.editorial.reviewed=false},"human editorial"],
 [x=>{x.path="/images/image1.webp"},"filename"],
 [x=>{x.width=800},"Discover"],
 [x=>{x.editorial.depictsHistoricalEvent=true;x.editorial.modernContextDeclared=false},"historical"],
 [x=>{x.source.type="google-images"},"RIGHTS"]
]){const x=copy();mutator(x);const r=assessImage(page,x);assert.equal(r.status,"FAIL",JSON.stringify(r));assert.ok(r.issues.some(e=>e.toLowerCase().includes(expected.toLowerCase())),JSON.stringify(r));}
const cc=copy();cc.source.license="CC BY-SA 4.0";cc.source.author="Photographer";cc.source.licenseUrl="https://creativecommons.org/licenses/by-sa/4.0/";cc.source.derivativeLicense="CC BY-SA 4.0";
assert.equal(checkRights(cc).ok,true);
delete cc.source.derivativeLicense;
assert.equal(checkRights(cc).ok,false);
const report=auditManifest([{...page,isNew:false},{path:"/draft/",title:"Draft",isNew:true}],{"/santiago/":valid});
assert.equal(report.pass,1);assert.deepEqual(report.releaseBlockers,["/draft/"]);
console.log("ASTRA_IMAGE_RIGHTS_GATE PASS: SEO naming, rights, attribution, context, modern-vs-history, SEO metadata, new-page rollout");
