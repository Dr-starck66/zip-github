import http from "node:http";
import crypto from "node:crypto";

let state={phase:"boot",ok:false};
http.createServer((req,res)=>{
  res.writeHead(200,{"content-type":"application/json"});
  res.end(JSON.stringify(state));
}).listen(Number(process.env.PORT||8080),"0.0.0.0");

function signature(apiKey,secret,path,requestId,body=""){
  const payload=apiKey+"\n"+path+"\n"+(requestId||"")+"\n"+(body||"");
  return crypto.createHmac("sha256",Buffer.from(secret,"utf8"))
    .update(Buffer.from(payload,"utf8"))
    .digest("base64");
}

async function dynadot(method,path,body=""){
  const apiKey=(process.env.DYNADOT_API_KEY||"").trim();
  const secret=(process.env.DYNADOT_API_SECRET||"").trim();
  if(!apiKey||!secret) throw new Error("Dynadot credentials missing");
  const requestId=crypto.randomUUID();
  const headers={
    accept:"application/json",
    authorization:"Bearer "+apiKey,
    "x-request-id":requestId,
    "x-signature":signature(apiKey,secret,path,requestId,body)
  };
  if(body) headers["content-type"]="application/json";
  const response=await fetch("https://api.dynadot.com"+path,{
    method,headers,body:body||undefined,signal:AbortSignal.timeout(20000)
  });
  const text=await response.text();
  let data; try{data=JSON.parse(text)}catch{data={raw:text.slice(0,12000)}}
  return {ok:response.ok,status:response.status,data};
}

try{
  const result=await dynadot("GET","/restful/v2/domains/betgpt.live/records");
  state={phase:"read",...result};
  console.log("DYNADOT_REST_READ",JSON.stringify(state));
}catch(error){
  state={phase:"error",ok:false,error:String(error?.message||error)};
  console.error("DYNADOT_REST_READ",JSON.stringify(state));
}
