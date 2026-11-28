/**
 * ASTRA CONTENT QUALITY GUARD Ω — live launch hard gate for El Diario del Cibao.
 * Exact LEGACY snapshots are quarantined, not represented as compliant.
 * Any NEW/CHANGED page, report, restoration or evergreen guide must pass the
 * portable editorial fact-source, originality and relevance gate before startup.
 * This also works when GitHub Actions are skipped by a [skip ci] commit.
 */
import {readFileSync} from "node:fs";
import {checkOne} from "./astra-content-quality.mjs";
const BASELINE=new URL("../data/astra-content-legacy-baseline.json",import.meta.url);
const fnv64=item=>{
 let h=0xcbf29ce484222325n;
 const s=JSON.stringify(item);
 for(let i=0;i<s.length;i++)h=BigInt.asUintN(64,(h^BigInt(s.charCodeAt(i)))*0x100000001b3n);
 return h.toString(16).padStart(16,"0");
};
export function guardSiteContent({pages=[],currentNews=[],editorial2018=[],restoredJune=[],evergreenGuides=[]}={}){
 const legacy=JSON.parse(readFileSync(BASELINE,"utf8"));
 if(legacy.schema!=="astra-content-legacy-baseline/v1")throw Error("ASTRA_CONTENT_BASELINE_INVALID");
 const protectedPaths=new Map(legacy.entries.map(x=>[x.path,x]));
 const groups=[
  ["page",pages,("p")],["news",currentNews,"path"],["editorial",editorial2018,"path"],
  ["restored",restoredJune,"path"],["evergreen",evergreenGuides,"path"]
 ];
 const entries=groups.flatMap(([type,items,key])=>items.map(original=>{
  const route=original[key];
  if(!route)throw Error("ASTRA_CONTENT_MISSING_ROUTE "+type);
  const previous=protectedPaths.get(route);
  const unchanged=previous?.type===type&&previous?.hash===fnv64(original);
  return {route,type,original,changed:!unchanged};
 }));
 const unique=new Set(entries.map(x=>x.route));
 if(unique.size!==entries.length)throw Error("ASTRA_CONTENT_DUPLICATED_PUBLIC_URL");
 // Existing approved snapshots are *not* quality approvals: exact untouched legacy
 // must be remediated in separate batches, without mass-noindex or generic rewriting.
 const normalized=entries.map(({route,type,original,changed})=>({
   ...original,
   path:route,title:original.title||original.t||"",
   description:original.description||original.d||"",
   type:type==="page"?(original.a?"article":"guide"):"article",
   language:"es",changed
 }));
 const newlyChanged=normalized.filter(x=>x.changed);
 const blocked=[];
 for(const item of newlyChanged){
   const result=checkOne(item,normalized,{language:"es"});
   if(result.status!=="PASS")blocked.push({path:item.path,errors:result.issues.slice(0,7)});
 }
 const verifiedNew=newlyChanged.length-blocked.length;
 const result={status:blocked.length?"FAIL":newlyChanged.length?"PASS_CHANGED_CONTENT":"PARTIAL_LEGACY_QUARANTINE",
  total:entries.length,unchangedLegacy:entries.length-newlyChanged.length,
  newOrChanged:newlyChanged.length,verifiedChanged:verifiedNew,blockers:blocked};
 console.log("ASTRA_CONTENT_SITE_LAUNCH_GUARD",JSON.stringify(result));
 if(blocked.length)throw Error("ASTRA_CONTENT_PUBLICATION_BLOCKED: "+blocked.map(x=>x.path).join(", "));
 return result;
}
