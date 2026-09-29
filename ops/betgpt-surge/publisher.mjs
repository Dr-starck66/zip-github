import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { execFileSync } from "node:child_process";

let state={phase:"boot",ok:false};
console.log("PUBLISHER_BOOT",JSON.stringify({version:"bridge-v3",node:process.version}));
http.createServer((req,res)=>{res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify(state));}).listen(Number(process.env.PORT||8080),"0.0.0.0");

const token=(process.env.SURGE_TOKEN||"").trim();
const target="https://betgpt-production-e2a9.up.railway.app/";
const outDir="/tmp/betgpt-surge-bridge";

async function main(){
  if(!token) throw new Error("SURGE_TOKEN missing");
  state={phase:"surge-auth",ok:false};
  const auth="Basic "+Buffer.from("token:"+token).toString("base64");
  const ar=await fetch("https://surge.surge.sh/account",{headers:{authorization:auth},signal:AbortSignal.timeout(15000)});
  const t=await ar.text(); let account={}; try{account=JSON.parse(t)}catch{}
  console.log("SURGE_ACCOUNT",JSON.stringify({status:ar.status,email:account.email||null,plan:account.plan?.name||null}));
  if(!ar.ok) throw new Error("Surge token rejected HTTP "+ar.status);

  fs.rmSync(outDir,{recursive:true,force:true}); fs.mkdirSync(outDir,{recursive:true});
  const html=`<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BetGPT — Analyses & pronostics football</title>
<meta name="description" content="BetGPT : analyses football, statistiques, modèles et pronostics.">
<link rel="canonical" href="https://betgpt.live/">
<style>html,body{margin:0;width:100%;height:100%;background:#070b12;overflow:hidden}iframe{border:0;width:100%;height:100%;display:block}#fallback{position:fixed;inset:auto 12px 12px 12px;background:#111827;color:white;padding:10px 14px;border-radius:10px;font:14px system-ui;z-index:2}#fallback a{color:#93c5fd}</style>
</head><body>
<iframe src="${target}" title="BetGPT" allow="clipboard-read; clipboard-write; fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe>
<noscript><div id="fallback">BetGPT nécessite JavaScript. <a href="${target}">Ouvrir BetGPT</a></div></noscript>
</body></html>`;
  fs.writeFileSync(path.join(outDir,"index.html"),html);
  fs.writeFileSync(path.join(outDir,"200.html"),html);
  fs.writeFileSync(path.join(outDir,"robots.txt"),"User-agent: *\nAllow: /\nSitemap: https://betgpt.live/sitemap.xml\n");

  const surgeBin=path.resolve("node_modules/.bin/surge");
  const env={...process.env,SURGE_LOGIN:account.email||"",SURGE_TOKEN:token};
  const domains=["betgpt-live.surge.sh","betgpt-dr-starck.surge.sh","betgpt-live-66.surge.sh"];
  let live=null,last="";
  for(const domain of domains){
    try{
      state={phase:"publish-surge",domain,ok:false};
      const o=execFileSync(surgeBin,[outDir,domain],{env,encoding:"utf8",timeout:180000,stdio:["ignore","pipe","pipe"]});
      console.log("SURGE_PUBLISH",JSON.stringify({domain,output:o.slice(-5000)})); live=domain; break;
    }catch(e){last=String(e.stdout||"")+String(e.stderr||"");console.log("SURGE_PUBLISH_FAIL",JSON.stringify({domain,error:last.slice(-2500)}));}
  }
  if(!live) throw new Error("Surge fallback publish failed: "+last.slice(-500));

  let custom="";
  try{
    state={phase:"publish-custom",domain:"betgpt.live",live,ok:false};
    custom=execFileSync(surgeBin,[outDir,"https://betgpt.live"],{env,encoding:"utf8",timeout:180000,stdio:["ignore","pipe","pipe"]});
    console.log("SURGE_CUSTOM",JSON.stringify({output:custom.slice(-6000)}));
  }catch(e){custom=String(e.stdout||"")+String(e.stderr||"");console.log("SURGE_CUSTOM_FAIL",JSON.stringify({error:custom.slice(-6000)}));}

  state={phase:"done",ok:true,live:"https://"+live,custom:"https://betgpt.live",target,customOutput:custom.slice(-1800)};
  console.log("PUBLISHER_DONE",JSON.stringify(state));
}
main().catch(e=>{state={phase:"error",ok:false,error:String(e?.message||e)};console.error("PUBLISHER_ERROR",state.error);});
