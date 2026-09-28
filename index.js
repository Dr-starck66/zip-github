const crypto=require('crypto');
const http=require('http');

const domain=process.env.AUTODNS_DOMAIN||'pantomime.org';
const rootTarget=process.env.ROOT_TARGET;
const wwwTarget=process.env.WWW_TARGET;
const rawKey=(process.env.DYNADOT_API_KEY||'').trim().replace(/^['"]|['"]$/g,'');
const secret=(process.env.DYNADOT_API_SECRET||'').trim().replace(/^['"]|['"]$/g,'');
let state={ok:false,phase:'boot',domain};

function variants(k){
  const out=[k];
  if(k.startsWith('9') && k.length>1) out.push(k.slice(1));
  else out.push('9'+k);
  return [...new Set(out.filter(Boolean))];
}
async function call(key,method,payload){
  const path='/restful/v2/domains/'+domain+'/records';
  const body=payload?JSON.stringify(payload):'';
  const rid=crypto.randomUUID();
  const sig=crypto.createHmac('sha256',secret).update(key+'\n'+path+'\n'+rid+'\n'+body).digest('base64');
  const headers={Accept:'application/json',Authorization:'Bearer '+key,'X-Request-ID':rid,'X-Signature':sig};
  if(payload) headers['Content-Type']='application/json';
  const r=await fetch('https://api.dynadot.com'+path,{method,headers,body:payload?body:undefined});
  const text=await r.text();
  let json={};
  try{json=text?JSON.parse(text):{}}catch{json={raw:text.slice(0,500)}}
  return {status:r.status,json};
}
function glue(payload){
  const d=payload&&payload.data;
  const g=d&&d.glue_info;
  return (g&&typeof g==='object')?g:{};
}
function typ(r){return String(r.record_type||'').toLowerCase()}
function host(r){return String(r.sub_host||'').toLowerCase().replace(/\.$/,'')}
function val(r){return String(r.record_value1||'').replace(/\.$/,'')}

async function run(){
  if(!rawKey||!secret||!rootTarget||!wwwTarget) throw new Error('missing credential/target configuration');
  let key=null,current=null,attempts=[];
  for(const k of variants(rawKey)){
    const g=await call(k,'GET');
    attempts.push(g.status);
    if(g.status===200){key=k;current=g.json;break}
  }
  if(!key) throw new Error('Dynadot auth failed; statuses='+attempts.join(','));
  const g0=glue(current);
  const mains=Array.isArray(g0.dns_main_list)?g0.dns_main_list:[];
  const subs=Array.isArray(g0.dns_sub_list)?g0.dns_sub_list:[];
  state={ok:false,phase:'read',domain,glueType:g0.glue_type||null,mainCount:mains.length,subCount:subs.length,authStatuses:attempts};
  console.log('DNSFIX_READ',JSON.stringify(state));

  const webMain=new Set(['a','aaaa','cname','aname','forward','stealth']);
  const webSub=new Set(['a','aaaa','cname','forward','stealth']);
  const removeMain=mains.filter(r=>webMain.has(typ(r)));
  const removeSub=subs.filter(r=>host(r)==='www' && webSub.has(typ(r)));
  if(removeMain.length||removeSub.length){
    const payload={};
    if(removeMain.length) payload.dns_main_list=removeMain;
    if(removeSub.length) payload.dns_sub_list=removeSub;
    const del=await call(key,'DELETE',payload);
    if(del.status!==200) throw new Error('delete conflicts failed HTTP '+del.status);
    console.log('DNSFIX_DELETE',JSON.stringify({main:removeMain.map(r=>({type:typ(r),value:val(r)})),www:removeSub.map(r=>({type:typ(r),value:val(r)}))}));
  }

  const add={
    dns_main_list:[{record_type:'aname',record_value1:rootTarget,record_value2:''}],
    dns_sub_list:[{sub_host:'www',record_type:'cname',record_value1:wwwTarget,record_value2:''}]
  };
  const post=await call(key,'POST',add);
  if(post.status!==200) throw new Error('add Railway records failed HTTP '+post.status);

  const vr=await call(key,'GET');
  if(vr.status!==200) throw new Error('verify read failed HTTP '+vr.status);
  const gv=glue(vr.json);
  const vm=Array.isArray(gv.dns_main_list)?gv.dns_main_list:[];
  const vs=Array.isArray(gv.dns_sub_list)?gv.dns_sub_list:[];
  const rootOk=vm.some(r=>typ(r)==='aname'&&val(r)===rootTarget);
  const wwwOk=vs.some(r=>host(r)==='www'&&typ(r)==='cname'&&val(r)===wwwTarget);
  state={ok:rootOk&&wwwOk,phase:'verified',domain,rootOk,wwwOk,rootTarget,wwwTarget,glueType:gv.glue_type||null,
    preservedMain:vm.filter(r=>!webMain.has(typ(r))).map(r=>typ(r)),
    preservedSub:vs.filter(r=>host(r)!=='www').length,
    checkedAt:new Date().toISOString()};
  console.log('DNSFIX_RESULT',JSON.stringify(state));
  if(!state.ok) throw new Error('post-write verification failed');
}
run().catch(e=>{
  state={ok:false,phase:'error',domain,error:String(e.message||e),checkedAt:new Date().toISOString()};
  console.error('DNSFIX_RESULT',JSON.stringify(state));
});
setInterval(()=>console.log('DNSFIX_HEARTBEAT',JSON.stringify(state)),10000);
http.createServer((req,res)=>{
  const code=req.url==='/health'?(state.ok?200:503):200;
  res.writeHead(code,{'content-type':'application/json'});
  res.end(JSON.stringify(state));
}).listen(Number(process.env.PORT||8080),'0.0.0.0');
