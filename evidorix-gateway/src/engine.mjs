import {createHash,randomUUID} from "node:crypto";
const CERT=["100%","garanti","certain","toujours","jamais","aucune erreur","parfaitement","irréfutable","termine","fini","validé","pass","déployé","fonctionne"];
const PROOF=["http 200","status 200","test","log","preuve","evidence","mesure","benchmark","capture","screenshot","commit","curl","playwright","pytest","source","citation","sha","hash","verified"];
const COUNTER=["contre-test","countertest","red team","false-pass","faux pass","adversarial","contre-exemple","counterexample"];
const REPRO=["reprodu","second run","seconde exécution","clean run","fresh run","indépendant","independent","repeat","répété"];
const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const hits=(s,a)=>a.reduce((n,x)=>n+(norm(s).includes(norm(x))?1:0),0);
const split=s=>String(s||"").split(/(?<=[.!?])\s+|\n+/).map(x=>x.trim()).filter(x=>x.length>10).slice(0,50);
const tokens=s=>new Set(norm(s).replace(/https?:\/\/\S+/g," ").replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(x=>x.length>4));
const overlap=(a,b)=>{const A=tokens(a),B=tokens(b);if(!A.size||!B.size)return 0;let n=0;A.forEach(x=>B.has(x)&&n++);return n/Math.min(A.size,B.size)};
export function audit({task="",answer="",evidence=[],verifiedEvidence=[],policy}){
 const claims=split(answer).map((text,i)=>({id:"C"+(i+1),text,risk:hits(text,CERT)}));
 const ev=(Array.isArray(evidence)?evidence:String(evidence).split(/\n+/)).map(x=>typeof x==="string"?{text:x}:{...x}).filter(x=>x.text?.trim()).slice(0,40).map((x,i)=>({id:"E"+(i+1),...x,text:x.text.trim()}));
 const edges=[];claims.forEach(c=>ev.forEach(e=>{const w=overlap(c.text,e.text);if(w>=.16)edges.push({from:c.id,to:e.id,weight:+w.toFixed(2)})}));
 const supported=new Set(edges.map(x=>x.from)).size,coverage=claims.length?supported/claims.length:0;
 const combined=answer+"\n"+ev.map(x=>x.text).join("\n");
 const cert=hits(answer,CERT),proof=hits(combined,PROOF)+ev.length,counter=hits(combined,COUNTER),repro=hits(combined,REPRO);
 const verifiedOk=verifiedEvidence.filter(x=>x.ok).length,verifiedFail=verifiedEvidence.filter(x=>x.status==="FAIL").length;
 const gates=[
  {id:"objective",label:"Objective Gate",score:/pass|partial|fail|crit[eè]re|objectif|attendu|acceptance/i.test(task)?100:45},
  {id:"evidence",label:"Evidence Coverage",score:Math.min(100,Math.round(coverage*55+Math.min(45,ev.length*12)))},
  {id:"verification",label:"Independent Verification",score:verifiedEvidence.length?Math.max(0,Math.min(100,35+verifiedOk*20-verifiedFail*20)):35},
  {id:"redteam",label:"Red Team",score:counter?Math.min(100,70+counter*10):20},
  {id:"falsepass",label:"False-Pass Hunter",score:Math.max(0,Math.min(100,100-cert*8-Math.max(0,cert-proof)*15+(proof?8:0)))},
  {id:"repro",label:"Reproducibility",score:repro?Math.min(100,65+repro*10):20}
 ];
 let score=Math.round(gates.reduce((s,g)=>s+g.score,0)/gates.length);
 const blockers=[];
 if(policy.requireEvidence&&!ev.length)blockers.push("evidence-required");
 if(policy.requireCountertest&&!counter)blockers.push("countertest-required");
 if(policy.requireRepro&&!repro)blockers.push("reproducibility-required");
 if(verifiedFail)blockers.push("verified-evidence-failed");
 if(cert&&!ev.length)blockers.push("unsupported-certainty");
 let verdict=blockers.some(x=>x==="verified-evidence-failed"||x==="unsupported-certainty")||score<policy.partial?"FAIL":score<policy.pass?"PARTIAL":"PASS";
 if(blockers.length&&verdict==="PASS")verdict="PARTIAL";
 const recommendations=[];
 if(!ev.length)recommendations.push("Ajouter au moins une preuve vérifiable.");
 if(!counter)recommendations.push("Ajouter un contre-test conçu pour réfuter la conclusion.");
 if(!repro)recommendations.push("Répéter le test depuis un état propre ou indépendant.");
 if(verifiedFail)recommendations.push("Corriger ou remplacer les preuves dont la vérification serveur a échoué.");
 if(coverage<.5&&claims.length)recommendations.push("Relier davantage d'assertions aux preuves.");
 const record={schema:"evidorix/audit@3",engine:"mythos-astra-omega/3.0",id:"evx_"+randomUUID(),createdAt:new Date().toISOString(),policy:policy.id,task,answer,claims,evidence:ev,verifiedEvidence,graph:{nodes:[...claims.map(x=>({id:x.id,kind:"claim",label:x.text})),...ev.map(x=>({id:x.id,kind:"evidence",label:x.text}))],edges},gates,score,verdict,blockers,recommendations};
 record.fingerprint=createHash("sha256").update(JSON.stringify(record)).digest("hex");
 return record;
}
