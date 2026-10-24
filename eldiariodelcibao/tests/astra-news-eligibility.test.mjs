import {test} from "node:test";
import assert from "node:assert/strict";
import {newsEligibility} from "../lib/astra-news-proof.mjs";
const site="https://eldiariodelcibao.com", now=Date.parse("2026-10-12T12:00:00Z");
const news=[{path:"/a/",title:"A",published:"2026-10-11T15:00:00Z",sources:[{url:"https://example.net"}],sections:[["A",["word ".repeat(1501)]]]}];
test("Cibao fresh sourced article can be technical PASS but not Google News approval",()=>{
 const r=newsEligibility({news,site,now,sitemap:"<url><loc>"+site+"/a/</loc><news:news></news:news></url>"});
 assert.equal(r.technicalStatus,"PASS");assert.equal(r.googleNewsInclusion,"UNVERIFIED");
});
test("Stale articles are omitted and reported truthfully",()=>{
 const r=newsEligibility({news:[{...news[0],published:"2026-10-05T15:00:00Z"}],site,now,sitemap:"<urlset/>"});
 assert.equal(r.newsInLast48h,0);assert.equal(r.technicalStatus,"UNVERIFIED");
});
test("Mismatched sitemap fails",()=>{
 const r=newsEligibility({news,site,now,sitemap:"<urlset/>"});
 assert.equal(r.technicalStatus,"FAIL");
});
