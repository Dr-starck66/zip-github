import fs from "node:fs";
import path from "node:path";
import { filterRelevantSources } from "../astra-global/astra-news-source-integrity-guard.mjs";

const root = path.resolve("astra-local-os");
const articlesDir = path.join(root,"articles");
fs.mkdirSync(articlesDir,{recursive:true});
const BASE="https://dr-starck66.github.io/zip-github/astra-local-os";
const slots=[["matin",7,15],["midi",12,15],["soir",18,15]];
const themes=[
["receptionniste-ia","Réceptionniste IA : ce que les petites entreprises doivent surveiller aujourd’hui","assistant IA accueil client PME","Appels manqués, automatisation et qualité de service : les signaux qui comptent pour les PME locales."],
["seo-local","SEO local : les signaux qui peuvent faire gagner des clients cette semaine","référencement local Google PME","Visibilité locale, avis, contenu utile et conversion : une lecture pratique des tendances du moment."],
["automatisation-pme","Automatisation des PME : où l’IA crée réellement de la valeur","automatisation PME intelligence artificielle","Les cas d’usage qui réduisent les tâches répétitives sans dégrader l’expérience client."],
["rendez-vous","Prise de rendez-vous : pourquoi la vitesse de réponse devient un avantage commercial","prise de rendez-vous en ligne PME","Du premier contact au rappel, les détails opérationnels qui transforment un prospect en client."],
["experience-client","Expérience client locale : les nouveaux standards de réponse et de suivi","expérience client commerces locaux numérique","Ce que les petites entreprises peuvent améliorer immédiatement dans leur accueil numérique."],
["prospection-locale","Prospection locale : comment repérer les entreprises qui perdent des opportunités","prospection locale PME digitalisation","Les indices publics qui révèlent un besoin de modernisation commerciale ou numérique."],
["productivite-tpe","Productivité des TPE : les automatisations qui libèrent vraiment du temps","productivité TPE automatisation","Une méthode pragmatique pour automatiser sans transformer l’entreprise en usine à gaz."]
];

