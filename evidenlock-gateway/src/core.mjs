import crypto from "node:crypto";

const CERT=["100%","guaranteed","certain","always","never","perfect","garanti","certain","toujours","jamais","parfait","deployed","déployé","validated","validé"];
const RED=["red team","counter-test","countertest","contre-test","adversarial","contre-exemple","counterexample"];
const REPRO=["second run","independent","indépendant","reprodu","repeat","répét"];
const STRUCT=["http 200","status 200","test","playwright","pytest","commit","sha","hash","source","citation","log","dataset"];

const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const hits=(s,a)=>a.reduce((n,x)=>n+(norm(s).includes(norm(x))?1:0),0);
const lines=s=>String(s||"").split(/\n+/).map(x=>x.trim()).filter(Boolean);

export const policies={
  strict:{id:"strict",pass:82,partial:48,requireEvidence:true,requireRedTeam:true,requireRepro:true,maxCertaintyWithoutEvidence:0},
  balanced:{id:"balanced",pass:70,partial:32,requireEvidence:true,requireRedTeam:false,requireRepro:false,maxCertaintyWithoutEvidence:0},
  exploratory:{id:"exploratory",pass:62,partial:25,requireEvidence:false,requireRedTeam:false,requireRepro:false,maxCertaintyWithoutEvidence:2}
};

export function audit(input,policyName="balanced"){
  const p=policies[policyName]||policies.balanced;
  const task=String(input.task||""),answer=String(input.answer||""),evidence=lines(input.evidence);
  const all=answer+"\n"+evidence.join("\n");
  const objective=/pass|partial|fail|criteria|crit[eè]re|acceptance|succ[eè]s/i.test(task);
  const certainty=hits(answer,CERT),red=hits(all,RED),repro=hits(all,REPRO);
  const structured=evidence.filter(e=>hits(e,STRUCT)>0||/^https?:\/\//.test(e)).length;
  const sourceUrls=evidence.filter(e=>/^https?:\/\//.test(e)).length;
  const checks=[
    {id:"objective",score:objective?100:45,ok:objective},
    {id:"evidence",score:Math.min(100,evidence.length*18+structured*16),ok:!p.requireEvidence||evidence.length>0},
    {id:"red_team",score:red?100:25,ok:!p.requireRedTeam||red>0},
    {id:"false_pass",score:Math.max(0,100-certainty*18+(structured?10:0)),ok:structured>0||certainty<=p.maxCertaintyWithoutEvidence},
    {id:"reproducibility",score:repro?100:30,ok:!p.requireRepro||repro>0},
    {id:"source_integrity",score:Math.min(100,30+structured*15+sourceUrls*15),ok:structured>0}
  ];
  const weights=[.12,.25,.16,.19,.15,.13];
  const score=Math.round(checks.reduce((s,c,i)=>s+c.score*weights[i],0));
  const hardFail=checks.some(c=>!c.ok&&["evidence","false_pass"].includes(c.id));
  let verdict=hardFail||score<p.partial?"FAIL":score<p.pass?"PARTIAL":"PASS";
  if(p.requireRedTeam&&!checks[2].ok&&verdict==="PASS")verdict="PARTIAL";
  if(p.requireRepro&&!checks[4].ok&&verdict==="PASS")verdict="PARTIAL";
  const canonical={schema:"evidenlock/audit@3",policy:p.id,task,answer,evidence,checks,score,verdict};
  const fingerprint=crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
  return {...canonical,id:"EL-"+Date.now().toString(36).toUpperCase()+"-"+crypto.randomBytes(3).toString("hex").toUpperCase(),createdAt:new Date().toISOString(),fingerprint};
}

export function hashApiKey(key){
  return crypto.createHash("sha256").update(String(key)).digest("hex");
}

export function createApiKey(){
  const raw="el_live_"+crypto.randomBytes(24).toString("base64url");
  return {raw,prefix:raw.slice(0,14),hash:hashApiKey(raw)};
}

export function hasScope(scopes,required){
  return Array.isArray(scopes)&&(scopes.includes("*")||scopes.includes(required));
}
