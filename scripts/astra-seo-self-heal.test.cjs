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
    assert.match(home,/https:\/\/pantomime\.org\/(?:site-pronostics-football-fiable-2026|comparatif-meilleur-site-pronostics-foot)\.html/);
    for(const article of require('./astra-pantomime-editorial.cjs').DATA){
      assert.ok(files['/'+article.slug], 'restored article missing '+article.slug);
      const document=Buffer.from(files['/'+article.slug],'base64').toString();
      assert.ok(document.includes('rel="canonical" href="https://pantomime.org/'+article.slug+'"'),'article canonical '+article.slug);
    }
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

const {DATA,HOST,render,cleanWords,proposeRestorations}=require('./astra-pantomime-editorial.cjs');
test('four indexable guides are original, complete, self canonical and linked',()=>{
 assert.equal(DATA.length,4);
 const titles=new Set(),canonicals=new Set(),documents=new Set();
 for(const page of DATA){
  const html=render(page),words=cleanWords(html),canonical=HOST+'/'+page.slug;
  assert.ok(words>=400,page.slug+' only '+words+' words');
  assert.match(html,/<meta name="robots" content="index,follow/);
  assert.ok(html.includes('<link rel="canonical" href="'+canonical+'">'));
  assert.equal((html.match(/<h1\b/g)||[]).length,1);
  assert.equal((html.match(/<h2\b/g)||[]).length,7,'6 unique sections plus related');
  for(const other of DATA.filter(x=>x.slug!==page.slug))assert.ok(html.includes(HOST+'/'+other.slug));
  titles.add(page.title);canonicals.add(canonical);documents.add(html);
 }
 assert.equal(titles.size,4);assert.equal(canonicals.size,4);assert.equal(documents.size,4);
});
test('fallback repairs only blank known canonical-home shells, never meaningful or noindex pages',()=>{
 const encoded=s=>Buffer.from(s).toString('base64');
 const blank='<html><head><title>Ancienne page</title><link rel="canonical" href="'+HOST+'/"></head><body><div id="app"></div></body></html>';
 const files=Object.fromEntries(DATA.map(d=>['/'+d.slug,encoded(blank)]));
 const proposals=proposeRestorations(files);
 assert.equal(proposals.length,4);
 for(const proposal of proposals){
  assert.ok(proposal.renderedWords>=400);
  assert.ok(proposal.sourceWords<80);
  files[proposal.file]=encoded(proposal.html);
 }
 assert.equal(proposeRestorations(files).length,0,'idempotent after restoration');
 files['/'+DATA[0].slug]=encoded('<meta name="robots" content="noindex"><link rel="canonical" href="'+HOST+'/">'+blank);
 files['/'+DATA[1].slug]=encoded(render(DATA[1]));
 assert.ok(!proposeRestorations(files).some(p=>p.file==='/'+DATA[0].slug));
 assert.ok(!proposeRestorations(files).some(p=>p.file==='/'+DATA[1].slug));
});

test('GREEN publication token covers the actual Pantomime editorial renderer',()=>{
 const workflow=fs.readFileSync(path.resolve('.github/workflows/astra-pantomime-self-heal.yml'),'utf8');
 const tokenLine=workflow.split('\n').find(x=>x.includes('for f in server.cjs'))||'';
 assert.match(tokenLine,/scripts\/astra-pantomime-editorial\.cjs/);
 const manifest=fs.readFileSync(path.resolve('.astra-green-release.blobsha'),'utf8');
 assert.match(manifest,/^[a-f0-9]{40}\s+scripts\/astra-pantomime-editorial\.cjs$/m);
});
