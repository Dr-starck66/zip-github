export class EvidenLock {
 constructor({baseUrl="http://localhost:8787"}={}){this.baseUrl=baseUrl.replace(/\/$/,"")}
 async request(path,init={}){const r=await fetch(this.baseUrl+path,{...init,headers:{"content-type":"application/json",...(init.headers||{})}});const data=await r.json();if(!r.ok)throw new Error(data.error||("HTTP "+r.status));return data}
 audit(input){return this.request("/v1/audits",{method:"POST",body:JSON.stringify(input)})}
 policies(){return this.request("/v1/policies")}
 verifyEvidence(items){return this.request("/v1/evidence/verify",{method:"POST",body:JSON.stringify({items})})}
 verifyGitHubCommit(input){return this.request("/v1/evidence/github",{method:"POST",body:JSON.stringify(input)})}
}