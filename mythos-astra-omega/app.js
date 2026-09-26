(function(){
"use strict";
const E=window.MythosEngine,$=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const state={report:null};
function goto(name){$$("[data-view]").forEach(x=>x.classList.toggle("active",x.dataset.view===name));$$(".view").forEach(x=>x.classList.toggle("active",x.id===name));if(name==="history")renderHistory();if(name==="benchmark")renderBenchmark()}
function color(v){return v==="PASS"?"pass":v==="FAIL"?"fail":"partial"}
function renderPasses(report){$("#passes").innerHTML=report.passes.map(p=>'<div class="passrow"><div><b>'+esc(p.name)+'</b><small>'+esc(p.detail)+'</small></div><span class="'+(p.ok?"pass":"partial")+'">'+p.score+'</span></div>').join("")}
function renderGraph(report){
 const box=$("#graph");if(!report.graph.nodes.length){box.innerHTML='<div class="muted">Aucun nœud.</div>';return}
 const claims=report.claims.slice(0,8),ev=report.evidence.slice(0,8),edges=report.graph.edges,rows=Math.max(claims.length,ev.length,1),h=Math.max(220,rows*64+30),w=760,cy=i=>45+i*64;
 let svg='<svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Evidence Graph">';
 edges.forEach(ed=>{const ci=claims.findIndex(c=>c.id===ed.from),ei=ev.findIndex(e=>e.id===ed.to);if(ci>=0&&ei>=0)svg+='<line x1="240" y1="'+cy(ci)+'" x2="520" y2="'+cy(ei)+'" stroke="#516079" stroke-width="'+(1+ed.weight*3)+'"/>'});
 claims.forEach((c,i)=>{svg+='<rect x="10" y="'+(cy(i)-18)+'" width="230" height="36" rx="5" fill="#121824" stroke="#d7ff3f"/><text x="22" y="'+(cy(i)+4)+'" fill="#f4f7fb" font-size="11">'+esc(c.id+" "+c.text.slice(0,30))+'</text>'});
 ev.forEach((e,i)=>{svg+='<rect x="520" y="'+(cy(i)-18)+'" width="230" height="36" rx="5" fill="#121824" stroke="#79e6ff"/><text x="532" y="'+(cy(i)+4)+'" fill="#f4f7fb" font-size="11">'+esc(e.id+" "+e.text.slice(0,30))+'</text>'});
 svg+='</svg>';box.innerHTML=svg;
}
async function renderReport(r){
 state.report=r;r.fingerprint=await E.fingerprint(r);
 $("#empty").hidden=true;$("#report").hidden=false;
 $("#verdict").textContent=r.verdict;$("#verdict").className="verdict "+color(r.verdict);
 $("#score").textContent=r.score+"/100";$("#rid").textContent=r.id;$("#hash").textContent=r.fingerprint.slice(0,24)+"…";
 $("#metrics").innerHTML=[["CLAIMS",r.claims.length],["EVIDENCE",r.evidence.length],["EDGES",r.graph.edges.length],["BLOCKERS",r.blockers.length]].map(x=>'<div class="metric"><b>'+x[1]+'</b><small>'+x[0]+'</small></div>').join("");
 renderPasses(r);renderGraph(r);$("#recs").innerHTML=r.recommendations.map(x=>'<div class="finding">'+esc(x)+'</div>').join("");saveHistory(r);
}
function run(){const answer=$("#answer").value.trim();if(!answer){$("#answer").focus();return}renderReport(E.audit({task:$("#task").value,evidence:$("#evidence").value,answer}))}
function sample(){$("#task").value="Déployer l'application. PASS uniquement si le build réussit, l'URL répond HTTP 200, le contenu attendu est vérifié, un contre-test est exécuté et un second run indépendant confirme le résultat.";$ ("#answer").value="Build terminé. Les tests Playwright passent. Le service répond correctement. Un contre-test Red Team n'a pas trouvé de régression et le résultat a été reproduit sur une seconde exécution indépendante.";$ ("#evidence").value="https://example.com/health HTTP 200 documentation officielle source primaire\nPlaywright test PASS indépendant\nsecond run reproduit commit SHA abc123\ncontre-test adversarial PASS"}
function clearAll(){["task","answer","evidence"].forEach(id=>$("#"+id).value="");$("#report").hidden=true;$("#empty").hidden=false;state.report=null}
function history(){try{return JSON.parse(localStorage.getItem("mao-v2-history")||"[]")}catch(e){return []}}
function saveHistory(r){let h=history().filter(x=>x.id!==r.id);h.unshift({id:r.id,createdAt:r.createdAt,task:r.task,score:r.score,verdict:r.verdict,fingerprint:r.fingerprint});localStorage.setItem("mao-v2-history",JSON.stringify(h.slice(0,50)))}
function renderHistory(){const h=history();$("#historyList").innerHTML=h.length?h.map(x=>'<div class="history-row"><span class="'+color(x.verdict)+'">'+x.verdict+' '+x.score+'</span><div><b>'+esc(x.task||"Audit")+'</b><small>'+esc(x.id)+' · '+new Date(x.createdAt).toLocaleString("fr-FR")+'</small></div><code>'+esc((x.fingerprint||"").slice(0,12))+'</code></div>').join(""):'<p class="muted">Aucun audit local enregistré.</p>'}
function download(name,text,type){const a=document.createElement("a"),u=URL.createObjectURL(new Blob([text],{type}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),500)}
function exportJSON(){if(state.report)download(state.report.id+".json",JSON.stringify(state.report,null,2),"application/json")}
function exportMD(){if(!state.report)return;const r=state.report,s="# Mythos Astra Ω — "+r.id+"\n\n**Verdict:** "+r.verdict+"  \n**Score:** "+r.score+"/100  \n**SHA-256:** "+r.fingerprint+"\n\n## Objectif\n"+(r.task||"—")+"\n\n## Passes\n"+r.passes.map(p=>"- **"+p.name+"** — "+p.score+"/100 — "+p.detail).join("\n")+"\n\n## Recommandations\n"+r.recommendations.map(x=>"- "+x).join("\n")+"\n\n> "+r.disclaimer;download(r.id+".md",s,"text/markdown")}
function share(){if(!state.report)return;const slim={task:state.report.task,answer:state.report.answer,evidence:state.report.evidenceText},enc=btoa(unescape(encodeURIComponent(JSON.stringify(slim))));location.hash="share="+enc;navigator.clipboard&&navigator.clipboard.writeText(location.href);$("#shareMsg").textContent="Lien placé dans l'URL"+(navigator.clipboard?" et copié.":".")}
function loadShare(){if(!location.hash.startsWith("#share="))return;try{const data=JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(7)))));$("#task").value=data.task||"";$("#answer").value=data.answer||"";$("#evidence").value=data.evidence||"";run()}catch(e){}}
function renderBenchmark(){const b=E.runBenchmark();$("#benchRate").textContent=b.rate+"%";$("#benchMeta").textContent=b.passed+"/"+b.total+" cas conformes aux attentes";$("#benchRows").innerHTML=b.rows.map(x=>'<div class="bench-row"><b>'+esc(x.name)+'</b><span>Attendu '+x.expected+'</span><span class="'+color(x.actual)+'">'+x.actual+" · "+x.score+'</span><strong>'+(x.ok?"PASS":"MISS")+'</strong></div>').join("")}
$$("[data-view]").forEach(b=>b.onclick=()=>goto(b.dataset.view));
$("#run").onclick=run;$("#sample").onclick=sample;$("#clear").onclick=clearAll;$("#exportJson").onclick=exportJSON;$("#exportMd").onclick=exportMD;$("#share").onclick=share;$("#wipe").onclick=()=>{localStorage.removeItem("mao-v2-history");renderHistory()};$("#runBench").onclick=renderBenchmark;$("#version").textContent="ENGINE "+E.VERSION;loadShare();
})();