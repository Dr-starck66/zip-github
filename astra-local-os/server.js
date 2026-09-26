import http from "node:http";
import dns from "node:dns/promises";
import net from "node:net";

const PORT = Number(process.env.PORT || 10000);
const BRAND = "ASTRA Local OS";
const CITY = process.env.BUSINESS_CITY || "Perpignan";

const esc = (s="") => String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const json = (res,status,data)=>{res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});res.end(JSON.stringify(data));};
const text = (res,status,data,type="text/plain; charset=utf-8")=>{res.writeHead(status,{"content-type":type});res.end(data);};
const body = req => new Promise((resolve,reject)=>{let b="";req.on("data",c=>{b+=c;if(b.length>1e6){reject(new Error("too_large"));req.destroy();}});req.on("end",()=>resolve(b));req.on("error",reject);});
const siteBase = req => `${req.headers["x-forwarded-proto"]||"https"}://${req.headers.host}`;

function parisParts(date=new Date()){
  const f=new Intl.DateTimeFormat("fr-FR",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
  const p=Object.fromEntries(f.formatToParts(date).map(x=>[x.type,x.value]));
  return {date:`${p.year}-${p.month}-${p.day}`,hour:+p.hour,minute:+p.minute};
}
const slots=[["Matin",7,15],["Midi",12,15],["Soir",18,15]];
const themes=[
  ["receptionniste-ia","Réceptionniste IA : ce que les petites entreprises doivent surveiller aujourd’hui","assistant IA accueil client PME","Appels manqués, automatisation et qualité de service : les signaux qui comptent pour les PME locales."],
  ["seo-local","SEO local : les signaux qui peuvent faire gagner des clients cette semaine","référencement local Google PME","Visibilité locale, avis, contenu utile et conversion : une lecture pratique des tendances du moment."],
  ["automatisation-pme","Automatisation des PME : où l’IA crée réellement de la valeur","automatisation PME intelligence artificielle","Les cas d’usage qui réduisent les tâches répétitives sans dégrader l’expérience client."],
  ["rendez-vous","Prise de rendez-vous : pourquoi la vitesse de réponse devient un avantage commercial","prise de rendez-vous en ligne PME","Du premier contact au rappel, les détails opérationnels qui transforment un prospect en client."],
  ["experience-client","Expérience client locale : les nouveaux standards de réponse et de suivi","expérience client commerces locaux numérique","Ce que les petites entreprises peuvent améliorer immédiatement dans leur accueil numérique."],
  ["prospection-locale","Prospection locale : comment repérer les entreprises qui perdent des opportunités","prospection locale PME digitalisation","Les indices publics qui révèlent un besoin de modernisation commerciale ou numérique."],
  ["productivite-tpe","Productivité des TPE : les automatisations qui libèrent vraiment du temps","productivité TPE automatisation","Une méthode pragmatique pour automatiser sans transformer l’entreprise en usine à gaz."]
];
function offsetForParis(dateStr){
  const p=new Intl.DateTimeFormat("en",{timeZone:"Europe/Paris",timeZoneName:"longOffset"}).formatToParts(new Date(dateStr+"T12:00:00Z")).find(x=>x.type==="timeZoneName")?.value||"GMT+01:00";
  return p.replace("GMT","");
}
function dailyPosts(dateStr){
  const seed=[...dateStr].reduce((a,c)=>a+c.charCodeAt(0),0);
  return slots.map((s,i)=>{
    const t=themes[(seed+i*2)%themes.length];
    return {key:t[0],title:t[1],query:t[2],dek:t[3],slot:s[0],publishAt:`${dateStr}T${String(s[1]).padStart(2,"0")}:${String(s[2]).padStart(2,"0")}:00${offsetForParis(dateStr)}`,slug:`${dateStr}-${t[0]}`,date:dateStr};
  });
}
const published=(p,now=new Date())=>new Date(p.publishAt)<=now;

const intents=[
  ["emergency",/\b(urgence|urgent|immédiat|immediat|panne|bloqué|bloque)\b/i],
  ["cancel",/\b(annul|déplac|deplac|modifier|reporter)\b/i],
  ["appointment",/\b(rendez[- ]?vous|rdv|réserver|reserver|disponib|créneau|creneau)\b/i],
  ["hours",/\b(horaires?|ouvert|fermé|ferme|heures?)\b/i],
  ["price",/\b(prix|tarif|coût|cout|combien|devis)\b/i],
  ["location",/\b(adresse|où|ou êtes|localisation|venir)\b/i]
];
function receptionist(message=""){
  const intent=intents.find(x=>x[1].test(message))?.[0]||"general";
  const replies={
    emergency:"Je marque votre demande comme prioritaire. Donnez-moi votre nom, votre numéro et le problème précis pour un rappel rapide.",
    cancel:"Bien sûr. Donnez-moi le nom utilisé pour la réservation et la date du rendez-vous afin de préparer la modification.",
    appointment:"Je peux préparer un rendez-vous. Indiquez le service souhaité et votre préférence : matin, midi ou fin de journée.",
    hours:"L’établissement accueille les demandes du lundi au vendredi de 8 h 30 à 18 h 30. L’assistant reste disponible 24 h/24.",
    price:"Dites-moi le service qui vous intéresse et quelques détails : je préparerai une demande de devis claire pour l’équipe.",
    location:`L’établissement dessert ${CITY} et ses environs. Je peux enregistrer votre adresse si une intervention doit se faire chez vous.`,
    general:"Je peux vous aider pour un rendez-vous, un devis, les horaires, une modification de réservation ou transmettre une demande à l’équipe."
  };
  return {intent,reply:replies[intent],shouldEscalate:intent==="emergency"};
}

function layout(req,title,description,main,path="/",jsonLd=[],image="/media/cover.svg"){
  const base=siteBase(req),url=base+path;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"><link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${base+image}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="675"><meta name="twitter:card" content="summary_large_image">
${jsonLd.map(x=>`<script type="application/ld+json">${JSON.stringify(x).replace(/</g,"\\u003c")}</script>`).join("")}
<style>
:root{--bg:#06101a;--card:#0d1d2d;--card2:#122b42;--text:#f5f8fb;--muted:#9eb2c5;--line:#27445d;--a:#62e6be;--b:#74c0fc}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top right,#123657 0,#07111d 40%,#050c13 100%);color:var(--text);font:16px/1.6 Inter,system-ui,-apple-system,Segoe UI,sans-serif}a{color:inherit;text-decoration:none}.wrap{max-width:1160px;margin:auto;padding:0 22px}.nav{position:sticky;top:0;z-index:5;background:#06101ae8;backdrop-filter:blur(12px);border-bottom:1px solid #ffffff12}.navin{height:68px;display:flex;align-items:center;justify-content:space-between}.brand{font-weight:900;font-size:20px;letter-spacing:-.04em}.brand span{color:var(--a)}.links{display:flex;gap:18px;color:var(--muted)}.hero{padding:84px 0 48px;display:grid;grid-template-columns:1.15fr .85fr;gap:34px;align-items:center}.kicker,.badge{display:inline-flex;padding:6px 10px;border-radius:999px;border:1px solid #2e5874;color:#bce9ff;font-size:12px}.hero h1{font-size:clamp(44px,7vw,76px);line-height:.98;letter-spacing:-.055em;margin:16px 0}.hero p,.muted{color:var(--muted)}.actions{display:flex;gap:10px;flex-wrap:wrap}.btn{display:inline-flex;padding:12px 16px;border-radius:12px;background:var(--a);color:#032018;font-weight:900;border:0;cursor:pointer}.btn.secondary{background:#17344f;color:white}.panel,.card{background:linear-gradient(180deg,var(--card2),var(--card));border:1px solid var(--line);border-radius:20px;padding:20px;box-shadow:0 18px 50px #0004}.section{padding:38px 0}.section h2{font-size:34px;letter-spacing:-.04em;margin-bottom:8px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.metric{padding:16px;border:1px solid var(--line);border-radius:14px}.metric strong{display:block;font-size:28px}.bloggrid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.post h3{font-size:21px;line-height:1.2}.article{max-width:840px;margin:auto;padding:56px 22px}.article h1{font-size:48px;line-height:1.05;letter-spacing:-.045em}.article p{font-size:18px;color:#d7e1ea}.article h2{margin-top:38px}.chat{height:340px;overflow:auto;border:1px solid var(--line);border-radius:14px;padding:12px;background:#07131f}.bubble{max-width:82%;padding:11px 13px;margin:8px 0;border-radius:14px;background:#163049}.bubble.me{margin-left:auto;background:#205540}.chatrow{display:flex;gap:10px;margin-top:10px}.chatrow input{flex:1;padding:13px;border-radius:12px;border:1px solid var(--line);background:#091724;color:white}.table{width:100%;border-collapse:collapse}.table th,.table td{text-align:left;padding:11px;border-bottom:1px solid var(--line)}footer{padding:38px 0 58px;border-top:1px solid var(--line);margin-top:44px;color:var(--muted)}@media(max-width:850px){.hero,.grid,.bloggrid{grid-template-columns:1fr}.metrics{grid-template-columns:repeat(2,1fr)}.links{display:none}.article h1{font-size:38px}}
</style></head><body><header class="nav"><div class="wrap navin"><a class="brand" href="/">ASTRA <span>Local OS</span></a><nav class="links"><a href="/#produit">Produit</a><a href="/blog">Blog</a><a href="/demo">Démo</a><a href="/dashboard">Dashboard</a></nav><a class="btn" href="/demo">Tester l’accueil IA</a></div></header>${main}<footer><div class="wrap">ASTRA Local OS · Réceptionniste IA, CRM, prospection locale et moteur éditorial. Une apparition dans Google Discover ou Google News n’est jamais garantie.</div></footer></body></html>`;
}

function home(req){
  const org={"@context":"https://schema.org","@type":"Organization","name":BRAND,"url":siteBase(req)};
  const app={"@context":"https://schema.org","@type":"SoftwareApplication","name":BRAND,"applicationCategory":"BusinessApplication","operatingSystem":"Web"};
  return layout(req,BRAND+" — AI Business-in-a-Box","Réceptionniste IA, CRM, prospection locale et trois publications quotidiennes.",`<main class="wrap"><section class="hero"><div><span class="kicker">AI Business-in-a-Box</span><h1>Attirer. Répondre. Qualifier. Réserver. Publier.</h1><p>Un système unique pour les entreprises locales : réceptionniste IA, CRM, rendez-vous, radar commercial et moteur éditorial à trois publications par jour.</p><div class="actions"><a class="btn" href="/dashboard">Ouvrir le cockpit</a><a class="btn secondary" href="/demo">Tester le réceptionniste</a></div></div><div class="panel"><span class="kicker">Pipeline autonome</span><h2>24/7 → 3×/jour</h2><p class="muted">Accueil client permanent, qualification immédiate et publication programmée matin, midi et soir.</p><div class="metrics"><div class="metric"><strong>24/7</strong><span class="muted">accueil</span></div><div class="metric"><strong>3</strong><span class="muted">articles/jour</span></div><div class="metric"><strong>12</strong><span class="muted">prospects</span></div><div class="metric"><strong>1</strong><span class="muted">cockpit</span></div></div></div></section><section id="produit" class="section"><h2>Six briques, un seul moteur commercial</h2><div class="grid">${[["Réceptionniste IA","Qualifie les demandes et escalade les urgences."],["CRM local","Centralise prospects, demandes et rendez-vous."],["Prospect Radar","Repère les entreprises locales sous-équipées."],["Site Audit","Analyse les fondamentaux d’un site public."],["Content Engine","Prépare trois articles quotidiens indexables."],["Evidence Loop","Relie contenu, demandes et conversions."]].map(x=>`<article class="card"><h3>${x[0]}</h3><p class="muted">${x[1]}</p></article>`).join("")}</div></section></main>`,"/",[org,app]);
}

function dashboard(req){
  const rows=[["Garage Catalan","Garage","91","Démo prête"],["Atelier Vernet","Artisan","86","À contacter"],["Studio Canet","Beauté","83","Qualifié"],["Hôtel du Centre","Hôtel","79","À auditer"]];
  return layout(req,"Cockpit — "+BRAND,"Pilotage des prospects, rendez-vous et contenus.",`<main class="wrap section"><span class="kicker">Cockpit</span><h1>Vue d’ensemble</h1><div class="metrics"><div class="metric"><strong>12</strong><span class="muted">prospects prioritaires</span></div><div class="metric"><strong>31</strong><span class="muted">conversations</span></div><div class="metric"><strong>7</strong><span class="muted">rendez-vous</span></div><div class="metric"><strong>3/j</strong><span class="muted">publications</span></div></div><section class="section"><div class="panel"><table class="table"><thead><tr><th>Entreprise</th><th>Secteur</th><th>Score</th><th>Statut</th></tr></thead><tbody>${rows.map(r=>`<tr>${r.map(v=>`<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></section></main>`,"/dashboard");
}

function demo(req){
  return layout(req,"Démo réceptionniste IA — "+BRAND,"Testez le moteur d’accueil intégré.",`<main class="wrap section"><div style="max-width:760px;margin:auto"><span class="kicker">Démo sans clé API</span><h1>Réceptionniste IA</h1><p class="muted">Essayez : « je voudrais un rendez-vous », « quels sont vos horaires ? » ou « c’est urgent ».</p><div class="panel"><div id="chat" class="chat"><div class="bubble">Bonjour, je suis l’assistant d’accueil. Comment puis-je vous aider ?</div></div><div class="chatrow"><input id="msg" placeholder="Votre demande"><button class="btn" id="send">Envoyer</button></div></div></div></main><script>const c=document.getElementById('chat'),m=document.getElementById('msg'),s=document.getElementById('send');async function go(){let v=m.value.trim();if(!v)return;c.insertAdjacentHTML('beforeend','<div class="bubble me">'+v.replace(/[<>&]/g,'')+'</div>');m.value='';let r=await fetch('/api/receptionist/respond',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:v})});let d=await r.json();c.insertAdjacentHTML('beforeend','<div class="bubble">'+d.reply+'</div>');c.scrollTop=c.scrollHeight}s.onclick=go;m.onkeydown=e=>{if(e.key==='Enter')go()}</script>`,"/demo");
}

async function signals(query){
  try{
    const u=`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=fr&gl=FR&ceid=FR:fr`;
    const r=await fetch(u,{headers:{"user-agent":"ASTRA-Local-OS/1.0"},signal:AbortSignal.timeout(4000)});
    const xml=await r.text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0,5).map(m=>{
      const x=m[1], grab=(re)=>(x.match(re)?.[1]||"").replace(/<!\[CDATA\[|\]\]>/g,"").replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").trim();
      return {title:grab(/<title>([\s\S]*?)<\/title>/),link:grab(/<link>([\s\S]*?)<\/link>/),source:grab(/<source[^>]*>([\s\S]*?)<\/source>/)};
    }).filter(x=>x.title);
  }catch{return []}
}
const paras=[
  "La transformation numérique des petites entreprises se joue dans les minutes qui suivent une demande. Un appel manqué, un formulaire ignoré ou une réponse tardive peut suffire à perdre un prospect déjà prêt à acheter. Le bon usage de l’automatisation n’est donc pas d’ajouter une couche technologique abstraite, mais de réduire ces frictions concrètes. Pour une PME locale, la priorité consiste à relier l’accueil, la qualification et le suivi afin que chaque demande produise une action claire. Cette approche permet aussi de mesurer ce qui fonctionne réellement plutôt que de se fier à des impressions.",
  "Le contenu éditorial participe à la même chaîne commerciale. Un article utile peut attirer une recherche, répondre à une objection, renforcer une page de service puis conduire à un rendez-vous. Publier davantage n’a toutefois aucun intérêt si les textes sont génériques ou sans source. Une stratégie sérieuse distingue les faits vérifiés, les signaux d’actualité et l’analyse. Elle évite les titres trompeurs, indique la date, fournit une entité éditoriale identifiable et relie chaque publication aux pages du site qui ont une valeur commerciale.",
  "L’accueil automatisé doit lui aussi rester contrôlable. Les intentions fréquentes — rendez-vous, tarifs, horaires, urgence, modification ou adresse — peuvent être traitées très vite, mais une demande sensible doit pouvoir être transmise à un humain. C’est cette capacité d’escalade qui différencie un bon assistant d’un simple répondeur. Dans les métiers locaux, la vitesse est importante, mais la confiance l’est davantage. Le système doit donc savoir quand répondre, quand demander une précision et quand arrêter l’automatisation.",
  "La prospection gagne également à être traitée comme un problème de données. Les signaux publics d’une entreprise — site inexistant, formulaire peu visible, absence de réservation, horaires incomplets ou parcours mobile médiocre — peuvent servir à prioriser les comptes qui ont probablement un besoin immédiat. L’objectif n’est pas de spammer une base entière. Il s’agit de construire une démonstration pertinente pour un petit nombre de prospects dont la situation justifie réellement l’offre.",
  "La mesure ferme la boucle. Pour l’accueil, on suivra les demandes qualifiées, les rendez-vous et les escalades. Pour le contenu, on regardera les impressions, les clics, les requêtes et les conversions assistées. Pour la prospection, on comparera les audits produits aux démonstrations puis aux ventes. Ces données peuvent ensuite améliorer les scripts et la ligne éditoriale. Une question souvent posée devient un article ; un article performant devient un angle commercial ; une objection récurrente devient une amélioration du produit.",
  "Cette logique transforme progressivement un ensemble d’outils en actif logiciel. Les fonctions se renforcent mutuellement : le radar identifie les besoins, le site démontre la solution, le réceptionniste répond, le CRM conserve le contexte et le moteur éditorial entretient la visibilité. Une petite entreprise n’achète alors plus un chatbot ou un blog, mais un système opérationnel qui réduit les occasions perdues et donne une vision plus claire de son acquisition.",
  "Il reste essentiel de conserver un garde-fou éditorial. Google Discover et Google News ne sont pas des canaux que l’on peut forcer. Les bonnes pratiques techniques améliorent l’éligibilité, mais la sélection dépend des systèmes de Google et de la qualité réelle du contenu. La stratégie rationnelle consiste donc à produire des pages rapides, indexables, bien structurées, illustrées et sourcées, tout en mesurant les résultats dans Search Console et en améliorant ce qui obtient une vraie réponse des lecteurs.",
  "Pour une PME locale, la meilleure automatisation est finalement celle qui se fait oublier. Le dirigeant doit voir des demandes mieux traitées, des rendez-vous mieux organisés et une présence éditoriale régulière sans devoir piloter dix interfaces. C’est ce principe qui guide ASTRA Local OS : réunir acquisition, réponse, qualification, publication et mesure dans un même flux, tout en laissant une porte de sortie humaine lorsque la situation l’exige."
];
async function articleData(post){return {post,signals:await signals(post.query),sections:["Pourquoi ce sujet compte aujourd’hui","Les signaux à replacer dans leur contexte","Ce qui change dans l’acquisition locale","Comment l’appliquer cette semaine","Les erreurs qui détruisent la confiance","Ce qu’il faut mesurer","Construire une boucle d’apprentissage","Perspective"].map((h,i)=>({h,p:[paras[i],paras[(i+2)%paras.length],paras[(i+4)%paras.length]]}))};}

async function blog(req){
  const now=new Date(),dates=[];for(let i=0;i<7;i++){const d=new Date(now);d.setDate(d.getDate()-i);dates.push(parisParts(d).date)}
  const posts=dates.flatMap(d=>dailyPosts(d)).filter(p=>published(p,now));
  return layout(req,"Journal ASTRA Local","Analyses sur l’IA, le SEO local et l’automatisation des PME.",`<main class="wrap section"><span class="kicker">3 publications / jour</span><h1>Journal ASTRA Local</h1><p class="muted">Fenêtres éditoriales : 07:15, 12:15 et 18:15, heure de Paris.</p><div class="bloggrid">${posts.map(p=>`<article class="card post"><span class="badge">${p.date} · ${p.slot}</span><h3><a href="/blog/${p.slug}">${esc(p.title)}</a></h3><p class="muted">${esc(p.dek)}</p><a href="/blog/${p.slug}">Lire l’analyse →</a></article>`).join("")}</div></main>`,"/blog",[{"@context":"https://schema.org","@type":"Blog","name":"Journal ASTRA Local"}]);
}
async function article(req,slug){
  const m=slug.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);if(!m)return null;
  const p=dailyPosts(m[1]).find(x=>x.slug===slug);if(!p)return null;
  const d=await articleData(p),base=siteBase(req),url=base+"/blog/"+slug;
  const ld={"@context":"https://schema.org","@type":"NewsArticle","headline":p.title,"description":p.dek,"image":[base+`/media/cover.svg?topic=${encodeURIComponent(p.key)}`],"datePublished":p.publishAt,"dateModified":p.publishAt,"mainEntityOfPage":url,"author":{"@type":"Organization","name":"Rédaction ASTRA Local"},"publisher":{"@type":"Organization","name":BRAND,"url":base}};
  const main=`<article class="article"><span class="kicker">${p.date} · ${p.slot}</span><h1>${esc(p.title)}</h1><p class="muted">${esc(p.dek)}</p>${d.sections.map(s=>`<section><h2>${esc(s.h)}</h2>${s.p.map(x=>`<p>${esc(x)}</p>`).join("")}</section>`).join("")}<section><h2>Sources et signaux consultés</h2>${d.signals.length?`<ul>${d.signals.map(s=>`<li><a rel="nofollow noopener" href="${esc(s.link)}">${esc(s.title)}</a>${s.source?" — "+esc(s.source):""}</li>`).join("")}</ul>`:"<p class='muted'>Les flux d’actualité n’étaient pas disponibles lors de cette génération ; l’analyse repose sur le cadre éditorial permanent.</p>"}</section><p class="muted"><strong>Note :</strong> ces signaux ne constituent pas une garantie de diffusion dans Google Discover ou Google News.</p></article>`;
  return layout(req,p.title+" — ASTRA Local",p.dek,main,"/blog/"+slug,[ld],`/media/cover.svg?topic=${encodeURIComponent(p.key)}`);
}

function privateIp(ip){if(net.isIP(ip)===4){const p=ip.split(".").map(Number);return p[0]===10||p[0]===127||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168)}return ip==="::1"||ip.startsWith("fc")||ip.startsWith("fd")||ip.startsWith("fe80:")}
async function safeUrl(raw){const u=new URL(raw);if(!["http:","https:"].includes(u.protocol))throw new Error("scheme");if(u.hostname==="localhost"||u.hostname.endsWith(".local"))throw new Error("host");const ips=await dns.lookup(u.hostname,{all:true});if(ips.some(x=>privateIp(x.address)))throw new Error("private");return u}
async function audit(raw){let u=await safeUrl(raw);const r=await fetch(u,{redirect:"manual",headers:{"user-agent":"ASTRA-Site-Audit/1.0"},signal:AbortSignal.timeout(5000)});const html=(await r.text()).slice(0,500000);const checks={https:u.protocol==="https:",title:/<title[^>]*>[^<]{5,}<\/title>/i.test(html),meta:/name=["']description["']/i.test(html),viewport:/name=["']viewport["']/i.test(html),schema:/application\/ld\+json/i.test(html),h1:/<h1[^>]*>[\s\S]*?<\/h1>/i.test(html)};return {url:u.toString(),status:r.status,score:Math.round(Object.values(checks).filter(Boolean).length/6*100),checks}}
const osmFilters={plumber:'["craft"="plumber"]',garage:'["shop"="car_repair"]',hairdresser:'["shop"="hairdresser"]',dentist:'["amenity"="dentist"]',hotel:'["tourism"="hotel"]',restaurant:'["amenity"="restaurant"]'};
async function prospects(city,sector){const g=await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(city)}`,{headers:{"user-agent":"ASTRA-Local-OS/1.0"}});const j=await g.json();if(!j[0])return[];const q=`[out:json][timeout:8];(nwr(around:6000,${j[0].lat},${j[0].lon})${osmFilters[sector]||osmFilters.plumber};);out center tags 20;`;const r=await fetch("https://overpass-api.de/api/interpreter",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:"data="+encodeURIComponent(q),signal:AbortSignal.timeout(9000)});const o=await r.json();return(o.elements||[]).map((e,i)=>{const t=e.tags||{},website=t.website||t["contact:website"]||"",phone=t.phone||t["contact:phone"]||"";let score=45;if(!website)score+=30;if(!phone)score+=12;if(!t.opening_hours)score+=8;return{id:e.id||i,name:t.name||"Entreprise "+(i+1),website,phone,score:Math.min(score,100)}}).sort((a,b)=>b.score-a.score).slice(0,12)}

