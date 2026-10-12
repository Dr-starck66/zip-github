import {readFileSync} from "node:fs";
import {spawn} from "node:child_process";
import {setTimeout as sleep} from "node:timers/promises";
import {createHash} from "node:crypto";
import sharp from "sharp";
const ids=["prestaciones-laborales","papel-buena-conducta","cursos-infotep","certificado-infotep","senasa-subsidiado","acta-nacimiento-jce","renovacion-licencia","multas-transito","afp-sipen","certificado-bachiller"];
const guides=ids.map(id=>JSON.parse(readFileSync(new URL("../data/evergreen/"+id+".json",import.meta.url),"utf8")));
const local=process.argv.includes("--local"),arg=process.argv.indexOf("--base");
const base=local?"http://127.0.0.1:39785":arg>=0?process.argv[arg+1]:"";
if(!base)throw Error("Expected --local or --base https://host");
const errors=[],hashes=new Set(),checked=new Set();
let child;
const get=path=>fetch(new URL(path,base),{signal:AbortSignal.timeout(15000),headers:{"Cache-Control":"no-cache"}});
function assert(ok,what){if(!ok)errors.push(what)}
function attr(tag,key){const m=tag.match(new RegExp("\\b"+key+"\\s*=\\s*[\"']([^\"']*)[\"']","i"));return m?m[1]:""}
async function checkPage(path,guide=false){
 const res=await get(path);assert(res.status===200,path+" HTML "+res.status);if(res.status!==200)return;
 const html=await res.text(),images=[...html.matchAll(/<img\b[^>]*>/gi)].map(x=>x[0]);
 if(guide)assert(images.length>=1,path+" no image");
 for(const tag of images){
  const src=attr(tag,"src"),alt=attr(tag,"alt");
  assert(!!src,path+" empty img src");assert(alt.length>=15,path+" missing descriptive alt");
  if(!src)continue;
  const target=new URL(src,base);if(checked.has(target.pathname))continue;checked.add(target.pathname);
  try{
   const image=await get(target.pathname),bytes=Buffer.from(await image.arrayBuffer());
   const meta=await sharp(bytes).metadata();
   const ok=image.status===200&&image.headers.get("content-type")?.startsWith("image/")&&["webp","jpeg","png","avif"].includes(meta.format)&&meta.width>=1200&&meta.height>=630&&bytes.length>=3000;
   assert(ok,path+" invalid image "+src+" code="+image.status+" dimensions="+meta.width+"x"+meta.height);
   if(guide){const hash=createHash("sha256").update(bytes).digest("hex");assert(!hashes.has(hash),path+" duplicate cover");hashes.add(hash)}
  }catch(e){assert(false,path+" broken image "+src+": "+e)}
 }
 if(guide){
  const hero=images.find(tag=>tag.includes('class="feature"'))||"";
  const src=attr(hero,"src"),og=(html.match(/<meta property="og:image" content="([^"]+)"/)||[])[1];
  assert(src.startsWith("/images/guias/"),path+" missing topic-specific hero");
  assert(og==="https://eldiariodelcibao.com"+src,path+" OG image mismatch");
  assert(html.includes('name="robots" content="index,follow'),path+" no index");
 }
}
try{
 if(local){
  child=spawn(process.execPath,["server.mjs"],{cwd:new URL("../",import.meta.url),env:{...process.env,PORT:"39785"},stdio:"ignore"});
  let ok=false;for(let n=0;n<50;n++){try{if((await get("/health")).status===200){ok=true;break}}catch{}await sleep(250)}
  assert(ok,"local server failed to start");if(!ok)throw Error("No local HTTP server");
 }
 for(const guide of guides)await checkPage(guide.path,true);
 await checkPage("/guias/");await checkPage("/");
 const [health,site]=await Promise.all([get("/health"),get("/sitemap.xml")]);
 const [json,xml]=await Promise.all([health.json(),site.text()]);
 assert(json.guideImages===10&&json.imageIntegrity==="PASS","/health reports invalid covers");
 assert(guides.every(g=>xml.includes("eldiariodelcibao.com"+g.path)),"/sitemap.xml incomplete");
 assert(hashes.size===10,"not ten unique covers");
}catch(e){assert(false,"Fatal: "+e)}finally{if(child)child.kill("SIGTERM")}
console.log("ASTRA_IMAGE_INTEGRITY_OMEGA",JSON.stringify({status:errors.length?"FAIL":"PASS",base,coversVerified:hashes.size,imagesChecked:checked.size,errors,at:new Date().toISOString()}));
if(errors.length)process.exitCode=1;
