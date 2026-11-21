/** ASTRA IMAGE INTEGRITY Ω: topic-specific original editorial illustrations, rendered WebP. */
import sharp from "sharp";
import {createHash} from "node:crypto";
const themes=[
["#082f42","#206b85","#30c5b7","work"],["#392c51","#9a638c","#ebbd73","record"],
["#153a62","#5683b7","#ebbf52","train"],["#35356b","#727abb","#f3c278","award"],
["#124652","#238a95","#f5a37d","health"],["#5a3451","#a77298","#eabf82","birth"],
["#12364f","#398ca9","#efc168","drive"],["#4a3029","#b3765f","#e9bd6d","fine"],
["#1c4e3f","#60a190","#ead180","pension"],["#2c3d69","#748fc3","#eabd69","school"]];
const icon={
 work:'<rect x="40" y="106" width="270" height="195" rx="23"/><path d="M108 106V67h134v39M40 175q135 85 270 0M155 194h44v37h-44z"/>',
 record:'<path d="M90 35h160l51 55v230H90zM250 35v55h51M124 140h143M124 185h112M124 230h80"/><circle cx="230" cy="267" r="36"/><path d="m215 267 11 11 19-23"/>',
 train:'<rect x="40" y="70" width="270" height="192" rx="19"/><path d="M70 230h211M175 262v45M120 309h110M90 137l85-45 85 45-85 46zM112 151v44q63 38 125 0v-44"/>',
 award:'<path d="M72 44h232v242H72zM108 96h158M108 146h155M108 200h85"/><circle cx="235" cy="256" r="36"/><path d="m209 277-19 60 45-20 42 20-16-60"/>',
 health:'<path d="M180 45Q80 80 80 114v100q0 70 100 124 100-54 100-124V114Q280 80 180 45zM180 122v140M112 192h136"/>',
 birth:'<rect x="79" y="40" width="211" height="287" rx="13"/><circle cx="184" cy="151" r="41"/><path d="M125 264q10-77 59-77t59 77M119 73h131M119 300h131"/>',
 drive:'<circle cx="180" cy="183" r="132"/><circle cx="180" cy="183" r="44"/><path d="M54 144q124-64 252 0M180 225v92M145 218l-65 48M215 218l65 48"/>',
 fine:'<path d="M180 38 330 315H30zM180 133v102M180 270v1"/>',
 pension:'<ellipse cx="116" cy="280" rx="75" ry="30"/><path d="M41 228v52q0 50 150 0v-52M41 228q0-50 150 0M198 222l55-65 34 29 42-88M291 98h38v39"/>',
 school:'<path d="M30 143q76-43 150 4 75-47 150-4v175q-75-35-150 10-74-45-150-10zM180 147v180M104 88l76-43 78 43-78 43zM239 109v41"/>'};
const escapeXml=s=>String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]));
function titleLines(text){const out=[];let a="";for(const w of text.split(/\s+/)){if((a+" "+w).trim().length>28&&a){out.push(a);a=w}else a=(a+" "+w).trim()}if(a)out.push(a);return out.slice(0,5)}
export function coverPath(g){const m=String(g?.path||"").match(/^\/guias\/([a-z0-9-]+)\/$/);if(!m)throw Error("IMAGE GATE: malformed guide path");return "/images/guias/"+m[1]+".webp"}
export function guideSvg(g,i){
 const [dark,medium,accent,kind]=themes[i%themes.length],ls=titleLines(g.title);
 const title=ls.map((s,j)=>'<text x="84" y="'+(230+j*66)+'">'+escapeXml(s)+'</text>').join("");
 return '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">'+
 '<defs><linearGradient id="bg"><stop stop-color="'+dark+'"/><stop offset="1" stop-color="'+medium+'"/></linearGradient></defs>'+
 '<rect width="1200" height="675" fill="url(#bg)"/><circle cx="1195" cy="48" r="400" fill="#ffffff" opacity=".05"/>'+
 '<path d="M0 550Q460 420 1200 620V675H0" fill="'+accent+'" opacity=".27"/>'+
 '<rect x="84" y="68" width="75" height="6" rx="3" fill="'+accent+'"/>'+
 '<text x="169" y="81" font-family="Arial,DejaVu Sans,sans-serif" font-size="21" fill="#fff3df" letter-spacing="2">EL DIARIO DEL CIBAO</text>'+
 '<text x="84" y="157" font-family="Arial,DejaVu Sans,sans-serif" font-size="22" fill="'+accent+'" font-weight="700">GUÍA PRÁCTICA · REPÚBLICA DOMINICANA</text>'+
 '<g font-family="Arial,DejaVu Sans,sans-serif" font-weight="700" font-size="46" fill="#fff4dd">'+title+'</g>'+
 '<rect x="792" y="148" width="331" height="364" rx="30" fill="#fff7e8"/><circle cx="959" cy="331" r="141" fill="'+accent+'" opacity=".18"/>'+
 '<g transform="translate(827 196) scale(.75)" fill="none" stroke="'+dark+'" stroke-width="17" stroke-linecap="round" stroke-linejoin="round">'+icon[kind]+'</g>'+
 '<rect x="84" y="573" width="610" height="1" fill="#fff7e8" opacity=".4"/>'+
 '<text x="84" y="617" font-family="Arial,DejaVu Sans,sans-serif" font-size="19" fill="#fff4dd">ILUSTRACIÓN EDITORIAL · NO ES FOTOGRAFÍA NI DOCUMENTO OFICIAL</text></svg>';
}
export async function generateGuideCovers(guides){
 const covers=new Map(),fingerprints=new Set();
 for(const [i,g] of guides.entries()){
  const buf=await sharp(Buffer.from(guideSvg(g,i))).resize(1200,675).webp({quality:86}).toBuffer();
  const m=await sharp(buf).metadata(),sha=createHash("sha256").update(buf).digest("hex");
  if(m.format!=="webp"||m.width!==1200||m.height!==675||buf.length<3000||fingerprints.has(sha))
    throw Error("ASTRA IMAGE FAIL CLOSED: invalid cover "+g.path);
  covers.set(coverPath(g),{bytes:buf,mime:"image/webp",width:m.width,height:m.height,sha256:sha});fingerprints.add(sha);
 }
 if(covers.size!==guides.length)throw Error("ASTRA IMAGE FAIL CLOSED: missing cover(s)");
 return covers;
}
