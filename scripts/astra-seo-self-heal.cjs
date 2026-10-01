#!/usr/bin/env node
const fs=require("fs");
const path=require("path");
const zlib=require("zlib");

const root=process.cwd();
const apply=process.argv.includes("--apply");
const cfg=JSON.parse(fs.readFileSync(path.join(root,"config/astra-seo-self-heal.json"),"utf8"));
const reportPath=path.join(root,cfg.reportPath);

function writeReport(report){
  fs.mkdirSync(path.dirname(reportPath),{recursive:true});
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+"\n","utf8");
}
function attr(tag,name){
  const m=tag.match(new RegExp("\\b"+name+"\\s*=\\s*([\"'])(.*?)\\1","i"));
  return m?.[2]||"";
}
function canonicalHref(html){
  for(const tag of html.match(/<link\b[^>]*>/gi)||[]){
    if(attr(tag,"rel").toLowerCase().split(/\s+/).includes("canonical")) return attr(tag,"href");
  }
  return "";
}
function hasNoindex(html){
  for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){
    const name=attr(tag,"name").toLowerCase();
    const content=attr(tag,"content").toLowerCase();
    if((name==="robots"||name==="googlebot")&&/(^|[,\s])noindex([,\s]|$)/i.test(content)) return true;
  }
  return false;
}
function titleOf(html){return (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||"").replace(/<[^>]+>/g,"").trim();}
function h1Count(html){return (html.match(/<h1\b/gi)||[]).length;}
function normalizeUrl(raw){
  const u=new URL(raw);u.hash="";
  if(u.pathname.length>1)u.pathname=u.pathname.replace(/\/+$/,"");
  return u.toString().replace(/\/$/,"");
}
function xmlLocs(xml){return [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map(m=>m[1].trim().replace(/&amp;/g,"&"));}
function keyFor(files,wanted){
  return Object.keys(files).find(k=>k===wanted||k==="/"+wanted||k.replace(/^\//,"")===wanted)||null;
}
function partFiles(){
  return fs.readdirSync(root)
    .filter(n=>n.startsWith(cfg.partPrefix)&&/^\d+$/.test(n.slice(cfg.partPrefix.length)))
    .sort((a,b)=>Number(a.slice(cfg.partPrefix.length))-Number(b.slice(cfg.partPrefix.length)));
}

const parts=partFiles();
if(!parts.length){console.error("ASTRA_SEO_SELF_HEAL_BLOCKED no bundle parts");process.exit(78);}
const packed=parts.map(n=>fs.readFileSync(path.join(root,n),"utf8").trim()).join("");
let files;
try{files=JSON.parse(zlib.gunzipSync(Buffer.from(packed,"base64")).toString("utf8"));}
catch(error){console.error("ASTRA_SEO_SELF_HEAL_BLOCKED invalid bundle",error.message);process.exit(78);}

const primaryKey=keyFor(files,cfg.primarySitemap);
const robotsKey=keyFor(files,cfg.robotsFile);
const sitemapKeys=Object.keys(files).filter(k=>/sitemap[^/]*\.xml$/i.test(k));
const text=(key)=>key?Buffer.from(files[key],"base64").toString("utf8"):null;
const primaryXml=text(primaryKey);
const actions=[];
const blocked=[];
const indexable=[];

if(!primaryKey||primaryXml==null) blocked.push({reason:"missing-primary-sitemap",file:cfg.primarySitemap});

const locs=new Set();
for(const key of sitemapKeys){
  const xml=text(key);
  if(xml) for(const loc of xmlLocs(xml)) locs.add(normalizeUrl(loc));
}

for(const key of Object.keys(files)){
  if(!/\.html$/i.test(key)) continue;
  if((cfg.ignoreHtml||[]).some(x=>key.replace(/^\//,"")===x.replace(/^\//,""))) continue;
  const html=text(key);
  if(hasNoindex(html)) continue;
  const title=titleOf(html);
  const canonical=canonicalHref(html);
  const h1s=h1Count(html);
  if(!title){blocked.push({file:key,reason:"missing-title"});continue;}
  if(h1s!==1){blocked.push({file:key,reason:"invalid-h1-count",count:h1s});continue;}
  if(!canonical){blocked.push({file:key,reason:"missing-canonical"});continue;}
  let normalized;
  try{normalized=normalizeUrl(new URL(canonical,cfg.canonicalBase).toString());}
  catch{blocked.push({file:key,reason:"invalid-canonical",canonical});continue;}
  if(new URL(normalized).origin!==new URL(cfg.canonicalBase).origin){
    blocked.push({file:key,reason:"foreign-canonical",canonical:normalized});continue;
  }
  indexable.push({file:key,canonical:normalized,title});
  if(!locs.has(normalized)) actions.push({type:"add-missing-sitemap-url",file:key,canonical:normalized,title});
}

const robots=text(robotsKey);
const preferred=cfg.canonicalBase.replace(/\/$/,"/")+cfg.preferredSitemap;
if(robots&&/User-agent:\s*\*[\s\S]*?Disallow:\s*\/\s*(?:$|\r?\n)/i.test(robots)) blocked.push({file:cfg.robotsFile,reason:"global-disallow-root"});
if(!robots||!robots.split(/\r?\n/).some(line=>line.trim().toLowerCase()===("sitemap: "+preferred).toLowerCase())){
  actions.push({type:"ensure-robots-sitemap",value:preferred});
}

if(blocked.length){
  writeReport({schema:"astra-seo-self-heal-bundle/v1",site:cfg.site,mode:apply?"apply":"audit",actions,blocked,indexableCount:indexable.length,verdict:"BLOCKED"});
  console.error("ASTRA_SEO_SELF_HEAL_BLOCKED",JSON.stringify({blocked:blocked.length,actions:actions.length}));
  process.exit(78);
}

if(apply&&actions.length){
  let nextPrimary=primaryXml;
  for(const action of actions.filter(a=>a.type==="add-missing-sitemap-url")){
    const block="<url><loc>"+action.canonical.replace(/&/g,"&amp;")+"</loc><changefreq>weekly</changefreq><priority>0.5</priority></url>";
    nextPrimary=nextPrimary.replace(/<\/urlset>\s*$/i,block+"</urlset>");
  }
  if(nextPrimary!==primaryXml) files[primaryKey]=Buffer.from(nextPrimary,"utf8").toString("base64");

  if(actions.some(a=>a.type==="ensure-robots-sitemap")){
    const next=(robots||"User-agent: *\nAllow: /\n").replace(/\s+$/,"")+"\n\nSitemap: "+preferred+"\n";
    const key=robotsKey||("/"+cfg.robotsFile);
    files[key]=Buffer.from(next,"utf8").toString("base64");
  }

  const encoded=zlib.gzipSync(Buffer.from(JSON.stringify(files),"utf8")).toString("base64");
  for(const name of parts) fs.unlinkSync(path.join(root,name));
  let i=0;
  for(let off=0;off<encoded.length;off+=cfg.chunkChars){
    fs.writeFileSync(path.join(root,cfg.partPrefix+(i++)),encoded.slice(off,off+cfg.chunkChars),"utf8");
  }
}

const report={schema:"astra-seo-self-heal-bundle/v1",site:cfg.site,mode:apply?"apply":"audit",actions,blocked:[],indexableCount:indexable.length,verdict:actions.length?(apply?"REPAIRED":"NEEDS_REPAIR"):"PASS"};
writeReport(report);
console.log("ASTRA_SEO_SELF_HEAL_RESULT",JSON.stringify({site:cfg.site,mode:report.mode,indexable:indexable.length,actions:actions.length,verdict:report.verdict}));
if(!apply&&actions.length) process.exit(2);
