export const STATES=Object.freeze({PASS:"PASS",PARTIAL:"PARTIAL",FAIL:"FAIL",UNVERIFIED:"UNVERIFIED"});

const SECRET=/(token|secret|password|authorization|cookie|api[-_]?key|private[-_]?key)/i;

export function redact(v,seen=new WeakSet()){
  if(v==null)return v;
  if(typeof v==="string")return v.replace(/Bearer\s+\S+/gi,"Bearer [REDACTED]").slice(0,500);
  if(typeof v!=="object")return v;
  if(seen.has(v))return "[CIRCULAR]";
  seen.add(v);
  if(Array.isArray(v))return v.map(x=>redact(x,seen));
  const out={};
  for(const [k,x] of Object.entries(v))out[k]=SECRET.test(k)?"[REDACTED]":redact(x,seen);
  return out;
}

export function classifyError(e){
  const status=Number(e?.status??e?.statusCode??e?.response?.status??NaN);
  const code=String(e?.code??"").toUpperCase();
  const message=String(e?.message??e??"").slice(0,500);
  if(status===401||/UNAUTH|TOKEN.*EXPIRE|LOGIN REQUIRED|NOT CONNECTED/i.test(message))return{category:"auth",status,code,message};
  if(status===403||/FORBIDDEN|INSUFFICIENT.*SCOPE|PERMISSION/i.test(message))return{category:"permission",status,code,message};
  if(status===429||/RATE.?LIMIT|TOO MANY REQUESTS/i.test(message))return{category:"rate_limit",status,code,message};
  if(status>=500||["ETIMEDOUT","ECONNRESET","ECONNREFUSED","EAI_AGAIN","ENETUNREACH"].includes(code)||/TIMEOUT|TEMPORAR|NETWORK|SERVICE UNAVAILABLE|CONNECTION RESET/i.test(message))return{category:"transient",status,code,message};
  return{category:"unknown",status,code,message};
}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evt=(stage,ok,extra={})=>redact({at:new Date().toISOString(),stage,ok,...extra});

async function retry(fn,{stage,ledger,retries=2,baseMs=250}){
  let last;
  for(let i=0;i<=retries;i++){
    try{
      const value=await fn();
      ledger.push(evt(stage,true,{attempt:i+1}));
      return value;
    }catch(e){
      last=e;
      const c=classifyError(e);
      ledger.push(evt(stage,false,{attempt:i+1,error:c}));
      if(!["transient","rate_limit"].includes(c.category)||i>=retries)throw e;
      await sleep(baseMs*(2**i));
    }
  }
  throw last;
}

const norm=v=>v===true?{ok:true}:v===false||v==null?{ok:false}:(typeof v==="object"&&"ok"in v?v:{ok:Boolean(v),evidence:v});

export async function withConnectorGuard({
  connector="unknown",
  primary,
  fallbacks=[],
  context={},
  resumeKey=null,
  transientRetries=2,
  retryBaseMs=250,
  safeToReplay=false
}={}){
  if(!primary?.authProbe||!primary?.action||!primary?.verify)throw new TypeError("primary.authProbe, primary.action and primary.verify are required");
  const ledger=[evt("guard:start",true,{connector,resumeKey,context})];
  const failures=[];

  for(const [i,route] of [primary,...fallbacks].entries()){
    const name=route.name||`route-${i+1}`;
    let mutationStarted=false;
    try{
      await retry(route.authProbe,{stage:`${name}:auth`,ledger,retries:transientRetries,baseMs:retryBaseMs});
      if(route.scopeProbe)await retry(route.scopeProbe,{stage:`${name}:scope`,ledger,retries:transientRetries,baseMs:retryBaseMs});
      mutationStarted=true;
      const result=await retry(route.action,{stage:`${name}:action`,ledger,retries:0,baseMs:retryBaseMs});
      const verification=norm(await retry(()=>route.verify(result),{stage:`${name}:verify`,ledger,retries:transientRetries,baseMs:retryBaseMs}));

      if(!verification.ok){
        ledger.push(evt(`${name}:verify-contract`,false,{verification}));
        if(!safeToReplay)return{state:STATES.PARTIAL,connector,route:name,result:redact(result),needsUserAuth:false,resumeKey,reason:"Mutation executed but not independently verified; replay blocked.",evidence:ledger};
        failures.push({route:name,category:"verification",message:"Post-action verification failed"});
        continue;
      }

      ledger.push(evt("guard:pass",true,{route:name,verification}));
      return{state:STATES.PASS,connector,route:name,result:redact(result),verification:redact(verification),needsUserAuth:false,resumeKey,evidence:ledger};
    }catch(e){
      const c=classifyError(e);
      failures.push({route:name,...c});
      ledger.push(evt("route:failed",false,{route:name,mutationStarted,error:c}));
      if(mutationStarted&&!safeToReplay)return{state:STATES.PARTIAL,connector,route:name,needsUserAuth:c.category==="auth",resumeKey,reason:"Action may have started; replay blocked until state is verified.",failures:redact(failures),evidence:ledger};
    }
  }

  const needsUserAuth=failures.length>0&&failures.every(f=>["auth","permission"].includes(f.category));
  return{state:STATES.FAIL,connector,route:null,needsUserAuth,resumeKey,reason:needsUserAuth?"All authorized routes require authentication/permission repair.":"All routes failed without verified success.",failures:redact(failures),evidence:ledger};
}
