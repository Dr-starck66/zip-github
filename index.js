const http=require('http');
const domain=process.env.AUTODNS_DOMAIN||'pantomime.org';
const rootTarget=process.env.ROOT_TARGET;
const wwwTarget=process.env.WWW_TARGET;
const raw=(process.env.DYNADOT_API_KEY||'').trim().replace(/^['"]|['"]$/g,'');
let state={ok:false,phase:'boot',domain};
function variants(k){const a=[k]; if(k.startsWith('9')&&k.length>1)a.push(k.slice(1));else a.push('9'+k); return [...new Set(a.filter(Boolean))]}
async function getDns(k){
  const u=new URL('https://api.dynadot.com/api3.json');
  u.searchParams.set('key',k);u.searchParams.set('command','get_dns');u.searchParams.set('domain',domain);
  const r=await fetch(u); const t=await r.text(); let j={}; try{j=JSON.parse(t)}catch{j={raw:t.slice(0,1000)}}
  return {http:r.status,json:j};
}
async function run(){
  if(!raw||!rootTarget||!wwwTarget) throw new Error('missing key/target configuration');
  const attempts=[];
  for(const k of variants(raw)){
    const g=await getDns(k);
    attempts.push({http:g.http,keys:Object.keys(g.json||{})});
    const body=g.json||{};
    const status=body.GetDnsResponse?.Status||body.GetDnsResponse?.status||body.Status||body.status;
    const code=body.GetDnsResponse?.ResponseCode??body.GetDnsResponse?.response_code??body.ResponseCode??body.code;
    if(g.http===200 && String(status||'').toLowerCase()==='success'){
      state={ok:true,phase:'read',domain,attempts,response:body,rootTarget,wwwTarget,checkedAt:new Date().toISOString()};
      console.log('DNSREAD_RESULT',JSON.stringify(state));
      return;
    }
  }
  throw new Error('Dynadot legacy auth/read failed');
}
run().catch(e=>{state={ok:false,phase:'error',domain,error:String(e.message||e),checkedAt:new Date().toISOString()};console.error('DNSREAD_RESULT',JSON.stringify(state))});
setInterval(()=>console.log('DNSREAD_HEARTBEAT',JSON.stringify(state)),10000);
http.createServer((req,res)=>{res.writeHead(req.url==='/health'?(state.ok?200:503):200,{'content-type':'application/json'});res.end(JSON.stringify(state))}).listen(Number(process.env.PORT||8080),'0.0.0.0');
