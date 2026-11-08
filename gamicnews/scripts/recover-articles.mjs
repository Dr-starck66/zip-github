import fs from 'node:fs';
import path from 'node:path';

/** Publish only validated, previously authored first-party ASTRA content.
 * No network, AI inference, GitHub Actions or external API is used at build time.
 * Unknown paths and duplicate canonical URLs fail the build.
 */
const artSlugs=new Set([
'controller-input-lag-bluetooth-usb-diagnosis-guide',
'free-pc-game-storage-space-without-losing-saves',
'gaming-laptop-thermal-throttling-diagnosis-guide',
'gaming-laptop-uses-integrated-gpu-windows-checklist',
'gaming-overlays-recording-tools-stutter-crashes-checklist',
'move-pc-games-another-drive-without-losing-saves',
'pc-game-audio-crackling-cutting-out-latency-driver-output-checklist',
'pc-game-black-screen-after-alt-tab-display-hdr-checklist',
'pc-game-controller-not-detected-windows-checklist',
'pc-game-crash-evidence-logs-safe-support-report',
'pc-game-lag-ping-packet-loss-wifi-server-checklist',
'pc-game-save-backup-before-windows-reinstall',
'shader-compilation-stutter-pc-games-diagnosis-guide',
'steam-cloud-sync-conflict-safe-recovery-checklist',
'steam-download-stuck-zero-bytes-per-second-checklist',
'uninstall-pc-game-without-losing-saves-mods',
'verify-game-files-steam-epic-xbox-gog',
'vrr-flicker-gaming-monitor-diagnosis-checklist',
'windows-hdr-washed-out-games-calibration-checklist',
'xbox-app-pc-game-download-stuck-installation-checklist'
]);
const imageRevision='a2ef2d52d1d21fb24e6b2b407bec522df26c3024';
const categories=new Set(['Gaming','Tech','Mobile','AI','Cybersecurity','Startups']);
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const bodyText=a=>[...(a.body||[]),...(a.sections||[]).flatMap(s=>s.paragraphs||[])].join(' ');
function validate(a,existing){
 if(!a||typeof a!=='object')throw Error('ARCHIVE_INVALID_OBJECT');
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.slug||''))throw Error('ARCHIVE_INVALID_SLUG');
 const canonical='/news/'+a.slug;
 if(existing.has(canonical))throw Error('ARCHIVE_DUPLICATE_CANONICAL '+canonical);
 if(!categories.has(a.category))throw Error('ARCHIVE_UNKNOWN_CATEGORY '+a.slug);
 if(!a.title||!a.dek||!a.author||!Array.isArray(a.body)||a.body.length<2||
    !Array.isArray(a.sections)||a.sections.length<6||!Array.isArray(a.sourceUrls)||a.sourceUrls.length<2)
     throw Error('ARCHIVE_UNREVIEWED_STRUCTURE '+a.slug);
 const len=(bodyText(a).match(/[\p{L}\p{N}]+/gu)||[]).length;
 if(len<1100)throw Error('ARCHIVE_UNDERDEVELOPED '+a.slug+' '+len);
 const date=new Date(a.publishedAt);
 if(!Number.isFinite(+date)||+date>Date.now()+3600000)throw Error('ARCHIVE_INVALID_DATE '+a.slug);
 if(a.sourceUrls.some(x=>{try{return new URL(x).protocol!=='https:'}catch(e){return true}}))throw Error('ARCHIVE_INVALID_SOURCE '+a.slug);
 return canonical;
}
function articleHTML(a,canonical){
 const title=esc(a.title),dek=esc(a.dek),cat=esc(a.category),author=esc(a.author);
 const iso=new Date(a.publishedAt).toISOString();
 const modified=new Date(a.updatedAt||a.publishedAt).toISOString();
 const url='https://gamicnews.com'+canonical;
 const primary=Array.isArray(a.takeaways)?a.takeaways.slice(0,7):[];
 const sources=[...new Set(a.sourceUrls)];
 const image=artSlugs.has(a.slug)?
  'https://cdn.jsdelivr.net/gh/Dr-starck66/indexation@'+imageRevision+'/gamicnews-live/editorial-assets/'+a.slug+'.svg':null;
 const schema={'@context':'https://schema.org','@type':'Article','headline':a.title,
  'description':a.dek,'datePublished':iso,'dateModified':modified,
  'author':{'@type':'Organization','name':a.author},'publisher':{'@type':'Organization','name':'GAMIC News'},
  'mainEntityOfPage':url};
 if(image)schema.image=[image];
 const summary=primary.length?'<section class="takeaways"><h2>Key takeaways</h2><ul>'+
  primary.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></section>':'';
 const sections=a.sections.map(s=>'<section class="storySection"><h2>'+esc(s.heading)+'</h2>'+
  (s.paragraphs||[]).map(p=>'<p>'+esc(p)+'</p>').join('')+'</section>').join('');
 const links=sources.map(x=>'<li><a href="'+esc(x)+'" rel="noopener noreferrer">'+esc(new URL(x).hostname)+'</a> — '+esc(x)+'</li>').join('');
 const pic=image?'<figure><img src="'+esc(image)+'" width="1200" height="675" alt="'+esc(a.imageAlt||a.title)+
  '" loading="eager" style="width:100%;height:auto"><figcaption>Original GAMIC News illustration from the owned ASTRA archive.</figcaption></figure>':'';
 const related=a.category==='Gaming'?'<p>Related tools: <a href="/tools/game-download-time-calculator">Game download time calculator</a> · <a href="/tools/steam-deck-offline-checker">Steam Deck offline checklist</a>.</p>':'';
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<title>'+title+' | GAMIC News</title><meta name="description" content="'+dek+'">'+
  '<meta name="robots" content="index,follow,max-image-preview:large">'+
  '<link rel="canonical" href="'+esc(url)+'"><meta property="og:type" content="article">'+
  '<meta property="og:title" content="'+title+'"><meta property="og:description" content="'+dek+'">'+
  '<meta property="og:url" content="'+esc(url)+'">'+
  (image?'<meta property="og:image" content="'+esc(image)+'">':'')+
  '<link rel="stylesheet" href="/site.css"><script type="application/ld+json">'+
  JSON.stringify(schema).replace(/</g,'\\u003c')+'</script></head><body>'+
  '<a href="#main-content" class="skipLink">Skip to content</a>'+
  '<header style="padding:18px;background:#121a2a;color:#fff"><a style="color:#fff" href="/">GAMIC NEWS</a> / <a style="color:#fff" href="/category/'+esc(a.category.toLowerCase())+'">'+cat+'</a></header>'+
  '<main id="main-content" style="max-width:920px;padding:24px 22px 70px;margin:auto"><article class="storyBody">'+
  '<p><a href="/category/'+esc(a.category.toLowerCase())+'">'+cat+'</a> · Practical guide</p>'+
  '<h1>'+title+'</h1><p class="intro">'+dek+'</p><p><strong>'+author+'</strong> · <time datetime="'+iso+'">'+
  esc(new Date(iso).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}))+'</time></p>'+
  pic+a.body.map(p=>'<p>'+esc(p)+'</p>').join('')+summary+sections+
  '<section class="storySection"><h2>References and verification</h2><p>These links are supplied with the original ASTRA editorial research. They are provided for readers to inspect; this release does not claim fresh independent testing of every linked source.</p><ul>'+links+'</ul></section>'+
  '<section class="storySection"><h2>Continue reading</h2>'+related+
  '<p><a href="/category/'+esc(a.category.toLowerCase())+'">More '+cat+' guides</a> · <a href="/">GAMIC News homepage</a></p></section>'+
  '</article></main><footer style="padding:22px;text-align:center"><a href="/">GAMIC News</a> · '+
  '<a href="/editorial-policy">Editorial policy</a> · <a href="/corrections">Corrections</a></footer></body></html>';
}
export function renderRecoveredArticles({root,dist,pages,files}){
 const existing=new Set(pages.map(p=>p.canonical));
 const seen=new Set();
 let added=0;
 for(let n=1;n<=3;n++){
  const src=path.join(root,'data','astra-recovered-0'+n+'.json');
  const bundle=JSON.parse(fs.readFileSync(src,'utf8'));
  if(bundle.schema!=='astra-gamic-recovered/1'||!Array.isArray(bundle.items))throw Error('ARCHIVE_SCHEMA_BAD '+n);
  for(const a of bundle.items){
   const canonical=validate(a,existing);
   if(seen.has(canonical))throw Error('ARCHIVE_DUPLICATE_BUNDLE '+canonical);
   seen.add(canonical);
   const sub='news/'+a.slug+'/index.html';
   if(fs.existsSync(path.join(root,sub)))throw Error('ARCHIVE_COLLIDES_WITH_ORIGINAL '+sub);
   const html=articleHTML(a,canonical);
   const dst=path.join(dist,sub);
   fs.mkdirSync(path.dirname(dst),{recursive:true});
   fs.writeFileSync(dst,html);
   pages.push({path:sub,canonical,indexable:true,bytes:Buffer.byteLength(html)});
   files.push(sub);
   added++;
  }
 }
 if(added!==33)throw Error('ARCHIVE_COUNT_REGRESSION '+added+' expected 33');
 return added;
}
