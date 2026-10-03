const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("fs");
const os=require("os");
const path=require("path");
const zlib=require("zlib");
const {spawnSync}=require("child_process");

const engine=path.resolve("scripts/astra-seo-self-heal.cjs");
function setup({multipleH1=false}={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"pantomime-self-heal-"));
  fs.mkdirSync(path.join(root,"config"),{recursive:true});
  const html=(title,canonical)=>{
    const h1=multipleH1?"<h1>A</h1><h1>B</h1>":"";
    return Buffer.from('<html><head><title>'+title+'</title><link rel="canonical" href="'+canonical+'"></head><body>'+h1+'<p>Contenu éditorial utile.</p></body></html>').toString("base64");
  };
  const files={
    "/index.html":html("Meilleur site pronostics foot 2026","https://pantomime.org/"),
    "/guide.html":html("Guide pronostics football","https://pantomime.org/guide"),
    "/methodologie.html":html("Méthodologie des pronostics","https://pantomime.org/methodologie"),
    "/comparatif.html":html("Comparatif algorithmes football","https://pantomime.org/comparatif"),
    "/sitemap.xml":Buffer.from('<?xml version="1.0"?><urlset><url><loc>https://pantomime.org/</loc></url></urlset>').toString("base64")
  };
  const packed=zlib.gzipSync(Buffer.from(JSON.stringify(files))).toString("base64");
  fs.writeFileSync(path.join(root,"bundle.part0"),packed);
  fs.writeFileSync(path.join(root,"config/astra-seo-self-heal.json"),JSON.stringify({
    site:"pantomime.org",canonicalBase:"https://pantomime.org",partPrefix:"bundle.part",chunkChars:900000,primarySitemap:"sitemap.xml",preferredSitemap:"sitemap.xml",robotsFile:"robots.txt",ignoreHtml:["404.html"],reportPath:"artifacts/seo/report.json",partDigits:1
  }));
  return root;
}
function unpack(root){
  const packed=fs.readdirSync(root).filter(n=>/^bundle\.part\d+$/.test(n)).sort().map(n=>fs.readFileSync(path.join(root,n),"utf8")).join("");
  return JSON.parse(zlib.gunzipSync(Buffer.from(packed,"base64")).toString("utf8"));
}
test("repairs semantic SEO signals and is idempotent",()=>{
  const root=setup();
  try{
    let r=spawnSync(process.execPath,[engine,"--apply"],{cwd:root,encoding:"utf8"});
    assert.equal(r.status,0,r.stderr||r.stdout);
    r=spawnSync(process.execPath,[engine],{cwd:root,encoding:"utf8"});
    assert.equal(r.status,0,r.stderr||r.stdout);
    const files=unpack(root);
    const home=Buffer.from(files["/index.html"],"base64").toString();
    assert.match(home,/<h1\b[^>]*data-astra-seo="h1"/);
    assert.match(home,/application\/ld\+json/);
    assert.match(home,/<img[^>]+width="1200"[^>]+height="630"/);
    assert.match(home,/data-astra-seo="related"/);
    assert.match(home,/https:\/\/pantomime\.org\/guide/);
    assert.match(Buffer.from(files["/sitemap.xml"],"base64").toString(),/https:\/\/pantomime\.org\/methodologie/);
    assert.match(Buffer.from(files["/robots.txt"],"base64").toString(),/Sitemap: https:\/\/pantomime\.org\/sitemap\.xml/);
    assert.ok(Object.keys(files).some(k=>/^\/media\/astra-.*\.svg$/.test(k)));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test("blocks ambiguous multiple H1",()=>{
  const root=setup({multipleH1:true});
  try{
    const r=spawnSync(process.execPath,[engine,"--apply"],{cwd:root,encoding:"utf8"});
    assert.equal(r.status,78,r.stderr||r.stdout);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
