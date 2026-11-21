// ASTRA NEWS ELIGIBILITY Ω - Cibao; factual source/date checks, not Google inclusion.
export function newsEligibility({news,site,sitemap,now=Date.now()}){
 const recs=news.map(n=>{
  const words=(n.sections||[]).flatMap(s=>s[1]||[]).join(" ").split(/\s+/).filter(Boolean).length;
  const stamp=Date.parse(n.published),dated=Number.isFinite(stamp)&&stamp<=now;
  const fresh=dated&&now-stamp<=48*3600*1000;
  const references=(n.sources||[]).length;
  const validPath=typeof n.path==="string"&&n.path.startsWith("/")&&!n.path.startsWith("//");
  const eligible=fresh&&words>=1500&&validPath;
  return {path:n.path,title:n.title,publishedAt:n.published,wordCount:words,sources:references,fresh,eligible};
 });
 const fresh=recs.filter(n=>n.eligible);
 const issues=[];
 for(const item of fresh){
  if(!sitemap.includes('<loc>'+site+item.path+'</loc>'))issues.push("missing-news-sitemap-entry:"+item.path);
  if(item.sources===0)issues.push("missing-news-sources:"+item.path);
 }
 const listed=(sitemap.match(/<news:news>/g)||[]).length;
 if(listed!==fresh.length)issues.push("sitemap-count-mismatch");
 const latest=recs.filter(x=>Number.isFinite(Date.parse(x.publishedAt))).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt))[0]||null;
 return {schema:"astra-news-eligibility/site-v1",checkedAt:new Date(now).toISOString(),site,
  technicalStatus:issues.length?"FAIL":fresh.length?"PASS":"UNVERIFIED",
  googleNewsInclusion:"UNVERIFIED",googleDiscoverInclusion:"UNVERIFIED",
  publishedArticles:news.length,newsInLast48h:fresh.length,newsSitemapEntries:listed,
  lastPublicationAt:latest?.publishedAt||null,issues,
  note:fresh.length?"Local metadata checks only; verify public HTTP & GSC separately":"No eligible current news in 48h; historical guides are not news",
  articles:fresh.map(x=>({path:x.path,publishedAt:x.publishedAt,sourceCount:x.sources}))};
}
