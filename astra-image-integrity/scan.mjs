#!/usr/bin/env node
/** ASTRA IMAGE INTEGRITY Ω — portable zero-API, fail-closed HTTP auditor.
 * Tests served bytes, not only the presence of <img> tags. Node >=20.
 */
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {createHash} from "node:crypto";
const args=process.argv.slice(2);
function val(flag){const i=args.indexOf(flag);return i>=0?args[i+1]:null}
const cfg=val("--config");
let sites=cfg?JSON.parse(readFileSync(cfg,"utf8")):[{name:"single-site",base:val("--base"),pages:(val("--paths")||"/").split(",").map(path=>({path,article:args.includes("--articles")}))}];
if(!Array.isArray(sites))sites=sites.sites||[];
const report={createdAt:new Date().toISOString(),engine:"ASTRA IMAGE INTEGRITY OMEGA",sites:[]};
const rawAttr=(tag,name)=>{const m=tag.match(new RegExp("\\b"+name+"\\s*=\\s*([\"'])(.*?)\\1","i"));return m?m[2]:null};
const toAbs=(value,base)=>new URL(value,base).href;
function imageInfo(bytes,mime){
 const head=bytes.subarray(0,40),ascii=(offset,n)=>head.toString("ascii",offset,offset+n);
 const png=ascii(1,3)==="PNG"&&head[0]===137;
 if(png)return {type:"png",width:head.readUInt32BE(16),height:head.readUInt32BE(20)};
 if(ascii(0,4)==="RIFF"&&ascii(8,4)==="WEBP"){
  const chunk=ascii(12,4);let width=null,height=null;
  if(chunk==="VP8X"){width=1+head.readUIntLE(24,3);height=1+head.readUIntLE(27,3)}
  else if(chunk==="VP8 "){width=head.readUInt16LE(26)&0x3fff;height=head.readUInt16LE(28)&0x3fff}
  else if(chunk==="VP8L"){width=1+(head[21]|((head[22]&63)<<8));height=1+((head[22]>>6)|(head[23]<<2)|((head[24]&15)<<10))}
  return {type:"webp",width,height};
 }
 if(head[0]===255&&head[1]===216){
  let i=2;while(i+9<bytes.length){if(bytes[i]!==255){i++;continue}const marker=bytes[i+1];if(marker===217||marker===218)break;const size=bytes.readUInt16BE(i+2);if(size<2)break;if([192,193,194,195,198,199,201,202].includes(marker))return {type:"jpeg",height:bytes.readUInt16BE(i+5),width:bytes.readUInt16BE(i+7)};i+=2+size}
  return {type:"jpeg",width:null,height:null};
 }
 if(mime?.includes("avif")&&ascii(4,4)==="ftyp")return {type:"avif",width:null,height:null};
 if(mime?.includes("svg"))return {type:"svg",width:null,height:null};
 return {type:"unknown",width:null,height:null};
}
const cache=new Map();
async function request(url,binary=false){
 const r=await fetch(url,{signal:AbortSignal.timeout(16000),headers:{"User-Agent":"ASTRA-Image-Integrity-Omega/1.0 (visual quality audit)","Cache-Control":"no-cache"}});
 return {status:r.status,mime:(r.headers.get("content-type")||"").split(";")[0].trim().toLowerCase(),url:r.url,body:binary?Buffer.from(await r.arrayBuffer()):await r.text()};
}
async function inspectImage(src,pageUrl,article){
 const url=toAbs(src,pageUrl);if(cache.has(url))return cache.get(url);
 let result;
 try{
  if(!/^https?:\/\//.test(url))throw Error("unsupported URL protocol");
  const r=await request(url,true),det=imageInfo(r.body,r.mime);
  const isImage=r.mime.startsWith("image/")&&det.type!=="unknown";
  const raster=["webp","jpeg","png","avif"].includes(det.type);
  const dimensionsKnown=Number.isFinite(det.width)&&Number.isFinite(det.height);
  const good=r.status===200&&isImage&&r.body.length>=1000&&(!article||(raster&&dimensionsKnown&&det.width>=1200&&det.height>=630));
  result={url,status:good?"PASS":"FAIL",http:r.status,mime:r.mime,type:det.type,width:det.width,height:det.height,bytes:r.body.length,sha256:createHash("sha256").update(r.body).digest("hex")};
 }catch(e){result={url,status:"FAIL",error:String(e)}}
 cache.set(url,result);return result;
}
async function scanSite(site){
 const out={name:site.name,base:site.base,pages:[],status:"UNVERIFIED"};
 if(site.enabled===false){out.reason=site.reason||"site not active; not yet protected";return out}
 if(!/^https?:\/\//.test(site.base||"")){out.reason="no validated base URL";return out}
 const pages=site.pages||[{path:"/",article:false}];let failures=0,unverified=0;
 const heroHashes=new Map();
 for(const p of pages){
  const path=typeof p==="string"?p:p.path,article=typeof p==="string"?false:!!p.article;
  const row={path,article,status:"UNVERIFIED",images:[],errors:[]};
  try{
   const url=toAbs(path,site.base),r=await request(url);
   if(r.status!==200||!r.mime.includes("text/html"))throw Error("HTML HTTP "+r.status+" MIME "+r.mime);
   const html=r.body,tags=[...html.matchAll(/<img\b[^>]*>/gi)].map(x=>x[0]);
   if(tags.length===0){row.errors.push("no <img> in HTML: page imagery unverified");unverified++}
   for(const tag of tags){
    const src=rawAttr(tag,"src"),alt=rawAttr(tag,"alt");
    if(!src){row.errors.push("empty/missing img src");continue}
    if(alt===null)row.errors.push("img missing alt attribute");
    const img=await inspectImage(src,url,false);
    row.images.push(img);
    if(img.status!=="PASS")row.errors.push("broken/inadequate image: "+src);
   }
   if(article){
    if(!tags.length)row.errors.push("article hero absent");
    const meta=(html.match(/<meta\b[^>]*property=["']og:image["'][^>]*>/i)||[])[0];
    const og=meta?rawAttr(meta,"content"):null;
    if(!og){row.errors.push("missing og:image")}else{
     const asset=await inspectImage(og,url,false);row.ogImage=asset;if(asset.status!=="PASS"||!["webp","jpeg","png","avif"].includes(asset.type)||!Number.isFinite(asset.width)||asset.width<1200||asset.height<630)row.errors.push("OG cover cannot be decoded at Discover dimensions");
     const previously=asset.sha256?heroHashes.get(asset.sha256):null;
     if(previously)row.errors.push("duplicate article cover with "+previously);
     else if(asset.sha256)heroHashes.set(asset.sha256,path);
    }
   }
   row.status=row.errors.length?"FAIL":"PASS";
  }catch(e){row.status="FAIL";row.errors.push(String(e))}
  out.pages.push(row);if(row.status==="FAIL")failures++;
 }
 out.status=failures?"FAIL":unverified?"UNVERIFIED":"PASS";
 out.summary={pages:out.pages.length,failed:failures,unverified};
 return out;
}
for(const site of sites)report.sites.push(await scanSite(site));
report.status=report.sites.some(x=>x.status==="FAIL")?"FAIL":report.sites.some(x=>x.status==="UNVERIFIED")?"UNVERIFIED":"PASS";
const output=val("--report");
if(output){mkdirSync(new URL(".",new URL("file://"+process.cwd()+"/"+output)),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+"\n")}
console.log("ASTRA_IMAGE_INTEGRITY_GLOBAL",JSON.stringify({status:report.status,sites:report.sites.map(s=>({name:s.name,status:s.status,summary:s.summary,reason:s.reason,errors:s.pages.flatMap(p=>p.errors.map(e=>p.path+": "+e)).slice(0,12)}))}));
if(report.status!=="PASS")process.exitCode=1;
