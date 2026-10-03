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
function hasSchema(html){return /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>/i.test(html);}
function hasWideImage(html){
  return (html.match(/<img\b[^>]*>/gi)||[]).some(tag=>Number(attr(tag,"width")||0)>=1200);
}
function htmlLinks(html,base){
  const out=[];
  for(const tag of html.match(/<a\b[^>]*>/gi)||[]){
    const href=attr(tag,"href");
    if(!href||href.startsWith("#")||/^(mailto:|tel:|javascript:)/i.test(href)) continue;
    try{out.push(normalizeUrl(new URL(href,base).toString()));}catch{}
  }
  return out;
}
function escapeHtml(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function escapeXml(s){return escapeHtml(s).replace(/'/g,"&apos;");}
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
function canonicalForKey(key){
  const base=cfg.canonicalBase.replace(/\/$/,"");
  let p=key.replace(/^\//,"");
  if(p==="index.html") return base+"/";
  p=p.replace(/\/index\.html$/i,"/").replace(/\.html$/i,"");
  return base+"/"+p;
}
function tokens(s){
  const stop=new Set(["des","les","une","pour","avec","dans","sur","par","the","and","for","with","from","www","https"]);
  return new Set(String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").split(/\s+/).filter(x=>x.length>2&&!stop.has(x)));
}
function similarity(a,b){
  const A=tokens(a),B=tokens(b);let n=0;for(const x of A)if(B.has(x))n++;return n;
}
function injectHead(html,chunk){
  return /<\/head>/i.test(html)?html.replace(/<\/head>/i,chunk+"\n</head>"):chunk+html;
}
function injectBodyStart(html,chunk){
  return /<body\b[^>]*>/i.test(html)?html.replace(/<body\b[^>]*>/i,m=>m+"\n"+chunk):chunk+html;
}
function injectBodyEnd(html,chunk){
  return /<\/body>/i.test(html)?html.replace(/<\/body>/i,chunk+"\n</body>"):html+chunk;
}
function heroPath(key){
  const slug=key.replace(/^\//,"").replace(/index\.html$/i,"home").replace(/\.html$/i,"").replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"").toLowerCase()||"home";
  return "/media/astra-"+slug+".svg";
}
function heroSvg(title){
  const t=escapeXml(title).slice(0,95);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#0b1020"/><circle cx="1040" cy="120" r="190" fill="#18264d"/><circle cx="110" cy="545" r="150" fill="#16213f"/><text x="72" y="270" fill="white" font-family="Arial,Helvetica,sans-serif" font-size="54" font-weight="700">${t}</text><text x="72" y="350" fill="#b9c7ee" font-family="Arial,Helvetica,sans-serif" font-size="30">Pantomime.org · guide football 2026</text></svg>`;
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
  if(!title){blocked.push({file:key,reason:"missing-title"});continue;}
  const h1s=h1Count(html);
  if(h1s>1){blocked.push({file:key,reason:"multiple-h1",count:h1s});continue;}
  let canonical=canonicalHref(html);
  if(!canonical){
    canonical=canonicalForKey(key);
    actions.push({type:"add-self-canonical",file:key,canonical,title});
  }
  let normalized;
  try{normalized=normalizeUrl(new URL(canonical,cfg.canonicalBase).toString());}
  catch{blocked.push({file:key,reason:"invalid-canonical",canonical});continue;}
  if(new URL(normalized).origin!==new URL(cfg.canonicalBase).origin){
    blocked.push({file:key,reason:"foreign-canonical",canonical:normalized});continue;
  }
  const row={file:key,canonical:normalized,title,html};
  indexable.push(row);
  if(h1s===0) actions.push({type:"add-h1",file:key,title});
  if(!hasSchema(html)) actions.push({type:"add-webpage-schema",file:key,title,canonical:normalized});
  if(!hasWideImage(html)) actions.push({type:"add-1200px-hero",file:key,title,path:heroPath(key)});
  if(!locs.has(normalized)) actions.push({type:"add-missing-sitemap-url",file:key,canonical:normalized,title});
}

const canonicalSet=new Set(indexable.map(x=>x.canonical));
for(const row of indexable){
  const existing=new Set(htmlLinks(row.html,row.canonical).filter(x=>canonicalSet.has(x)&&x!==row.canonical));
  const need=Math.min(3,Math.max(0,indexable.length-1));
  if(existing.size<need){
    const candidates=indexable.filter(x=>x.canonical!==row.canonical&&!existing.has(x.canonical))
      .map(x=>({canonical:x.canonical,title:x.title,score:similarity(row.title,x.title)}))
      .sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title))
      .slice(0,need-existing.size);
    if(candidates.length) actions.push({type:"add-related-links",file:row.file,targets:candidates});
  }
}

const robots=text(robotsKey);
const preferred=cfg.canonicalBase.replace(/\/$/,"/")+cfg.preferredSitemap;
if(robots&&/User-agent:\s*\*[\s\S]*?Disallow:\s*\/\s*(?:$|\r?\n)/i.test(robots)) blocked.push({file:cfg.robotsFile,reason:"global-disallow-root"});
if(!robots||!robots.split(/\r?\n/).some(line=>line.trim().toLowerCase()===("sitemap: "+preferred).toLowerCase())){
  actions.push({type:"ensure-robots-sitemap",value:preferred});
}

if(blocked.length){
  writeReport({schema:"astra-seo-self-heal-bundle/v2",site:cfg.site,mode:apply?"apply":"audit",actions,blocked,indexableCount:indexable.length,verdict:"BLOCKED"});
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

  const byFile=new Map();
  for(const a of actions) if(a.file){if(!byFile.has(a.file))byFile.set(a.file,[]);byFile.get(a.file).push(a);}
  for(const [file,acts] of byFile){
    let html=text(file);
    for(const a of acts){
      if(a.type==="add-self-canonical") html=injectHead(html,'<link rel="canonical" href="'+escapeHtml(a.canonical)+'">');
      else if(a.type==="add-h1") html=injectBodyStart(html,'<h1 data-astra-seo="h1">'+escapeHtml(a.title)+'</h1>');
      else if(a.type==="add-webpage-schema"){
        const json=JSON.stringify({"@context":"https://schema.org","@type":"WebPage",name:a.title,url:a.canonical,isPartOf:{"@type":"WebSite",name:"Pantomime.org",url:cfg.canonicalBase}});
        html=injectHead(html,'<script type="application/ld+json" data-astra-seo="schema">'+json+'</script>');
      }else if(a.type==="add-1200px-hero"){
        files[a.path]=Buffer.from(heroSvg(a.title),"utf8").toString("base64");
        html=injectBodyStart(html,'<figure data-astra-seo="hero" style="margin:1rem auto;max-width:1200px"><img src="'+a.path+'" width="1200" height="630" loading="lazy" alt="'+escapeHtml(a.title)+'" style="width:100%;height:auto"></figure>');
      }else if(a.type==="add-related-links"){
        const links=a.targets.map(t=>'<li><a href="'+escapeHtml(t.canonical)+'">'+escapeHtml(t.title)+'</a></li>').join("");
        html=injectBodyEnd(html,'<nav data-astra-seo="related" aria-label="À lire aussi"><strong>À lire aussi</strong><ul>'+links+'</ul></nav>');
      }
    }
    files[file]=Buffer.from(html,"utf8").toString("base64");
  }

  if(actions.some(a=>a.type==="ensure-robots-sitemap")){
    const next=(robots||"User-agent: *\nAllow: /\n").replace(/\s+$/,"")+"\n\nSitemap: "+preferred+"\n";
    const key=robotsKey||("/"+cfg.robotsFile);
    files[key]=Buffer.from(next,"utf8").toString("base64");
  }

  const encoded=zlib.gzipSync(Buffer.from(JSON.stringify(files),"utf8")).toString("base64");
  for(const name of parts) fs.unlinkSync(path.join(root,name));
  let i=0;
  for(let off=0;off<encoded.length;off+=cfg.chunkChars){
    fs.writeFileSync(path.join(root,cfg.partPrefix+String(i++).padStart(Number(cfg.partDigits||2),"0")),encoded.slice(off,off+cfg.chunkChars),"utf8");
  }
}

const report={schema:"astra-seo-self-heal-bundle/v2",site:cfg.site,mode:apply?"apply":"audit",actions,blocked:[],indexableCount:indexable.length,verdict:actions.length?(apply?"REPAIRED":"NEEDS_REPAIR"):"PASS"};
writeReport(report);
console.log("ASTRA_SEO_SELF_HEAL_RESULT",JSON.stringify({site:cfg.site,mode:report.mode,indexable:indexable.length,actions:actions.length,verdict:report.verdict}));
if(!apply&&actions.length) process.exit(2);
