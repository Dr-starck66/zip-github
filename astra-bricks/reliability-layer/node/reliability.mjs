const cleanBase=(v)=>String(v||"").trim().replace(/\/+$/,"");

export function reliabilityConfig(env=process.env){
  const configured=(...names)=>names.every(name=>Boolean(String(env[name]||"").trim()));
  return {
    schema:"astra-reliability/v1",
    gatus:{status:configured("ASTRA_GATUS_URL")?"CONFIGURED":"UNCONFIGURED"},
    litellm:{status:configured("ASTRA_LLM_GATEWAY_BASE")?"CONFIGURED":"UNCONFIGURED"},
    trigger:{status:configured("TRIGGER_SECRET_KEY")?"CONFIGURED":"UNCONFIGURED"},
    langfuse:{status:configured("LANGFUSE_PUBLIC_KEY","LANGFUSE_SECRET_KEY","LANGFUSE_BASE_URL")?"CONFIGURED":"UNCONFIGURED"},
    railwayTracing:{status:configured("OTEL_EXPORTER_OTLP_ENDPOINT")?"CONFIGURED":"PLATFORM_MANAGED_OR_UNVERIFIED"}
  };
}

export async function probeJson(url,{timeoutMs=5000,expect}={}){
  const started=Date.now();
  try{
    const response=await fetch(url,{signal:AbortSignal.timeout(timeoutMs),headers:{accept:"application/json"}});
    const raw=await response.text();
    let body=null;try{body=JSON.parse(raw)}catch{}
    const contentOk=typeof expect==="function"?Boolean(expect(body,raw,response)):Boolean(body);
    return {
      status:response.ok&&contentOk?"PASS":"FAIL",
      httpStatus:response.status,
      contentOk,
      latencyMs:Date.now()-started,
      bodyPreview:raw.slice(0,220)
    };
  }catch(error){
    return {status:"FAIL",latencyMs:Date.now()-started,error:String(error?.message||error).slice(0,300)};
  }
}

export async function openAICompatibleChat({
  base,token,model="astra-chat",messages,maxTokens=320,temperature=.2,timeoutMs=45000
}){
  base=cleanBase(base);
  if(!base)throw new Error("ASTRA_LLM_GATEWAY_BASE missing");
  const headers={"content-type":"application/json"};
  if(token)headers.authorization="Bearer "+token;
  const started=Date.now();
  const response=await fetch(base+"/v1/chat/completions",{
    method:"POST",headers,signal:AbortSignal.timeout(timeoutMs),
    body:JSON.stringify({model,stream:false,max_tokens:maxTokens,temperature,messages})
  });
  const raw=await response.text();
  let json;try{json=JSON.parse(raw)}catch{throw new Error("LLM gateway non-JSON "+response.status)}
  if(!response.ok)throw new Error("LLM gateway "+response.status+": "+raw.slice(0,240));
  const text=String(json?.choices?.[0]?.message?.content||"").trim();
  if(!text)throw new Error("LLM gateway empty response");
  return {status:"PASS",text,model,latencyMs:Date.now()-started};
}

export function structuredReliabilityEvent(name,detail={},env=process.env){
  const event={schema:"astra-reliability-event/v1",name,at:new Date().toISOString(),service:env.RAILWAY_SERVICE_NAME||env.ASTRA_SERVICE_NAME||"unknown",detail};
  console.log("ASTRA_RELIABILITY",JSON.stringify(event));
  return event;
}
