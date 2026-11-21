function norm(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("es").replace(/\s+/g," ").trim();}

function validDate(v){return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(String(v||""))&&!Number.isNaN(Date.parse(v));}

function ageDays(iso, now){return (new Date(now).getTime()-new Date(iso).getTime())/86400000;}

function eligible(source, ageLimit, now){return source&&validDate(source.capturedAt)&&ageDays(source.capturedAt,now)>=0&&ageDays(source.capturedAt,now)<=ageLimit;}

function googleVolume(ads, keyword, now){
  const empty={status:"UNVERIFIED",avgMonthlySearches:null,competitionAds:null,competitionIndexAds:null,cpcLowMicros:null,cpcHighMicros:null,closeVariants:[],evidence:null,reason:"No official Dominican Google Ads historical metrics."};
  if(!ads)return empty;
  if(ads.source!=="Google Ads KeywordPlanIdeaService.GenerateKeywordHistoricalMetrics"||ads.geo!=="DO"||ads.language!=="es"||ads.network!=="GOOGLE_SEARCH")return {...empty,reason:"Geo/language/network or source mismatch."};
  if(!eligible(ads,100,now))return {...empty,reason:"Missing or stale evidence timestamp."};
  const candidates=(ads.results||[]).filter(x=>norm(x.text)===norm(keyword)||(x.closeVariants||[]).some(y=>norm(y)===norm(keyword)));
  if(candidates.length!==1)return {...empty,reason:"No unambiguous matching keyword (Google may aggregate variants)."};
  const x=candidates[0],m=x.keywordMetrics||x.keyword_metrics||{};
  const volume=m.avgMonthlySearches??m.avg_monthly_searches;
  if(!Number.isSafeInteger(Number(volume))||Number(volume)<0||volume===null||volume===undefined)return {...empty,reason:"No trustworthy average monthly searches in official response."};
  const index=m.competitionIndex??m.competition_index;
  return {status:"SOURCE_REPORTED",avgMonthlySearches:Number(volume),competitionAds:m.competition||null,competitionIndexAds:Number.isInteger(Number(index))&&index!==undefined&&index!==null?Number(index):null,cpcLowMicros:m.lowTopOfPageBidMicros??null,cpcHighMicros:m.highTopOfPageBidMicros??null,closeVariants:x.closeVariants||[],evidence:{source:ads.source,geo:ads.geo,language:ads.language,network:ads.network,capturedAt:ads.capturedAt,period:ads.period||"past 12 months",documentation:"https://developers.google.com/google-ads/api/docs/keyword-planning/generate-historical-metrics"},reason:"Google monthly volume (approximate); advertising competition is NOT SEO keyword difficulty."};
}

function gscSiteImpressions(gsc,keyword,now){
  const empty={status:"UNVERIFIED",siteImpressions:null,clicks:null,avgPosition:null,evidence:null,reason:"No Google Search Console data for this site."};
  if(!gsc)return empty;
  if(!eligible(gsc,45,now)||!["sc-domain:eldiariodelcibao.com","https://eldiariodelcibao.com/"].includes(gsc.property)||gsc.country!=="DOM"||gsc.searchType!=="web")return {...empty,reason:"Site, country, search type or timestamp not verified."};
  const matches=(gsc.rows||[]).filter(r=>norm(r.query||r.keys?.[0])===norm(keyword));
  if(!matches.length)return {...empty,reason:"Query not returned by GSC; do not infer zero demand."};
  if(matches.some(r=>!Number.isFinite(Number(r.impressions))||!Number.isFinite(Number(r.clicks))))return {...empty,reason:"Invalid GSC row."};
  const impressions=matches.reduce((a,r)=>a+Number(r.impressions),0),clicks=matches.reduce((a,r)=>a+Number(r.clicks),0);
  const positionWeight=matches.reduce((a,r)=>a+(Number(r.position)||0)*Number(r.impressions),0);
  return {status:"OBSERVED_SITE_ONLY",siteImpressions:impressions,clicks,avgPosition:impressions>0?Math.round(positionWeight/impressions*100)/100:null,evidence:{source:"Google Search Console Search Analytics",property:gsc.property,country:"DOM",startDate:gsc.startDate,endDate:gsc.endDate,capturedAt:gsc.capturedAt,limited:true},reason:"Site impressions are NOT total keyword search volume; GSC may omit anonymized/low-volume queries."};
}

function isOfficialHost(url){
  try{const u=new URL(url);const h=u.hostname.toLowerCase();return u.protocol==="https:"&&(["gob.do","gov.do","edu.do"].some(x=>h===x||h.endsWith("."+x)));}catch{return false;}
}

