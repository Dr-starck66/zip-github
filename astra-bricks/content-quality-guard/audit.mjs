#!/usr/bin/env node
/**
 * Injected publishing release gate: npm run guard:content
 * Page inventory: config/astra-content-pages.json, {pages:[]}
 * Published routes register: config/astra-content-routes.json, {routes:[]}
 * New/changed editorial pages must be declared with changed:true.
 * On existing sites leave other routes untouched; publishable registry coverage mandatory.
 */
import {readFileSync,existsSync} from "node:fs";
import path from "node:path";
import {auditCorpus} from "./lib/astra-content-quality.mjs";
function execute(){
 const root=process.cwd(),pagesFile=path.join(root,"config/astra-content-pages.json");
 const routesFile=path.join(root,"config/astra-content-routes.json");
 const fail=(reason,info={})=>{console.error("ASTRA_CONTENT_RELEASE_FAIL",JSON.stringify({reason,...info}));process.exitCode=1;};
 try{
  if(!existsSync(pagesFile)||!existsSync(routesFile))return fail("REQUIRED_CONTENT_REGISTRY_MISSING");
  const pages=JSON.parse(readFileSync(pagesFile,"utf8")).pages;
  const routeList=JSON.parse(readFileSync(routesFile,"utf8")).routes;
  if(!Array.isArray(pages)||!pages.length||!Array.isArray(routeList)||!routeList.length)
   return fail("EMPTY_OR_BAD_CONTENT_INVENTORY");
  const declared=pages.map(x=>x.path||x.p);
  const unique=new Set(declared);
  if(unique.size!==declared.length)return fail("DUPLICATE_ROUTES_IN_MANIFEST");
  const uncovered=routeList.filter(x=>!unique.has(x));
  const phantom=declared.filter(x=>!routeList.includes(x));
  if(uncovered.length||phantom.length)return fail("INCOMPLETE_PUBLISHED_ROUTE_COVERAGE",{uncovered,phantom});
  const mode=process.env.ASTRA_CONTENT_ENFORCE_ALL==="1"?"all":"changed";
  const report=auditCorpus(pages,{enforce:mode});
  const output={status:report.status,scope:mode,total:report.total,pass:report.pass,legacyIssues:report.fail,
   releaseBlockers:report.releaseBlockers,sampleIssues:report.results.filter(p=>p.status==="FAIL").slice(0,15).map(x=>({
     path:x.path,enforced:x.enforced,issues:x.issues.slice(0,5)}))};
  console.log("ASTRA_CONTENT_RELEASE_PROOF",JSON.stringify(output));
  if(report.releaseBlockers.length)fail("PUBLICATION_BLOCKED",{routes:report.releaseBlockers});
 }catch(err){fail("GATE_EXCEPTION",{error:String(err)})}
}
execute();
