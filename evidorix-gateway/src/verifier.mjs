const TIMEOUT=4500;
function safeUrl(raw){try{const u=new URL(raw);if(!["http:","https:"].includes(u.protocol))return null;if(["localhost","127.0.0.1","::1"].includes(u.hostname))return null;return u}catch{return null}}
export async function verifyUrl(raw){
 const u=safeUrl(raw);if(!u)return {kind:"url",target:raw,status:"FAIL",ok:false,reason:"invalid-or-local-url"};
 const started=Date.now();const controller=new AbortController();const t=setTimeout(()=>controller.abort(),TIMEOUT);
 try{
  let res=await fetch(u,{method:"HEAD",redirect:"follow",signal:controller.signal,headers:{"user-agent":"EvidorixVerifier/3.0"}});
  if(res.status===405||res.status===403)res=await fetch(u,{method:"GET",redirect:"follow",signal:controller.signal,headers:{"user-agent":"EvidorixVerifier/3.0","range":"bytes=0-2048"}});
  const ok=res.status>=200&&res.status<400;
  return {kind:"url",target:raw,status:ok?"PASS":"FAIL",ok,httpStatus:res.status,finalUrl:res.url,latencyMs:Date.now()-started,checkedAt:new Date().toISOString()};
 }catch(e){return {kind:"url",target:raw,status:"UNKNOWN",ok:false,reason:e.name==="AbortError"?"timeout":"fetch-error",latencyMs:Date.now()-started,checkedAt:new Date().toISOString()}}
 finally{clearTimeout(t)}
}
export async function verifyEvidence(evidence,maxUrls=5){
 const arr=Array.isArray(evidence)?evidence:String(evidence||"").split(/\n+/);
 const urls=[];for(const item of arr){const text=typeof item==="string"?item:item?.text||"";for(const m of text.match(/https?:\/\/[^\s)\]}>,]+/g)||[])if(!urls.includes(m)&&urls.length<maxUrls)urls.push(m)}
 return Promise.all(urls.map(verifyUrl));
}
export async function verifyGitHub({repo,sha}){
 if(!/^[\w.-]+\/[\w.-]+$/.test(repo||"")||!/^[a-f0-9]{7,40}$/i.test(sha||""))return {status:"FAIL",ok:false,reason:"invalid-input"};
 const headers={"accept":"application/vnd.github+json","user-agent":"EvidorixGitHubConnector/3.0"};
 if(process.env.GITHUB_TOKEN)headers.authorization="Bearer "+process.env.GITHUB_TOKEN;
 try{
  const [commit,status,runs]=await Promise.all([
   fetch("https://api.github.com/repos/"+repo+"/commits/"+sha,{headers}),
   fetch("https://api.github.com/repos/"+repo+"/commits/"+sha+"/status",{headers}),
   fetch("https://api.github.com/repos/"+repo+"/actions/runs?head_sha="+sha+"&per_page=20",{headers})
  ]);
  const c=commit.ok?await commit.json():null,s=status.ok?await status.json():null,r=runs.ok?await runs.json():null;
  const workflowRuns=(r?.workflow_runs||[]).map(x=>({id:x.id,name:x.name,status:x.status,conclusion:x.conclusion,html_url:x.html_url}));
  const success=!!c&&(s?.state==="success"||workflowRuns.some(x=>x.conclusion==="success"));
  return {status:success?"PASS":c?"PARTIAL":"FAIL",ok:success,repo,sha:c?.sha||sha,commitUrl:c?.html_url||null,combinedStatus:s?.state||"unknown",workflowRuns,checkedAt:new Date().toISOString()};
 }catch(e){return {status:"UNKNOWN",ok:false,reason:"github-fetch-error",checkedAt:new Date().toISOString()}}
}
