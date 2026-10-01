const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("fs");
const os=require("os");
const path=require("path");
const zlib=require("zlib");
const {spawnSync}=require("child_process");

const engine=path.resolve("scripts/astra-seo-self-heal.cjs");
function setup({missingCanonical=false}={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"pantomime-self-heal-"));
  fs.mkdirSync(path.join(root,"config"),{recursive:true});
  const html=(title,canonical)=>Buffer.from('<html><head><title>'+title+'</title>'+(canonical?'<link rel="canonical" href="'+canonical+'">':'')+'</head><body><h1>'+title+'</h1></body></html>').toString("base64");
  const files={
    "/index.html":html("Home","https://pantomime.org/"),
    "/guide.html":html("Guide",missingCanonical?"":"https://pantomime.org/guide"),
    "/sitemap.xml":Buffer.from('<?xml version="1.0"?><urlset><url><loc>https://pantomime.org/</loc></url></urlset>').toString("base64")
  };
  const packed=zlib.gzipSync(Buffer.from(JSON.stringify(files))).toString("base64");
  fs.writeFileSync(path.join(root,"bundle.part0"),packed);
  fs.writeFileSync(path.join(root,"config/astra-seo-self-heal.json"),JSON.stringify({
    site:"pantomime.org",canonicalBase:"https://pantomime.org",partPrefix:"bundle.part",chunkChars:900000,primarySitemap:"sitemap.xml",preferredSitemap:"sitemap.xml",robotsFile:"robots.txt",ignoreHtml:["404.html"],reportPath:"artifacts/seo/report.json"
  }));
  return root;
}
function unpack(root){
  const packed=fs.readdirSync(root).filter(n=>/^bundle\.part\d+$/.test(n)).sort().map(n=>fs.readFileSync(path.join(root,n),"utf8")).join("");
  return JSON.parse(zlib.gunzipSync(Buffer.from(packed,"base64")).toString("utf8"));
}
test("repairs sitemap and robots inside bundle",()=>{
  const root=setup();
  try{
    let r=spawnSync(process.execPath,[engine,"--apply"],{cwd:root,encoding:"utf8"});
    assert.equal(r.status,0,r.stderr||r.stdout);
    r=spawnSync(process.execPath,[engine],{cwd:root,encoding:"utf8"});
    assert.equal(r.status,0,r.stderr||r.stdout);
    const files=unpack(root);
    assert.match(Buffer.from(files["/sitemap.xml"],"base64").toString(),/https:\/\/pantomime\.org\/guide/);
    assert.match(Buffer.from(files["/robots.txt"],"base64").toString(),/Sitemap: https:\/\/pantomime\.org\/sitemap\.xml/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test("blocks missing canonical",()=>{
  const root=setup({missingCanonical:true});
  try{
    const r=spawnSync(process.execPath,[engine,"--apply"],{cwd:root,encoding:"utf8"});
    assert.equal(r.status,78,r.stderr||r.stdout);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
