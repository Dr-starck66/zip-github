/**
 * ASTRA HYPER-RELEVANT IMAGE ENGINE Ω
 * Portable and dependency-free. Scores are internal editorial QA, not a Google metric.
 */
export const VERSION="1.0.0";
export const LICENSES={
 "CC0":{credit:false,sa:false},"Public domain":{credit:false,sa:false},
 "CC BY 4.0":{credit:true,sa:false},"CC BY 3.0":{credit:true,sa:false},
 "CC BY-SA 4.0":{credit:true,sa:true},"CC BY-SA 3.0":{credit:true,sa:true}
};
export function slugifyImage(text){
 return String(text||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
   .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").split("-").slice(0,10).join("-").slice(0,96).replace(/-$/,"");
}
export function seoFilename(subject,options={}){
 const ext=options.ext||"webp";
 if(!["webp","avif","png","jpg"].includes(ext))throw Error("unsupported image format");
 const name=slugifyImage([subject,options.place,options.context,options.year].filter(Boolean).join(" "));
 if(name.split("-").length<3||name.startsWith("image-")||name.startsWith("placeholder-"))
   throw Error("descriptive specific filename required");
 return name+"."+ext;
}
const https=u=>typeof u==="string"&&/^https:\/\//.test(u);
const escapeHtml=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function checkRights(a){
 const s=a?.source||{};
 if(s.type==="original")return {ok:s.proof==="author-approved"&&!!s.author&&!!s.proofRef,credit:false,reason:"original image must have approved creator provenance"};
 if(s.type!=="commons")return {ok:false,reason:"unknown source/rights"};
 const policy=LICENSES[s.license];
 const valid=!!policy&&https(s.filePage)&&s.filePage.includes("commons.wikimedia.org/wiki/File:")
    &&https(s.licenseEvidenceUrl)&&s.licenseEvidenceUrl.includes("commons.wikimedia.org")
    &&!!s.checkedAt&&(!policy.credit||(!!s.author&&https(s.licenseUrl)))
    &&(!policy.sa||s.derivativeLicense===s.license);
 return {ok:valid,credit:!!policy?.credit,reason:valid?"verified source data":"license / attribution / share-alike proof missing or unsupported"};
}
export function assessImage(page,a){
 const issues=[],warnings=[];
 if(!a)return {status:"FAIL",score:0,issues:["no image"],warnings};
 if(!page?.path||!page?.title)issues.push("page identity not provided");
 if(!checkRights(a).ok)issues.push("RIGHTS: "+checkRights(a).reason);
 const path=String(a.path||"");
 if(!/^\/images\/[a-z0-9/_-]+\.(webp|avif|png|jpg)$/.test(path)||path.includes(".."))issues.push("non-local or malformed SEO file path");
 const n=path.split("/").pop()?.split(".")[0]||"";
 if(n.length<17||n.split("-").length<3||/^(img|photo|image|default|cover|placeholder)[-_]/.test(n))issues.push("generic image filename");
 if(!a.alt||a.alt.length<25||a.alt.length>180)issues.push("poor descriptive alt text");
 if(!Number.isFinite(a.width)||a.width<1200||!Number.isFinite(a.height)||a.width*a.height<=300000)issues.push("image not Discover-size");
 if(!Number.isFinite(a.bytes)||a.bytes<2000)issues.push("real image bytes not verified");
 if(!["image/webp","image/png","image/avif","image/jpeg"].includes(a.mime))issues.push("unsupported image MIME");
 if(!a.editorial?.reviewed||!a.editorial?.exactSubjectMatch)issues.push("human editorial subject match not proven");
 if(a.editorial?.depictsHistoricalEvent&&a.editorial?.isModernPhoto&&!a.editorial?.modernContextDeclared)
   issues.push("modern image misrepresented as historical");
 if(a.bytes>400000)warnings.push("file >400 kB");
 if(!a.caption)warnings.push("no visible caption");
 let score=0;
 if(checkRights(a).ok)score+=15;
 if(n.length>17&&n.split("-").length>=3)score+=10;
 if(a.alt?.length>=25)score+=10;
 if(a.width>=1200&&a.width*a.height>300000)score+=10;
 if(a.mime==="image/webp"||a.mime==="image/avif")score+=10;
 if(a.bytes>=2000&&a.bytes<=400000)score+=10;
 if(a.editorial?.reviewed&&a.editorial?.exactSubjectMatch)score+=25;
 if(a.editorial?.placeMatch)score+=5;
 if(a.editorial?.nonStockGeneric)score+=5;
 if(issues.length)return {status:"FAIL",score:Math.min(score,69),issues,warnings};
 if(score<85)return {status:"PARTIAL",score,issues,warnings};
 return {status:"PASS",score,issues,warnings};
}
export function renderFigure(page,a,{hero=false}={}){
 const result=assessImage(page,a);
 if(result.status!=="PASS")return {html:"",result};
 const s=a.source||{};
 const credit=s.type==="commons"?"Foto: "+escapeHtml(s.author)+" · <a href=\""+escapeHtml(s.filePage)+"\" rel=\"noopener noreferrer\">"+escapeHtml(s.license)+"</a>":"Ilustración original: "+escapeHtml(s.author);
 const html='<figure class="astra-image"><img src="'+escapeHtml(a.path)+'" alt="'+escapeHtml(a.alt)+'" width="'+a.width+'" height="'+a.height+'" loading="'+(hero?"eager":"lazy")+'" decoding="async"'+(hero?' fetchpriority="high"':"")+'><figcaption>'+escapeHtml(a.caption||a.alt)+' · '+credit+'</figcaption></figure>';
 return {html,result};
}
export function imageMeta(origin,a){
 if(!a)return "";
 return '<meta property="og:image" content="'+escapeHtml(origin+a.path)+'"><meta property="og:image:width" content="'+a.width+'"><meta property="og:image:height" content="'+a.height+'"><meta name="twitter:card" content="summary_large_image">';
}
export function imageObject(origin,a){
 return a?{"@type":"ImageObject",url:origin+a.path,width:a.width,height:a.height,caption:a.caption||a.alt,creditText:a.source?.author||"",license:a.source?.licenseUrl||undefined}:null;
}
export function auditManifest(pages,manifest,{blockNewPagesOnly=true}={}){
 const assessments=pages.map(page=>{
  const result=assessImage(page,manifest[page.path]);
  return {path:page.path,status:result.status,score:result.score,issues:result.issues,enforce:!blockNewPagesOnly||page.isNew===true};
 });
 return {version:VERSION,pass:assessments.filter(x=>x.status==="PASS").length,
   fail:assessments.filter(x=>x.status!=="PASS").length,
   releaseBlockers:assessments.filter(x=>x.enforce&&x.status!=="PASS").map(x=>x.path),assessments};
}
