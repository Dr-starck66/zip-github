import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
const target="dist";
const canonicalHost="https://carleasedeal.net";
const activate = process.env.SITE_INDEX_RELEASE==="1";
const proof = process.env.DOMAIN_HTTPS_CONFIRMED==="1";
if (activate && !proof) throw new Error("SEO publication blocked: first verify carleasedeal.net DNS, HTTPS, 200 responses and all canonical URLs; then set DOMAIN_HTTPS_CONFIRMED=1.");
function crawl(dir) {
  const result=[];
  for (const entry of readdirSync(dir,{withFileTypes:true})) {
    const file=join(dir,entry.name);
    if(entry.isDirectory()) result.push(...crawl(file));
    else if (entry.name.endsWith(".html")) result.push(file);
  }
  return result;
}
const re=/<meta\s+name=["']robots["']\s+content=["'](?:noindex|index),\s*follow["']\s*\/?>/i;
const routes=[];
for(const file of crawl(target)) {
  const rel=relative(target,file).replaceAll("\\","/");
  const route=rel==="index.html"?"/":"/"+dirname(rel).replaceAll("\\","/")+"/";
  let html=readFileSync(file,"utf8");
  if(!re.test(html)) throw new Error("robots tag missing in "+rel);
  html=html.replace(re,'<meta name="robots" content="'+(activate?"index,follow":"noindex,follow")+'">');
  if(activate) {
    html=html.replace(/<link\s+rel=["']canonical["'][^>]*>/gi,"");
    if(!html.includes("</head>")) throw new Error("No </head> in "+rel);
    html=html.replace("</head>",'<link rel="canonical" href="'+canonicalHost+route+'">\n</head>');
  }
  writeFileSync(file,html);
  routes.push(route);
}
if(activate) {
  const stamp=new Date().toISOString().slice(0,10);
  writeFileSync(join(target,"sitemap.xml"),'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+[...new Set(routes)].sort().map(p=>'<url><loc>'+canonicalHost+p+'</loc><lastmod>'+stamp+'</lastmod></url>').join("\n")+"\n</urlset>\n");
  writeFileSync(join(target,"robots.txt"),"User-agent: *\nAllow: /\nSitemap: "+canonicalHost+"/sitemap.xml\n");
} else {
  writeFileSync(join(target,"_headers"),"/*\n  X-Robots-Tag: noindex, follow\n");
  writeFileSync(join(target,"robots.txt"),"User-agent: *\nAllow: /\n# Staging: noindex in HTML and HTTP headers.\n");
}
console.log(JSON.stringify({status:"PASS",phase:"postbuild",files:routes.length,indexable:activate,canonicalHost}));