function serpCompetition(serp,keyword,now){
  const empty={status:"UNVERIFIED",difficultySeo:null,proxyScore:null,top10Observed:0,exactTitleCount:null,officialHosts:null,reason:"No fresh independent top-10 SERP snapshot for Dominican Google."};
  if(!serp)return empty;
  if(!eligible(serp,30,now)||serp.geo!=="DO"||serp.engine!=="google"||serp.language!=="es")return {...empty,reason:"SERP snapshot geo/engine/language or timestamp mismatch."};
  const q=(serp.queries||[]).find(x=>norm(x.keyword)===norm(keyword)),rs=q?.results||[];
  const unique=new Set(rs.map(x=>x.rank));
  if(rs.length<8||rs.length>10||unique.size!==rs.length||rs.some(x=>!Number.isInteger(x.rank)||x.rank<1||x.rank>10||!x.title||!x.url))return {...empty,top10Observed:rs.length,reason:"SERP snapshot needs 8–10 unique ranked results with URL and title."};
  const weights=rs.map(r=>11-r.rank),total=weights.reduce((a,b)=>a+b,0);
  const exact=rs.filter(r=>norm(r.title).includes(norm(keyword)));
  const gov=rs.filter(r=>isOfficialHost(r.url));
  const exactWeighted=rs.reduce((v,r,i)=>v+(norm(r.title).includes(norm(keyword))?weights[i]:0),0)/total;
  const govWeighted=rs.reduce((v,r,i)=>v+(isOfficialHost(r.url)?weights[i]:0),0)/total;
  const proxy=Math.round(100*(0.7*exactWeighted+0.3*govWeighted));
  return {status:"HEURISTIC_ONLY",difficultySeo:null,proxyScore:proxy,top10Observed:rs.length,exactTitleCount:exact.length,officialHosts:gov.length,evidence:{source:"manual or independently captured Google SERP",capturedAt:serp.capturedAt,geo:"DO",language:"es",formula:"round(100 * (0.7 * weighted exact-title fraction + 0.3 * weighted official-domain fraction))",note:"NOT Semrush/Ahrefs keyword difficulty; no link authority analysis."},reason:"The score describes the captured SERP structure only, NOT objective ranking difficulty."};
}

function reportForKeywords({keywords,ads=null,gsc=null,serp=null,now=new Date().toISOString()}){
 const unique=new Map();
 for(const k of keywords){const item=typeof k==="string"?{keyword:k}:k;if(item?.keyword&&!unique.has(norm(item.keyword)))unique.set(norm(item.keyword),item);}
 const rows=[...unique.values()].map(k=>{const volume=googleVolume(ads,k.keyword,now),own=gscSiteImpressions(gsc,k.keyword,now),difficulty=serpCompetition(serp,k.keyword,now);
 const evidenceGate=volume.status==="SOURCE_REPORTED"&&difficulty.status==="HEURISTIC_ONLY"?"PARTIAL":(volume.status==="SOURCE_REPORTED"||own.status==="OBSERVED_SITE_ONLY"||difficulty.status==="HEURISTIC_ONLY")?"PARTIAL":"UNVERIFIED";
 return {keyword:k.keyword,url:k.url||null,geo:"DO",language:"es",volume,difficulty,gsc:own,evidenceGate,opportunity:volume.status==="SOURCE_REPORTED"&&difficulty.status==="HEURISTIC_ONLY"&&volume.avgMonthlySearches>=1000&&difficulty.proxyScore<=35?"CANDIDATE_PROXY_ONLY":"UNVERIFIED",warning:"Advertiser competition != organic SEO difficulty. Never claim Semrush KD or guaranteed traffic."};
 });
 return {schema:"astra-keyword-evidence-v1",generatedAt:now,domain:"eldiariodelcibao.com",siteCountry:"DO",language:"es",totalKeywords:rows.length,summary:{googleVolumesWithEvidence:rows.filter(r=>r.volume.status==="SOURCE_REPORTED").length,serpProxyWithEvidence:rows.filter(r=>r.difficulty.status==="HEURISTIC_ONLY").length,gscQueriesWithEvidence:rows.filter(r=>r.gsc.status==="OBSERVED_SITE_ONLY").length,proxyCandidates:rows.filter(r=>r.opportunity==="CANDIDATE_PROXY_ONLY").length,strictSeoDifficultyProved:0,pass:0,partial:rows.filter(r=>r.evidenceGate==="PARTIAL").length,unverified:rows.filter(r=>r.evidenceGate==="UNVERIFIED").length},rows};
}

export { norm, googleVolume, gscSiteImpressions, serpCompetition, reportForKeywords };
