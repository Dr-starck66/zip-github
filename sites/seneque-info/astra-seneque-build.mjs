#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
const SITE='https://seneque.info',OUT=path.resolve('dist'),input=JSON.parse(await fs.readFile('enrichment-2026-10-18.json','utf8'));
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
const css=`
.astra-depth{margin:3rem 0;padding:2rem 0;border-top:3px solid #ae8c67;line-height:1.8}.astra-depth h3{font-size:clamp(1.1rem,2.3vw,1.5rem);margin:1.7rem 0 .6rem}.astra-depth p{max-width:76ch}.astra-depth img{max-width:100%;height:auto;max-height:460px;object-fit:contain;border-radius:12px}.astra-depth figcaption{font-size:.83rem;color:#786a56;margin-top:.5rem}.astra-proof{background:#f1e5d2;padding:1rem 1.3rem;border-left:4px solid #a6734c}.astra-proof li{margin:.5rem 0}.astra-edited{text-transform:uppercase;letter-spacing:.06em;font-size:.8rem;color:#985f39;font-weight:700}.astra-frame{aspect-ratio:16/9;background:#24190f;border-radius:12px;overflow:hidden}.astra-frame iframe{width:100%;height:100%;border:0}.astra-home-media{padding:3rem 0;background:#f5e9d5}.astra-home-media .wrap{padding-inline:1.2rem}.astra-home-media img{width:100%;max-height:470px;object-fit:contain;height:auto}.astra-home-media p{max-width:75ch}.astra-media-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}@media(max-width:750px){.astra-media-grid{grid-template-columns:1fr}.astra-depth{padding:1.2rem 0}}
`;
await fs.rm(OUT,{recursive:true,force:true});await fs.mkdir(OUT,{recursive:true});
const sitemap=await get('/sitemap.xml');const routes=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>new URL(m[1]).pathname);
if(routes.length!==22||new Set(routes).size!==22)throw Error('SITEMAP_22_REQUIRED');
if(input.articles.length!==21)throw Error('EDITORIAL_21_REQUIRED');
const map=new Map(input.articles.map(x=>['/'+x.slug+'/',x]));let count=0,modified=0,minimum=999;
for(const route of routes){
 let html=await get(route);if(!html.includes('<!doctype html>'))throw Error('NON_HTML '+route);
 if(route==='/'){
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
await save('sitemap.xml',sitemap.replace(/<lastmod>2026-10-17<\/lastmod>/g,'<lastmod>2026-10-18</lastmod>'));
console.log(JSON.stringify({component:'ASTRA_SENEQUE_BUILD',status:'PASS_BUILD',pages:count,enhanced:modified,minimumArticleWords:minimum,images:21,videoEmbeds:3,sourceOrigin:SITE}));