function parts(d=new Date()){
  const f=new Intl.DateTimeFormat("fr-FR",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
  const p=Object.fromEntries(f.formatToParts(d).map(x=>[x.type,x.value]));
  return {date:`${p.year}-${p.month}-${p.day}`,hour:+p.hour,minute:+p.minute};
}
function esc(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function seed(s){return [...s].reduce((a,c)=>a+c.charCodeAt(0),0)}
async function news(query){
  try{
    const u=`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=fr&gl=FR&ceid=FR:fr`;
    const r=await fetch(u,{headers:{"user-agent":"ASTRA-Local-OS/1.0"}});
    const xml=await r.text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0,6).map(m=>{
      const x=m[1],grab=re=>(x.match(re)?.[1]||"").replace(/<!\[CDATA\[|\]\]>/g,"").replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").trim();
      return {title:grab(/<title>([\s\S]*?)<\/title>/),link:grab(/<link>([\s\S]*?)<\/link>/),source:grab(/<source[^>]*>([\s\S]*?)<\/source>/)};
    }).filter(x=>x.title&&x.link);
  }catch{return []}
}
const paragraphs=[
"Pour une petite entreprise, la transformation numérique n’est utile que lorsqu’elle réduit une friction mesurable. Le délai de réponse, les appels manqués, les demandes de devis sans suivi et les rendez-vous oubliés sont des problèmes simples à décrire mais coûteux lorsqu’ils se répètent chaque semaine. L’automatisation devient intéressante lorsqu’elle relie ces étapes au lieu d’ajouter un outil isolé. Un réceptionniste numérique, un CRM léger et un calendrier partagé peuvent ainsi fonctionner comme un même parcours. Le client obtient une réponse rapide tandis que l’entreprise conserve le contexte nécessaire pour reprendre la main au bon moment.",
"Le contenu éditorial appartient au même système. Un article bien construit peut répondre à une question réelle, attirer une recherche locale et conduire vers une page de service ou une prise de rendez-vous. Le volume seul ne suffit pas. Trois publications quotidiennes n’ont de sens que si chacune possède un angle distinct, une date claire, des sources identifiables et un objectif précis. L’enjeu consiste à publier assez vite pour rester pertinent sans sacrifier la fiabilité. Les titres doivent informer avant de séduire, et l’article doit apporter davantage que la simple reformulation d’un sujet déjà visible partout ailleurs.",
"La qualité de l’accueil reste centrale. Les intentions récurrentes sont généralement prévisibles : connaître un prix, vérifier un horaire, prendre un rendez-vous, modifier une réservation, demander une adresse ou signaler une urgence. Ces demandes peuvent être orientées automatiquement, mais la machine doit aussi savoir reconnaître les cas où un humain est nécessaire. La meilleure expérience n’est donc pas celle qui automatise tout. C’est celle qui automatise les tâches répétitives et réserve l’attention humaine aux situations qui la justifient réellement. Ce principe limite les erreurs et renforce la confiance.",
"La prospection locale peut également être améliorée par des signaux publics. Un site très lent, une absence de formulaire, un parcours mobile difficile ou l’impossibilité de réserver en ligne peuvent indiquer une opportunité de modernisation. Ces indices ne prouvent pas qu’une entreprise achètera un service, mais ils permettent de mieux prioriser les démarches. Au lieu de contacter indistinctement des centaines d’entreprises, il devient possible de préparer quelques démonstrations personnalisées pour des prospects dont le problème est observable. La pertinence commerciale augmente alors sans dépendre d’un volume massif de messages.",
"Un autre enjeu est la cohérence des données. Lorsque les informations de contact, les conversations, les rendez-vous et les performances éditoriales restent dans des outils séparés, personne ne voit le parcours complet. En les rapprochant, on peut comprendre qu’une requête précise a généré une lecture, puis une conversation et enfin un rendez-vous. Cette visibilité permet d’investir dans ce qui fonctionne réellement. Elle évite aussi de confondre activité et résultat : beaucoup de pages vues ou beaucoup de messages ne constituent pas nécessairement une acquisition efficace si aucune étape suivante n’est mesurée.",
"La publication destinée à Google Discover ou Google News impose une discipline supplémentaire. Aucune fréquence de publication ne garantit une diffusion. Les systèmes de Google évaluent notamment la pertinence, la fraîcheur, la qualité et la fiabilité des contenus. Les bonnes pratiques techniques — pages indexables, données structurées, dates, canonical, sitemap et grandes images — améliorent le terrain, mais elles ne remplacent jamais l’intérêt éditorial. La stratégie doit donc rester fondée sur l’utilité pour le lecteur et sur l’analyse des résultats réels dans Search Console plutôt que sur une promesse de visibilité automatique.",
"Les signaux d’actualité doivent eux aussi être traités avec prudence. Un titre repéré dans un flux constitue d’abord une piste, pas une preuve suffisante. Il faut vérifier le contexte, distinguer les annonces des résultats et attribuer clairement les informations importantes. Cette méthode protège le site contre les effets de mode et les raccourcis. Elle produit aussi des articles plus utiles : au lieu d’empiler des nouvelles, le contenu explique ce que le sujet change concrètement pour une entreprise locale et quelles décisions pratiques peuvent en découler.",
"La vitesse de réponse commerciale mérite une attention particulière. Lorsqu’un prospect cherche un plombier, un garage, un hôtel ou un salon, il contacte souvent plusieurs entreprises à quelques minutes d’intervalle. La première réponse claire bénéficie d’un avantage évident, mais une réponse rapide et mauvaise reste contre-productive. Le système doit donc combiner rapidité, précision et continuité. Après la première interaction, il faut conserver la demande, proposer l’action suivante et permettre à un humain de reprendre facilement le dossier. C’est cette continuité qui transforme un simple chatbot en véritable outil opérationnel.",
"Une mise en place efficace commence par les cas les plus fréquents. Il est inutile de prévoir des centaines de scénarios si six intentions représentent déjà la majorité des demandes. L’entreprise peut d’abord mesurer ce qui entre, construire des réponses simples, puis observer les situations où l’automatisation échoue. Chaque échec devient alors un signal d’amélioration. Avec le temps, le produit accumule une connaissance pratique du métier : questions récurrentes, objections, saisons fortes, demandes urgentes et services qui génèrent le plus de rendez-vous. Cette mémoire structurée devient progressivement un actif.",
"La mesure doit rester lisible. Pour le réceptionniste, on suivra le taux de demandes qualifiées, les rendez-vous créés et les escalades. Pour le contenu, on observera les impressions, les clics, les requêtes, les pages d’entrée et les conversions assistées. Pour la prospection, on comparera les entreprises repérées, les démonstrations préparées et les ventes obtenues. Ces indicateurs simples permettent de décider où investir du temps. Ils évitent aussi un piège classique des outils automatisés : produire beaucoup d’activité sans savoir si cette activité crée réellement de la valeur.",
"Les meilleures boucles d’amélioration relient ces indicateurs entre eux. Une question souvent posée au téléphone peut devenir un article ; un article qui attire de nombreuses recherches peut inspirer une nouvelle réponse de l’assistant ; une objection répétée dans les conversations peut modifier la présentation d’une offre. À mesure que ces connexions apparaissent, le système cesse d’être une juxtaposition de fonctions. Il devient une infrastructure d’apprentissage commercial. L’entreprise ne se contente plus de répondre aux demandes : elle comprend progressivement pourquoi certaines demandes apparaissent et comment mieux les convertir.",
"Cette approche reste volontairement pragmatique. Une PME n’a pas besoin d’un projet technologique spectaculaire pour améliorer son acquisition. Elle a besoin d’un parcours fiable, observable et facile à reprendre par un humain. L’automatisation doit réduire la charge, pas créer une dépendance à une interface supplémentaire. C’est pourquoi la valeur d’une plateforme intégrée vient surtout de son orchestration : attirer, répondre, qualifier, planifier, publier et mesurer dans un même flux. La technologie devient alors un moyen de protéger les opportunités commerciales plutôt qu’une fin en soi."
];

function stripText(value=""){return String(value).replace(/<[^>]+>/g," ").replace(/&[a-z0-9#]+;/gi," ").replace(/\s+/g," ").trim()}
function repairExistingSourceSection(html){
  const title=stripText((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]||"");
  const sectionRx=/<section><h2>Sources et signaux consultés<\/h2>([\s\S]*?)<\/section>/i;
  const match=html.match(sectionRx);
  if(!match||!title) return html;
  const items=[...match[1].matchAll(/<li><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>(?:\s*—\s*([^<]*))?<\/li>/gi)].map((m)=>({
    link:m[1],
    url:m[1],
    title:stripText(m[2]),
    source:stripText(m[3]||""),
    label:stripText(m[3]||m[2]),
    status:"CORROBORATED"
  }));
  if(!items.length) return html;
  const kept=filterRelevantSources({title},items,{minOverlap:1});
  const sourceHtml=kept.length
    ? `<ul>${kept.map(s=>`<li><a rel="nofollow noopener" href="${esc(s.link)}">${esc(s.title)}</a>${s.source?" — "+esc(s.source):""}</li>`).join("")}</ul>`
    : "<p>Aucun signal d’actualité suffisamment pertinent n’est conservé pour cette édition ; le contenu repose sur le cadre éditorial permanent.</p>";
  return html.replace(sectionRx,`<section><h2>Sources et signaux consultés</h2>${sourceHtml}</section>`);
}

function articleHtml(meta,sources){
  const canonical=`${BASE}/articles/${meta.file}`;
  const sourceHtml=sources.length?`<ul>${sources.map(s=>`<li><a rel="nofollow noopener" href="${esc(s.link)}">${esc(s.title)}</a>${s.source?" — "+esc(s.source):""}</li>`).join("")}</ul>`:"<p>Aucun signal d’actualité fiable n’a été récupéré lors de cette génération ; l’analyse repose sur le cadre éditorial permanent.</p>";
  const sections=["Pourquoi ce sujet compte aujourd’hui","Ce qui change dans l’acquisition locale","Accueil client : vitesse et confiance","Prospection : passer du volume à la pertinence","Relier contenu, CRM et rendez-vous","Google Discover et Google News : ce qui est réellement maîtrisable"];
  const content=sections.map((h,i)=>`<section><h2>${h}</h2><p>${paragraphs[i*2]}</p><p>${paragraphs[i*2+1]}</p></section>`).join("");
  const ld={"@context":"https://schema.org","@type":"NewsArticle","headline":meta.title,"description":meta.dek,"datePublished":meta.iso,"dateModified":meta.iso,"mainEntityOfPage":canonical,"author":{"@type":"Organization","name":"Rédaction ASTRA Local"},"publisher":{"@type":"Organization","name":"ASTRA Local OS","url":BASE}};
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(meta.title)} — ASTRA Local</title><meta name="description" content="${esc(meta.dek)}"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="${canonical}"><script type="application/ld+json">${JSON.stringify(ld)}</script><style>body{max-width:840px;margin:auto;padding:40px 22px;background:#07111d;color:#edf4f8;font:18px/1.7 system-ui}a{color:#74c0fc}h1{font-size:46px;line-height:1.08}h2{margin-top:38px}.muted{color:#9fb3c6}.back{display:inline-block;padding:9px 13px;border:1px solid #315c78;border-radius:10px}</style></head><body><a class="back" href="../">← ASTRA Local OS</a><p class="muted">${meta.date} · ${meta.slot}</p><h1>${esc(meta.title)}</h1><p class="muted">${esc(meta.dek)}</p>${content}<section><h2>Sources et signaux consultés</h2>${sourceHtml}</section><p class="muted"><strong>Note éditoriale :</strong> une apparition dans Google Discover ou Google News n’est jamais garantie.</p></body></html>`;
}

const now=parts(), all=[];
for(const [slot,h,m] of slots){
  if(now.hour*60+now.minute < h*60+m) continue;
  const theme=themes[(seed(now.date)+slots.findIndex(x=>x[0]===slot)*2)%themes.length];
  const file=`${now.date}-${theme[0]}.html`;
  const iso=`${now.date}T${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:00${new Intl.DateTimeFormat("en",{timeZone:"Europe/Paris",timeZoneName:"longOffset"}).formatToParts(new Date(now.date+"T12:00:00Z")).find(x=>x.type==="timeZoneName").value.replace("GMT","")}`;
  const meta={file,title:theme[1],query:theme[2],dek:theme[3],date:now.date,slot,iso};
  const target=path.join(articlesDir,file);
  if(!fs.existsSync(target)) {
    const rawSources = await news(meta.query);
    const filteredSources = filterRelevantSources(
      { title: meta.title, description: meta.dek, query: meta.query },
      rawSources.map((s) => ({
        ...s,
        label: s.source || "Google News",
        title: s.title,
        url: s.link,
        status: "CORROBORATED"
      })),
      { minOverlap: 1 }
    );
    fs.writeFileSync(target,articleHtml(meta,filteredSources));
  }
}

for(const f of fs.readdirSync(articlesDir).filter(x=>x.endsWith(".html")).sort().reverse()){
  const articlePath=path.join(articlesDir,f);
  const originalHtml=fs.readFileSync(articlePath,"utf8");
  const html=repairExistingSourceSection(originalHtml);
  if(html!==originalHtml) fs.writeFileSync(articlePath,html);
  const title=(html.match(/<h1>(.*?)<\/h1>/)||[])[1]||f;
  const date=f.slice(0,10);
  all.push({file:f,title,date});
}
fs.writeFileSync(path.join(root,"articles.json"),JSON.stringify(all.slice(0,120),null,2));
fs.writeFileSync(path.join(root,"sitemap.xml"),`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${BASE}/</loc></url>${all.map(a=>`<url><loc>${BASE}/articles/${a.file}</loc><lastmod>${a.date}</lastmod></url>`).join("")}</urlset>`);
const recent=all.filter(a=>(Date.now()-new Date(a.date+"T00:00:00Z"))<3*86400000);
fs.writeFileSync(path.join(root,"news-sitemap.xml"),`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${recent.map(a=>`<url><loc>${BASE}/articles/${a.file}</loc><news:news><news:publication><news:name>ASTRA Local OS</news:name><news:language>fr</news:language></news:publication><news:publication_date>${a.date}</news:publication_date><news:title>${esc(a.title)}</news:title></news:news></url>`).join("")}</urlset>`);
fs.writeFileSync(path.join(root,"feed.xml"),`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>ASTRA Local OS</title><link>${BASE}/</link><description>IA, acquisition locale et automatisation des PME.</description>${all.slice(0,20).map(a=>`<item><title>${esc(a.title)}</title><link>${BASE}/articles/${a.file}</link><guid>${BASE}/articles/${a.file}</guid><pubDate>${new Date(a.date+"T12:00:00Z").toUTCString()}</pubDate></item>`).join("")}</channel></rss>`);
fs.writeFileSync(path.join(root,"robots.txt"),`User-agent: *\nAllow: /\nSitemap: ${BASE}/sitemap.xml\nSitemap: ${BASE}/news-sitemap.xml\n`);
console.log(`ASTRA publisher: ${all.length} article(s) total, local time ${now.date} ${now.hour}:${String(now.minute).padStart(2,"0")}`);