function xmlEsc(s=""){return String(s).replace(/[<>&"']/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&apos;"}[c]))}
function twiml(res,inside){text(res,200,'<?xml version="1.0" encoding="UTF-8"?><Response>'+inside+'</Response>',"text/xml; charset=utf-8")}
function formDecode(raw){return Object.fromEntries(new URLSearchParams(raw).entries())}
function sitemap(req,news=false){const base=siteBase(req),now=new Date(),ds=[];for(let i=0;i<(news?2:30);i++){const d=new Date(now);d.setDate(d.getDate()-i);ds.push(parisParts(d).date)}const posts=ds.flatMap(d=>dailyPosts(d)).filter(p=>published(p,now));if(news)return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${posts.map(p=>`<url><loc>${base}/blog/${p.slug}</loc><news:news><news:publication><news:name>ASTRA Local OS</news:name><news:language>fr</news:language></news:publication><news:publication_date>${p.publishAt}</news:publication_date><news:title>${esc(p.title)}</news:title></news:news></url>`).join("")}</urlset>`;return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${base}/</loc></url><url><loc>${base}/blog</loc></url>${posts.map(p=>`<url><loc>${base}/blog/${p.slug}</loc><lastmod>${p.date}</lastmod></url>`).join("")}</urlset>`}
function feed(req){const base=siteBase(req),date=parisParts().date,posts=dailyPosts(date).filter(p=>published(p));return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>ASTRA Local OS</title><link>${base}/blog</link><description>Actualités automatisation, IA et acquisition locale.</description>${posts.map(p=>`<item><title>${esc(p.title)}</title><link>${base}/blog/${p.slug}</link><guid>${base}/blog/${p.slug}</guid><pubDate>${new Date(p.publishAt).toUTCString()}</pubDate></item>`).join("")}</channel></rss>`}

const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,`http://${req.headers.host||"localhost"}`),p=u.pathname;
    if(req.method==="GET"&&p==="/")return text(res,200,home(req),"text/html; charset=utf-8");
    if(req.method==="GET"&&p==="/dashboard")return text(res,200,dashboard(req),"text/html; charset=utf-8");
    if(req.method==="GET"&&p==="/demo")return text(res,200,demo(req),"text/html; charset=utf-8");
    if(req.method==="GET"&&p==="/blog")return text(res,200,await blog(req),"text/html; charset=utf-8");
    if(req.method==="GET"&&p.startsWith("/blog/")){const a=await article(req,p.slice(6));return text(res,a?200:404,a||"Introuvable","text/html; charset=utf-8")}
    if(req.method==="GET"&&p==="/media/cover.svg"){const topic=esc(u.searchParams.get("topic")||"AI BUSINESS");const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#07111d"/><stop offset="1" stop-color="#18506c"/></linearGradient></defs><rect width="1200" height="675" fill="url(#g)"/><circle cx="980" cy="120" r="220" fill="#63e6be" opacity=".16"/><text x="90" y="290" fill="#63e6be" font-family="Arial" font-size="34" font-weight="700">ASTRA LOCAL OS</text><text x="90" y="370" fill="white" font-family="Arial" font-size="64" font-weight="800">${topic.toUpperCase().slice(0,26)}</text><text x="90" y="435" fill="#b8c8d6" font-family="Arial" font-size="28">IA · acquisition locale · automatisation</text></svg>`;return text(res,200,svg,"image/svg+xml")}
    if(req.method==="GET"&&p==="/robots.txt")return text(res,200,`User-agent: *\nAllow: /\nSitemap: ${siteBase(req)}/sitemap.xml\nSitemap: ${siteBase(req)}/news-sitemap.xml\n`);
    if(req.method==="GET"&&p==="/sitemap.xml")return text(res,200,sitemap(req,false),"application/xml; charset=utf-8");
    if(req.method==="GET"&&p==="/news-sitemap.xml")return text(res,200,sitemap(req,true),"application/xml; charset=utf-8");
    if(req.method==="GET"&&p==="/feed.xml")return text(res,200,feed(req),"application/rss+xml; charset=utf-8");
    if(req.method==="GET"&&p==="/api/health")return json(res,200,{ok:true,service:"astra-local-os",time:new Date().toISOString()});
    if(req.method==="GET"&&p==="/api/content/today"){const d=parisParts().date;return json(res,200,{date:d,posts:dailyPosts(d).map(x=>({...x,published:published(x)}))})}
    if(req.method==="GET"&&p==="/api/prospects"){try{return json(res,200,{source:"OpenStreetMap/Overpass",items:await prospects((u.searchParams.get("city")||CITY).slice(0,80),(u.searchParams.get("sector")||"plumber").toLowerCase())})}catch(e){return json(res,200,{source:"fallback",warning:String(e.message||e),items:[]})}}
    if(req.method==="GET"&&p==="/api/site-audit"){const target=u.searchParams.get("url");if(!target)return json(res,400,{error:"missing_url"});try{return json(res,200,await audit(target))}catch(e){return json(res,400,{error:"audit_failed",detail:String(e.message||e)})}}
    if(req.method==="POST"&&p==="/api/receptionist/respond"){const b=JSON.parse((await body(req))||"{}");return json(res,200,receptionist(String(b.message||"")))}
    if(req.method==="POST"&&p==="/api/voice/incoming")return twiml(res,'<Gather input="speech dtmf" action="/api/voice/respond" method="POST" timeout="4" speechTimeout="auto"><Say language="fr-FR">Bonjour, vous êtes en ligne avec l assistant d accueil. Dites-moi comment je peux vous aider.</Say></Gather>');
    if(req.method==="POST"&&p==="/api/voice/respond"){const f=formDecode(await body(req)),out=receptionist(f.SpeechResult||f.Digits||"");return twiml(res,`<Say language="fr-FR">${xmlEsc(out.reply)}</Say>`)}
    if(req.method==="POST"&&p==="/api/sms/incoming"){const f=formDecode(await body(req)),out=receptionist(f.Body||"");return twiml(res,`<Message>${xmlEsc(out.reply)}</Message>`)}
    return json(res,404,{error:"not_found",path:p});
  }catch(e){console.error(e);return json(res,500,{error:"internal_error"})}
});
server.listen(PORT,"0.0.0.0",()=>console.log(`ASTRA Local OS listening on ${PORT}`));