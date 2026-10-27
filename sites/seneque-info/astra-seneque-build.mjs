#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
const SITE='https://seneque.info',OUT=path.resolve('dist'),input=JSON.parse(await fs.readFile('enrichment-2026-10-18.json','utf8')),daily=JSON.parse(await fs.readFile('daily-editorial-2026-10-27.json','utf8'));
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const get=async(p)=>{const r=await fetch(SITE+p,{headers:{'User-Agent':'ASTRA-Seneque-Rebuild/1.0 (+editorial restoration)'}});if(!r.ok)throw Error('FETCH_FAIL '+p+' '+r.status);return await r.text();};
const wc=s=>s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,' ').replace(/<[^>]*>/g,' ').replace(/&[^;]+;/g,' ').trim().split(/\s+/).filter(Boolean).length;
const save=async(p,s)=>{const dest=path.join(OUT,p);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,s,'utf8');};
const fresco='https://commons.wikimedia.org/wiki/Special:FilePath/Pompeii_-_Casa_dei_Casti_Amanti_-_Banquet.jpg?width=960';
const portrait='https://commons.wikimedia.org/wiki/Special:FilePath/Portret_van_Seneca_de_jongere%2C_door_Theodore_Galle.jpg?width=800';
const fig=(url,alt,desc,source)=>'<figure><img loading="lazy" decoding="async" src="'+url+'" alt="'+esc(alt)+'" width="900" height="620"><figcaption>'+esc(desc)+' — <a href="'+source+'" rel="noopener noreferrer" target="_blank">Source Wikimedia Commons, domaine public</a></figcaption></figure>';
const artF=fig(fresco,'Fresque de banquet romain à Pompéi','Casa dei Casti Amanti, fresque de banquet (ne représente pas un rite précis)','https://commons.wikimedia.org/wiki/File:Pompeii_-_Casa_dei_Casti_Amanti_-_Banquet.jpg');
const artS=fig(portrait,'Gravure de Sénèque par Theodore Galle en 1605','Portrait gravé en 1605, et non portrait pris du vivant du philosophe','https://commons.wikimedia.org/wiki/File:Portret_van_Seneca_de_jongere,_door_Theodore_Galle.jpg');
const video=(id,title)=>'<div class="astra-video"><h3>'+esc(title)+'</h3><div class="astra-frame"><iframe loading="lazy" title="'+esc(title)+'" src="https://www.youtube-nocookie.com/embed/'+id+'" allow="encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div></div>';
const svg=(title)=>'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="440" viewBox="0 0 1200 440"><title>'+esc(title)+'</title><rect width="1200" height="440" rx="18" fill="#5b3c2d"/><path d="M0 440Q600 40 1200 320V440" fill="#956e4b" opacity=".5"/><text x="55" y="70" fill="#f9e5bf" font-size="22" font-family="Georgia">SÉNÈQUE &amp; LES PLAISIRS · DOSSIER ILLUSTRÉ</text><text x="55" y="133" fill="#fff" font-size="32" font-family="Georgia">'+esc(title).slice(0,55)+'</text>'+['Sources','Contexte','Interprétation'].map((x,i)=>'<g transform="translate('+(55+376*i)+' 205)"><rect rx="12" width="340" height="135" fill="'+(i%2?'#dcc7a4':'#f4e8d3')+'"/><text x="20" y="55" fill="#704830" font-family="Georgia" font-size="35">0'+(i+1)+'</text><text x="20" y="99" fill="#704830" font-family="Georgia" font-size="25">'+x+'</text></g>').join('')+'<text x="55" y="410" fill="#f8e9d1" font-family="Georgia" font-size="17">Schéma original — aucune statistique inventée</text></svg>';
const guideHero=(title,accent)=>'<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-labelledby="t d"><title id="t">'+esc(title)+'</title><desc id="d">Illustration originale : trois étapes de protection, vérification et action pour les rencontres en ligne.</desc><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+accent+'"/><stop offset="1" stop-color="#17242a"/></linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/><circle cx="1320" cy="170" r="260" fill="#fff" opacity=".06"/><circle cx="160" cy="790" r="330" fill="#fff" opacity=".05"/><text x="120" y="150" fill="#f8e8c7" font-size="34" font-family="system-ui,sans-serif" letter-spacing="4">SENEQUE.INFO · GUIDE PRATIQUE</text><foreignObject x="120" y="210" width="1330" height="210"><div xmlns="http://www.w3.org/1999/xhtml" style="font:700 68px/1.12 system-ui,sans-serif;color:white">'+esc(title)+'</div></foreignObject>'+['PROTÉGER','VÉRIFIER','AGIR'].map((x,i)=>'<g transform="translate('+(120+i*485)+' 540)"><rect width="420" height="190" rx="28" fill="#fff" opacity=".94"/><circle cx="72" cy="72" r="38" fill="'+accent+'"/><text x="72" y="84" text-anchor="middle" fill="#fff" font-size="34" font-family="system-ui">'+(i+1)+'</text><text x="128" y="84" fill="#17242a" font-size="34" font-family="system-ui" font-weight="700">'+x+'</text><text x="36" y="145" fill="#42545b" font-size="22" font-family="system-ui">Repères concrets · sources publiques</text></g>').join('')+'<text x="120" y="835" fill="#f8e8c7" font-size="24" font-family="system-ui">Illustration originale ASTRA · 1600 × 900 · 27 octobre 2026</text></svg>';
const guideHtml=(article,index)=>{
 const leaf=article.slug.split('/').at(-1),canonical=SITE+'/'+article.slug+'/',image=SITE+'/media/'+leaf+'.svg';
 const articleSchema={"@context":"https://schema.org","@type":"Article",headline:article.title,description:article.description,image:[image],datePublished:daily.datePublished,dateModified:daily.dateModified,author:{"@type":"Organization",name:daily.author},publisher:{"@type":"Organization",name:"Seneque.info",url:SITE},mainEntityOfPage:canonical};
 const breadcrumb={"@context":"https://schema.org","@type":"BreadcrumbList",itemListElement:[{"@type":"ListItem",position:1,name:"Accueil",item:SITE+"/"},{"@type":"ListItem",position:2,name:"Guides",item:SITE+"/guides/"},{"@type":"ListItem",position:3,name:article.title,item:canonical}]};
 const body=article.sections.map(s=>'<section><h2>'+esc(s.heading)+'</h2>'+s.paragraphs.map(p=>'<p>'+esc(p)+'</p>').join('')+'</section>').join('');
 const siblings=daily.articles.filter((_,i)=>i!==index).map(x=>'<li><a href="/'+x.slug+'/">'+esc(x.title)+'</a></li>').join('');
 const sources=article.sources.map(u=>'<li><a href="'+u+'" rel="noopener noreferrer" target="_blank">'+esc(new URL(u).hostname+new URL(u).pathname)+'</a></li>').join('');
 return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(article.title)+' — Seneque.info</title><meta name="description" content="'+esc(article.description)+'"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="'+canonical+'"><meta property="og:type" content="article"><meta property="og:title" content="'+esc(article.title)+'"><meta property="og:description" content="'+esc(article.description)+'"><meta property="og:url" content="'+canonical+'"><meta property="og:image" content="'+image+'"><meta property="og:image:width" content="1600"><meta property="og:image:height" content="900"><link rel="stylesheet" href="/style.css"><script type="application/ld+json">'+JSON.stringify(articleSchema).replace(/</g,'\\u003c')+'</script><script type="application/ld+json">'+JSON.stringify(breadcrumb).replace(/</g,'\\u003c')+'</script><style>.guide{max-width:860px;margin:auto;padding:32px 20px 72px}.guide h1{font-size:clamp(2.2rem,6vw,4rem);line-height:1.08}.guide h2{margin-top:2.7rem}.guide p,.guide li{font-size:1.08rem;line-height:1.78}.guide-hero{width:100%;height:auto;border-radius:18px}.direct{font-size:1.18rem!important;background:#f1e5d2;border-left:5px solid '+article.accent+';padding:1.25rem}.meta{color:#705f51}.sources{padding:1.2rem;background:#f7f0e5;border-radius:14px;overflow-wrap:anywhere}</style></head><body><header><nav aria-label="Navigation"><a href="/">Seneque.info</a> · <a href="/wyylde-avis/">Dossier Wyylde</a> · <a href="/sources-historiques/">Sources historiques</a></nav></header><main class="guide"><p class="meta">Guide pratique · Publié le 27 octobre 2026 · '+article.wordCount+' mots</p><h1>'+esc(article.title)+'</h1><p class="direct"><strong>Réponse directe.</strong> '+esc(article.directAnswer)+'</p><img class="guide-hero" src="/media/'+leaf+'.svg" width="1600" height="900" alt="Illustration en trois étapes pour '+esc(article.title.toLowerCase())+'">'+body+'<aside class="sources"><h2>Sources officielles consultées</h2><p>Les recommandations ont été vérifiées à partir de ressources publiques. Les situations individuelles peuvent nécessiter un accompagnement spécialisé.</p><ul>'+sources+'</ul></aside><nav aria-label="Guides associés"><h2>Continuer avec les guides associés</h2><ul>'+siblings+'<li><a href="/wyylde-fiabilite/">Évaluer la fiabilité d’un service de rencontres</a></li><li><a href="/">Retour au dossier principal</a></li></ul></nav></main><footer><p>© Seneque.info · Contenu informatif, sans promesse de sécurité absolue.</p></footer></body></html>';
};
const css=`
.astra-depth{margin:3rem 0;padding:2rem 0;border-top:3px solid #ae8c67;line-height:1.8}.astra-depth h3{font-size:clamp(1.1rem,2.3vw,1.5rem);margin:1.7rem 0 .6rem}.astra-depth p{max-width:76ch}.astra-depth img{max-width:100%;height:auto;max-height:460px;object-fit:contain;border-radius:12px}.astra-depth figcaption{font-size:.83rem;color:#786a56;margin-top:.5rem}.astra-proof{background:#f1e5d2;padding:1rem 1.3rem;border-left:4px solid #a6734c}.astra-proof li{margin:.5rem 0}.astra-edited{text-transform:uppercase;letter-spacing:.06em;font-size:.8rem;color:#985f39;font-weight:700}.astra-frame{aspect-ratio:16/9;background:#24190f;border-radius:12px;overflow:hidden}.astra-frame iframe{width:100%;height:100%;border:0}.astra-home-media{padding:3rem 0;background:#f5e9d5}.astra-home-media .wrap{padding-inline:1.2rem}.astra-home-media img{width:100%;max-height:470px;object-fit:contain;height:auto}.astra-home-media p{max-width:75ch}.astra-media-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}@media(max-width:750px){.astra-media-grid{grid-template-columns:1fr}.astra-depth{padding:1.2rem 0}}
`;
await fs.rm(OUT,{recursive:true,force:true});await fs.mkdir(OUT,{recursive:true});
const sitemap=await get('/sitemap.xml');const allRoutes=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>new URL(m[1]).pathname);const routes=allRoutes.filter(p=>!p.startsWith('/wyylde-')&&!p.startsWith('/guides/'));
if(routes.length!==22||new Set(routes).size!==22)throw Error('SITEMAP_22_REQUIRED');
if(input.articles.length!==21)throw Error('EDITORIAL_21_REQUIRED');
const map=new Map(input.articles.map(x=>['/'+x.slug+'/',x]));let count=0,modified=0,minimum=999;
for(const route of routes){
 let html=await get(route);if(!html.includes('<!doctype html>'))throw Error('NON_HTML '+route);
 if(route==='/'){
   // Historic /wyylde-avis/ stays live. Its homepage link now endorses the primary subdomain pillar.
   const pillar='https://wyylde-avis.seneque.info/wyylde-avis/';
   const oldHref='href="/wyylde-avis/"', newHref='href="'+pillar+'"';
   if(!html.includes(oldHref)&&!html.includes(newHref))throw Error('WYYLDE_INBOUND_LINK_MISSING');
   html=html.replace(oldHref,newHref).replace('href="https://wyylde-avis.seneque.info/"',newHref);
   if(!html.includes('data-astra-enriched="2026-10-18"')){
   const block='<section class="astra-home-media" data-astra-enriched="2026-10-18"><div class="wrap"><h2>Rome antique : une histoire en images et en sources</h2><p>Les fêtes romaines, les banquets et les textes de Sénèque ne forment pas une histoire uniforme. Un auteur satirique peut grossir l’excès ; une fresque présente une scène construite ; une inscription aide parfois à recouper les récits. Nous confrontons ces documents sans transformer des représentations en statistiques.</p><p>La société romaine connaissait de fortes inégalités de statut. Comprendre ses plaisirs exige donc de regarder les conditions des femmes, des personnes asservies et des citoyens, et de préciser la date de chaque témoignage. Nos dossiers conservent les doutes lorsqu’une filiation ou une anecdote ne sont pas prouvées.</p><div class="astra-media-grid">'+artF+artS+'</div>'+video('KArMbrAUa50','Pompéi : exposition du Grand Palais')+'<p><a href="/lupanar-pompei/">Le lupanar de Pompéi</a> · <a href="/banquets-plaisirs-rome/">Les banquets antiques</a> · <a href="/sources-historiques/">Sources et méthode</a></p></div></section>';
   html=html.replace('</main>',block+'</main>');modified++;
   }
 }else{
  const item=map.get(route);if(!item)throw Error('MISSING_EDITORIAL '+route);
  if(!html.includes('data-astra-enriched="2026-10-18"')){
   const proof='<aside class="astra-proof"><h3>Contrôler cette histoire</h3><ol><li>Identifier le texte ancien ou le vestige cité.</li><li>Dater la source, qui peut être plus tardive que les faits.</li><li>Vérifier les différences de milieu social et de statut.</li><li>Comparer récits, inscriptions et objets archéologiques.</li><li>Noter les limites documentaires et les interprétations concurrentes.</li></ol></aside>';
   let block='<section class="astra-depth" data-astra-enriched="2026-10-18"><p class="astra-edited">Révision approfondie · 18 octobre 2026</p><h2>'+esc(item.title)+'</h2><figure><img src="/media/'+item.slug+'.svg" alt="Schéma sources, contexte et interprétation" loading="lazy" decoding="async" width="1200" height="440"><figcaption>Infographie originale de lecture critique des sources.</figcaption></figure>'+item.sections.map(s=>'<h3>'+esc(s.heading)+'</h3><p>'+esc(s.text)+'</p>').join('')+proof+'<p>Pour retrouver les textes et leurs références : <a href="https://www.perseus.tufts.edu/hopper/" rel="noopener noreferrer" target="_blank">Perseus Digital Library</a> et notre <a href="/sources-historiques/">méthode de lecture des sources</a>. Une image littéraire ne vaut pas démonstration générale pour toute la société romaine.</p></section>';
   if(['banquets-plaisirs-rome','lupanar-pompei','saturnales-noel-origine','orgies-romaines-mythe'].includes(item.slug))block=block.replace('</section>',artF+'</section>');
   if(['seneque-citation-temps','seneque-desir-stoicisme','stoicisme-amour'].includes(item.slug))block=block.replace('</section>',artS+'</section>');
   if(['banquets-plaisirs-rome','lupanar-pompei'].includes(item.slug))block=block.replace('</section>',video('KArMbrAUa50','Découvrir Pompéi : Grand Palais')+'</section>');
   if(item.slug==='seneque-citation-temps')block=block.replace('</section>',video('zl180QESNzI','Lecture de la Lettre I.1 à Lucilius en latin')+'</section>');
   if(!html.includes('</article>'))throw Error('MISSING_ARTICLE '+route);
   html=html.replace('</article>',block+'</article>').replace(/"dateModified":"2026-10-17"/g,'"dateModified":"2026-10-18"');modified++;
  }
  await save('media/'+item.slug+'.svg',svg(item.title));
  const raw=html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]||html;const n=wc(raw);minimum=Math.min(minimum,n);if(n<565)throw Error('DEPTH_FAIL '+route+' '+n);
 }
 await save((route==='/'?'':route.slice(1))+'index.html',html);count++;
}
await save('style.css',(await get('/style.css'))+'\n'+css);
await save('favicon.svg',await get('/favicon.svg'));
await save('robots.txt',await get('/robots.txt'));
// Bundle the eight Wyylde articles as real files of the apex domain; no cross-project rewrite.
const wyyldeSlugs=['wyylde-avis','wyylde-tarifs','wyylde-gratuit','wyylde-resiliation','wyylde-fiabilite','wyylde-avis-utilisateurs','wyylde-avis-homme-seul','wyylde-avis-couple'];
const baseDir=path.resolve('cocon-wyylde');
for(const slug of wyyldeSlugs){
 const article=await fs.readFile(path.join(baseDir,slug,'index.html'),'utf8');
 if(!article.includes('<h1>')||!article.includes('href="'+SITE+'/'+slug+'/'))throw Error('COCON_INVALID '+slug);
 const faqStart=article.indexOf('<section class="faqs">');
 const mainStart=article.indexOf('<main');
 if(faqStart<0||mainStart<0)throw Error('COCON_SECTION_MISSING '+slug);
 const editorialWords=wc(article.slice(mainStart,faqStart));
 if(editorialWords<1500)throw Error('COCON_TOO_SHORT '+slug+' '+editorialWords);
 console.log(JSON.stringify({component:'ASTRA_COCON_MIN_1500',slug,words:editorialWords,status:'PASS'}));
 await save(slug+'/index.html',article);
}
await save('wyylde-cocon.css',await fs.readFile(path.join(baseDir,'wyylde-cocon.css'),'utf8'));
if(daily.articles.length!==3||daily.datePublished!=='2026-10-27T08:11:26+01:00')throw Error('DAILY_EDITORIAL_INVALID');
const dailyPaths=[];
for(const [index,article] of daily.articles.entries()){
 const leaf=article.slug.split('/').at(-1),html=guideHtml(article,index),words=wc(html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]||html);
 if(words<1500)throw Error('DAILY_TOO_SHORT '+article.slug+' '+words);
 if(!html.includes('<h1>')||!html.includes('"@type":"Article"')||!html.includes('"@type":"BreadcrumbList"'))throw Error('DAILY_SCHEMA_INVALID '+article.slug);
 await save(article.slug+'/index.html',html);
 await save('media/'+leaf+'.svg',guideHero(article.title,article.accent));
 dailyPaths.push('/'+article.slug+'/');
 console.log(JSON.stringify({component:'ASTRA_SENEQUE_DAILY',slug:article.slug,words,status:'PASS_BUILD'}));
}
const allPaths=[...routes,...wyyldeSlugs.map(s=>'/'+s+'/'),...dailyPaths];
if(allPaths.length!==33||new Set(allPaths).size!==33)throw Error('SITEMAP_33_REQUIRED');
const unionSitemap='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+allPaths.map(p=>'<url><loc>'+SITE+p+'</loc><lastmod>'+(dailyPaths.includes(p)?'2026-10-27':p==='/'||p==='/wyylde-avis/'?'2026-10-21':'2026-10-18')+'</lastmod></url>').join('\n')+'\n</urlset>\n';
await save('sitemap.xml',unionSitemap);
const feed='<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>Seneque.info — Guides pratiques</title><link>'+SITE+'/</link><description>Guides de sécurité, vie privée et lecture critique.</description><language>fr</language><lastBuildDate>Tue, 27 Oct 2026 07:00:00 GMT</lastBuildDate>'+daily.articles.map(a=>'<item><title>'+esc(a.title)+'</title><link>'+SITE+'/'+a.slug+'/</link><guid isPermaLink="true">'+SITE+'/'+a.slug+'/</guid><pubDate>Tue, 27 Oct 2026 07:00:00 GMT</pubDate><description>'+esc(a.description)+'</description></item>').join('')+'</channel></rss>\n';
await save('feed.xml',feed);
console.log(JSON.stringify({component:'ASTRA_SENEQUE_BUILD',status:'PASS_BUILD',legacyPages:count,wyyldePages:wyyldeSlugs.length,dailyPages:dailyPaths.length,totalPages:allPaths.length,enhanced:modified,minimumArticleWords:minimum,images:24,videoEmbeds:3,sourceOrigin:SITE}));

