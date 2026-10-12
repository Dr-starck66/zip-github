/**
 * ASTRA CONTENT QUALITY GUARD Ω — zero-cost portable editorial quality gate.
 * Detects observable low-quality patterns; a PASS is not a guarantee of factual truth
 * or search rankings. A separate real editorial + source review is mandatory.
 * Operates on a page inventory (JSON), no external API or model subscription.
 */
export const VERSION="1.0.0";
export const LANGUAGES=["es","fr","en"];
const STOP=new Set(("la le les de des du un une en au aux et ou pour avec dans sur ce ces cette cet qui que quoi est sont il elle on nous vous leur leurs " +
"el los las una uno unos unas del al y o de que con por para como donde cuando este esta estos estas sus su lo se " +
"the a an of and or for with in on at to from as by it is are that this these those what how why when").split(/\s+/));
const LANG_STOP={
 es:new Set("el la los las del al para con una uno unas unos como porque desde hasta sobre hay puede pueden cuando donde mientras".split(" ")),
 fr:new Set("les des une dans pour avec cette sont leurs dont afin lorsque entre ainsi chez depuis peut peuvent".split(" ")),
 en:new Set("the and that this with from where while into their which when what those these there have has".split(" "))
};
const TOPIC_SELF_REFERENCE=[
 [/\b(?:reconstrucci[oó]n|recuperaci[oó]n|optimizaci[oó]n)\s+seo\b/iu,"SEO process instead of reader information"],
 [/\b(?:palabras\s+clave|intenci[oó]n\s+de\s+b[uú]squeda|densidad\s+del\s+contenido|autoridad\s+del\s+dominio)\b/iu,"SEO-centric filler"],
 [/\b(?:qu[eé]\s+busca\s+un\s+lector|c[oó]mo\s+verificamos\s+proyectos|c[oó]mo\s+utilizar\s+(?:esta|este)\s+gu[ií]a)\b/iu,"site-internal editorial boilerplate"],
 [/\b(?:nuestra|la)\s+(?:metodolog[ií]a|estrategia)\s+editorial\b/iu,"internal editorial policy in topical content"],
 [/\b(?:reconstruction|optimisation|r[eé]cup[eé]ration)\s+(?:du\s+)?(?:r[eé]f[eé]rencement|seo)\b/iu,"SEO-centric French filler"],
 [/\b(?:densit[eé]\s+(?:de\s+)?(?:mots[- ]cl[eé]s|contenu)|intention\s+de\s+recherche|autorit[eé]\s+entre\s+les\s+contenus)\b/iu,"SEO-centric French filler"],
 [/\b(?:comment\s+(?:nous\s+)?v[eé]rifions\s+les\s+(?:projets|chiffres)|quelles\s+informations\s+changent\s+et)\b/iu,"editorial-policy filler"],
 [/\b(?:keyword\s+density|search\s+intent|seo\s+reconstruction|increase\s+organic\s+traffic|site\s+authority)\b/iu,"English SEO-process filler"],
 [/\b(?:how\s+we\s+verify\s+(?:facts|claims)|how\s+to\s+use\s+this\s+guide\s+as\s+a\s+starting\s+point)\b/iu,"English editorial-method boilerplate"],
 [/^\s*(?:por\s+qu[eé]\s+esta\s+p[aá]gina\s+importa|why\s+this\s+page\s+matters|pourquoi\s+cette\s+page\s+est\s+importante)/iu,"interchangeable generic section"],
 [/^\s*(?:qu[eé]\s+informaci[oó]n\s+cambia|what\s+changes\s+and\s+what\s+stays|quelles\s+informations\s+changent)/iu,"interchangeable generic section"],
 [/^\s*(?:c[oó]mo\s+usar\s+esta\s+gu[ií]a|comment\s+utiliser\s+ce\s+guide)/iu,"navigation filler"]
];
const VOLATILE=/\b(?:precio|precios|tarifa|tarifas|horarios?|cerrado|abierto|costes?|prix|tarifs?|horaires?|ouvert|ferm[eé]|fees?|prices?|opening\s+hours|currently|ahora|actuellement|now|hoy|today|aujourd'hui)\b/iu;
const stripTags=x=>String(x??"").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&(?:amp|lt|gt|nbsp|quot|#39);/g," ").replace(/\s+/g," ").trim();
const norm=x=>stripTags(x).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();
const tokens=x=>norm(x).split(" ").filter(Boolean);
const words=x=>stripTags(x).split(/\s+/).filter(Boolean).length;
const keyWords=x=>[...new Set(tokens(x).filter(t=>t.length>=4&&!STOP.has(t)))];
const keyParagraph=x=>norm(x).replace(/\b20\d{2}\b/g,"YEAR");
function pageBody(x){
 const b=Array.isArray(x.paragraphs)?x.paragraphs:Array.isArray(x.b)?x.b:[];
 const sections=Array.isArray(x.sections)?x.sections:[];
 const normalized=sections.map(s=>Array.isArray(s)
  ?{heading:String(s[0]||""),paragraphs:Array.isArray(s[1])?s[1]:[]}
  :{heading:String(s?.heading||s?.title||""),paragraphs:s?.paragraphs||[]});
 return {sections:normalized,paragraphs:[...b,...normalized.flatMap(s=>s.paragraphs)].map(stripTags).filter(Boolean)};
}
function getSources(x){
 return (x.sources||[]).map(s=>Array.isArray(s)?{title:s[0],url:s[1]}:s).filter(x=>x&&typeof x.url==="string");
}
function getPath(x){return String(x.path||x.p||"");}
function getTitle(x){return String(x.title||x.t||"");}
function getDescription(x){return String(x.description||x.d||"");}
function languageEstimate(text,expected){
 const sample=tokens(text);let counts={es:0,fr:0,en:0};
 for(const w of sample)for(const l of LANGUAGES)if(LANG_STOP[l].has(w))counts[l]++;
 const other=LANGUAGES.filter(l=>l!==expected).sort((a,b)=>counts[b]-counts[a])[0];
 return {expected,scores:counts,dominant:Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0],
   mismatched:sample.length>=120&&counts[other]>=12&&counts[other]>counts[expected]*1.75};
}
function sim(a,b){
 const aa=new Set(keyWords(a)),bb=new Set(keyWords(b));
 if(!aa.size||!bb.size)return 0;
 const common=[...aa].filter(w=>bb.has(w)).length;
 return common/Math.min(aa.size,bb.size);
}
function titlePattern(h){
 const n=norm(h);
 return TOPIC_SELF_REFERENCE.find(([r])=>r.test(n))?.[1]||null;
}
function issuesForPage(x,corpus,options={}){
 const id=getPath(x),title=getTitle(x),body=pageBody(x);
 const warnings=[],blocking=[];
 const flag=(code,detail)=>blocking.push({code,detail});
 const info=(code,detail)=>warnings.push({code,detail});
 const mode=x.type||options.type||"guide";
 const minWords=options.minWords??(mode==="article"||mode==="guide"?1500:0);
 if(!id.startsWith("/")||!title)flag("IDENTITY","missing public path or real title");
 if(mode==="guide"||mode==="article"){
  if(words(body.paragraphs.join(" "))<minWords)flag("THIN_SUBSTANCE",{words:words(body.paragraphs.join(" ")),required:minWords});
  if(body.sections.length<Math.min(6,Math.ceil(minWords/250)))flag("WEAK_STRUCTURE",{sections:body.sections.length});
 }
 const whole=body.paragraphs.join(" ");
 const bad=TOPIC_SELF_REFERENCE.filter(([r])=>r.test(whole));
 for(const [,reason] of bad)flag("EDITORIAL_OR_SEO_FILLER",reason);
 for(const s of body.sections)if(titlePattern(s.heading))flag("TEMPLATE_SECTION",s.heading);
 // A copied section heading in >=3 other pages is a strong indication of templates,
 // except short normal guide headings such as FAQ or sources.
 const commonExempt=/^(?:faq|preguntas frecuentes|questions frequentes|sources|fuentes|references|bibliografia|contacto|contact)$/i;
 const pageCounts=new Map();
 for(const other of corpus){
  const op=getPath(other);if(op===id)continue;
  for(const h of new Set(pageBody(other).sections.map(x=>norm(x.heading))))
   pageCounts.set(h,(pageCounts.get(h)||0)+1);
 }
 for(const s of body.sections)if(!commonExempt.test(norm(s.heading))&&(pageCounts.get(norm(s.heading))||0)>=3)
  flag("REPEATED_HEADING",{heading:s.heading,others:pageCounts.get(norm(s.heading))});
 // Repeated filler paragraphs, within page and across unrelated pages.
 const local=new Set();
 for(const para of body.paragraphs){
  if(words(para)<30)continue;
  const sig=keyParagraph(para);
  if(local.has(sig))flag("DUPLICATED_PARAGRAPH","same long paragraph repeated on this page");
  local.add(sig);
  for(const other of corpus){
   if(getPath(other)===id)continue;
   const ob=pageBody(other).paragraphs;
   if(ob.some(p=>words(p)>=30&&keyParagraph(p)===sig)){
    flag("CROSS_PAGE_COPY",{other:getPath(other),excerpt:para.slice(0,96)});break;
   }
  }
 }
 // Strongly overlapping consecutive paragraphs can indicate spintax. Avoid quadratic corpus checks.
 for(let i=1;i<body.paragraphs.length;i++){
  const a=body.paragraphs[i-1],b=body.paragraphs[i];
  if(words(a)>=45&&words(b)>=45&&sim(a,b)>=0.88)flag("PARAPHRASED_PADDING",{paragraph:i,overlap:+sim(a,b).toFixed(2)});
 }
 const scores=languageEstimate(whole,x.language||options.language||"es");
 if(scores.mismatched)flag("LANGUAGE_MISMATCH",scores);
 const titleTerms=keyWords(title);
 const allTerms=new Set(keyWords(whole));
 if(titleTerms.length>0&&titleTerms.filter(w=>allTerms.has(w)).length<Math.max(1,Math.min(2,titleTerms.length)))
  flag("OFF_TOPIC",{title,missing:titleTerms.filter(w=>!allTerms.has(w))});
 const src=getSources(x),urls=new Set(src.map(s=>s.url).filter(u=>/^https:\/\//.test(u)));
 if((mode==="guide"||mode==="article")&&urls.size<3)flag("INSUFFICIENT_SOURCES",{links:urls.size,required:3});
 for(const s of src)if(!/^https:\/\//.test(s.url||""))flag("INVALID_SOURCE_URL",s.url);
 // Gate structured provenance for changed/new editorial content. Claims do not
 // prove themselves; a reviewer must verify each citation against an actual source.
 const evidence=Array.isArray(x.evidence)?x.evidence:[];
 if(mode==="guide"||mode==="article"){
  if(evidence.length<5)flag("NO_CLAIM_EVIDENCE",{count:evidence.length,required:5});
  const distinct=new Set();
  for(const ev of evidence){
   if(!ev?.claim||words(ev.claim)<5||!ev?.sourceUrl||!urls.has(ev.sourceUrl)||!ev?.sourceLocator)
    flag("UNTRACEABLE_CLAIM",ev?.claim||"missing claim/source/locator");
   if(ev?.claim&&!norm(whole).includes(norm(ev.claim)))
    flag("CLAIM_NOT_IN_TEXT",ev.claim);
   if(ev?.claim)distinct.add(norm(ev.claim));
  }
  if(distinct.size<5)flag("REPEATED_CLAIM_EVIDENCE",{distinct:distinct.size});
 }
 const reviewer=x.review||{};
 if(!reviewer.approved||!reviewer.reviewer||!reviewer.date||!reviewer.factualSpotcheck)
  flag("EDITORIAL_REVIEW_MISSING","requires a named reviewer, date, approved=true and factualSpotcheck=true; self-declaration is not independent proof");
 if(VOLATILE.test(whole)&&!x.factAsOf)
  flag("VOLATILE_DATA_UNDATED","prices, hours, closures or availability need an as-of date");
 // Short content may be legitimate, no global minimum for about/contact/legal.
 return {path:id,title,mode,words:words(whole),sections:body.sections.length,sourceLinks:urls.size,
   issues:blocking,warnings,status:blocking.length?"FAIL":"PASS"};
}
export function auditCorpus(pages,{enforce="changed",language="es",minWords}={}){
 if(!Array.isArray(pages))throw Error("ASTRA_CONTENT_NO_PAGES");
 const results=pages.map(p=>{
  const r=issuesForPage(p,pages,{language,minWords});
  const shouldEnforce=enforce==="all"||(enforce==="changed"&&p.changed===true);
  return {...r,enforced:shouldEnforce,releaseBlocked:shouldEnforce&&r.status!=="PASS"};
 });
 return {version:VERSION,scope:enforce,status:results.some(x=>x.releaseBlocked)?"FAIL":results.some(x=>x.status==="FAIL")?"PARTIAL":"PASS",
   total:results.length,pass:results.filter(x=>x.status==="PASS").length,fail:results.filter(x=>x.status==="FAIL").length,
   releaseBlockers:results.filter(x=>x.releaseBlocked).map(x=>x.path),results};
}
export function checkOne(page,corpus=[],options={}){
 return issuesForPage(page,[page,...corpus.filter(p=>getPath(p)!==getPath(page))],options);
}
export function adaptCibaoContent(json,changedPaths=[]){
 const changed=new Set(changedPaths);
 return [...(json.pages||[]).map(p=>({...p,path:p.p,title:p.t,description:p.d,type:p.a?"article":"guide",changed:changed.has(p.p),language:"es"})),
 ...(json.currentNews||[]).map(p=>({...p,type:"article",changed:changed.has(p.path),language:"es"}))];
}
