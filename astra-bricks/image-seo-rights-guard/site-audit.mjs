#!/usr/bin/env node
/**
 * ASTRA IMAGE SEO + RIGHTS GUARD Ω — release gate for generated Node web apps.
 * Fail closed when no page inventory, manifest or verified local binary.
 * Does not change unrelated sites or rewrite their robots controls.
 */
import {existsSync,readFileSync} from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {auditManifest} from "./index.mjs";
const root=process.cwd();
const files={pages:path.join(root,"config","astra-image-pages.json"),manifest:path.join(root,"config","astra-image-manifest.json")};
const die=(reason,detail)=>{console.error("ASTRA_IMAGE_GUARD_FAIL",JSON.stringify({reason,detail}));process.exitCode=1};
function webpDimensions(b){
 if(b.length<30||b.toString("ascii",0,4)!=="RIFF"||b.toString("ascii",8,12)!=="WEBP")return null;
 const kind=b.toString("ascii",12,16);
 if(kind==="VP8 " && b[23]===0x9d && b[24]===0x01 && b[25]===0x2a)
   return {width:b.readUInt16LE(26)&0x3fff,height:b.readUInt16LE(28)&0x3fff};
 if(kind==="VP8X")return {width:1+b[24]+(b[25]<<8)+(b[26]<<16),height:1+b[27]+(b[28]<<8)+(b[29]<<16)};
 return null;
}
try {
 if(!existsSync(files.pages)||!existsSync(files.manifest))throw Error("MISSING_INVENTORY_OR_MANIFEST");
 const data=JSON.parse(readFileSync(files.pages,"utf8"));
 const manifest=JSON.parse(readFileSync(files.manifest,"utf8"));
 if(!Array.isArray(data.pages)||!data.pages.length)throw Error("PAGE_LIST_MISSING_OR_EMPTY");
 for(const page of data.pages){
   if(!page.path||!page.title)throw Error("INVALID_PAGE_INVENTORY_ENTRY");
 }
 const report=auditManifest(data.pages,manifest,{blockNewPagesOnly:true});
 const details=[];
 for(const page of data.pages){
  const asset=manifest[page.path];
  if(!asset)continue;
  const file=path.join(root,"public",asset.path||"");
  // No arbitrary filesystem access (the manifest is a content source, not a path oracle).
  if(!asset.path?.startsWith("/images/")||path.relative(path.join(root,"public","images"),file).startsWith("..")){
    details.push({page:page.path,reason:"INVALID_ASSET_PATH"});continue;
  }
  if(!existsSync(file)){details.push({page:page.path,reason:"MISSING_BINARY"});continue}
  const buf=readFileSync(file),actual=createHash("sha256").update(buf).digest("hex");
  const dims=asset.mime==="image/webp"?webpDimensions(buf):null;
  if(!dims||dims.width!==asset.width||dims.height!==asset.height
    ||buf.length!==asset.bytes||!asset.sha256||asset.sha256!==actual)
    details.push({page:page.path,reason:"UNPROVEN_BINARY_DIMENSIONS_OR_SHA256"});
 }
 const failed=new Set([...report.releaseBlockers,...details.map(x=>x.page)]);
 if(failed.size)die("RELEASE_BLOCKED",{releaseBlockers:[...failed],proofFailures:details});
 else console.log("ASTRA_IMAGE_GUARD",JSON.stringify({
  status:report.fail===0?"PASS":"PARTIAL_EXISTING_PAGES",
  total:data.pages.length,pass:report.pass,existingPending:report.fail,releaseBlockers:0,
  policy:"new pages fail closed; existing pages audited but not mass-noindexed"
 }));
}catch(e){die(e?.message||"UNVERIFIED")}
