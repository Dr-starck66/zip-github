#!/usr/bin/env node
import fs from 'node:fs';

const args=Object.fromEntries(process.argv.slice(2).reduce((a,x,i,v)=>i%2? a : (a.push([x.replace(/^--/,''),v[i+1]]),a),[]));
const input=args.input||'gsc-raw.json';
const output=args.output||'evidence/search-console.json';
const raw=JSON.parse(fs.readFileSync(input,'utf8'));

const known={
  betgpt:{domain:'betgpt.live'},
  freehotels:{domain:'freehotels.info'},
  pulsoplaneta:{domain:'pulsoplaneta.es'}
};

const generatedAt=raw.generatedAt||new Date().toISOString();
const out={
  version:1,
  generatedAt,
  policy:{
    confirmedDiscover:'Only pages from our own Search Console data with Discover impressions > 0 are confirmed.',
    competitorDiscover:'Never confirmed from public competitor data.',
    staleAfterHours:36
  },
  sites:{}
};

for(const [id,base] of Object.entries(known)){
  const src=(raw.properties||[]).find(x=>x.siteId===id||x.domain===base.domain);
  if(!src){
    out.sites[id]={domain:base.domain,property:null,status:'not_connected',window:null,discover:{clicks:0,impressions:0,ctr:0},pages:[]};
    continue;
  }
  const clicks=Number(src.discover?.clicks||0), impressions=Number(src.discover?.impressions||0);
  const pages=(src.pages||[])
    .map(p=>{
      const pc=Number(p.clicks||0),pi=Number(p.impressions||0);
      return {url:String(p.url||''),title:String(p.title||''),clicks:pc,impressions:pi,ctr:Number.isFinite(Number(p.ctr))?Number(p.ctr):(pi?pc/pi:0),queries:Array.isArray(p.queries)?p.queries.map(String).slice(0,50):[]};
    })
    .filter(p=>p.url&&p.impressions>0)
    .sort((a,b)=>b.impressions-a.impressions)
    .slice(0,2000);
  out.sites[id]={
    domain:base.domain,
    property:src.property||null,
    status:src.status==='connected'?'connected':'not_connected',
    window:src.window||null,
    discover:{clicks,impressions,ctr:Number.isFinite(Number(src.discover?.ctr))?Number(src.discover.ctr):(impressions?clicks/impressions:0)},
    pages
  };
}

fs.mkdirSync(new URL('../evidence/',import.meta.url),{recursive:true});
fs.writeFileSync(output,JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({ok:true,generatedAt,sites:Object.fromEntries(Object.entries(out.sites).map(([k,v])=>[k,{status:v.status,impressions:v.discover.impressions,pages:v.pages.length}]))},null,2));
