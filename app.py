from __future__ import annotations

import hashlib, json, math, subprocess
from typing import Literal
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
import numpy as np

VERSION="0.6.0"
app=FastAPI(
    title="ASTRA QUANTUM — Federated Research Grid",
    version=VERSION,
    description="Evidence-first public runtime for ASTRA QUANTUM v0.6.0"
)

def evidence(payload:dict)->dict:
    body=json.dumps(payload,sort_keys=True,separators=(",",":"))
    return {**payload,"evidence_sha256":hashlib.sha256(body.encode()).hexdigest()}

class StateVector:
    def __init__(self,n:int):
        if n<1 or n>20: raise ValueError("reference backend supports 1..20 qubits")
        self.n=n
        self.s=np.zeros(2**n,dtype=np.complex128); self.s[0]=1
    def gate(self,g,q):
        stride=1<<q; period=stride<<1; out=self.s.copy()
        for base in range(0,len(self.s),period):
            for off in range(stride):
                i0=base+off; i1=i0+stride; a,b=self.s[i0],self.s[i1]
                out[i0]=g[0,0]*a+g[0,1]*b; out[i1]=g[1,0]*a+g[1,1]*b
        self.s=out
    def h(self,q): self.gate(np.array([[1,1],[1,-1]],complex)/math.sqrt(2),q)
    def x(self,q): self.gate(np.array([[0,1],[1,0]],complex),q)
    def rz(self,q,t): self.gate(np.array([[np.exp(-.5j*t),0],[0,np.exp(.5j*t)]],complex),q)
    def cnot(self,c,t):
        if c==t: raise ValueError("control and target must differ")
        out=self.s.copy()
        for i in range(len(self.s)):
            if ((i>>c)&1)==1 and ((i>>t)&1)==0:
                j=i|(1<<t); out[i],out[j]=self.s[j],self.s[i]
        self.s=out
    def sample(self,shots:int,seed:int|None):
        if shots<1: raise ValueError("shots must be >=1")
        p=np.abs(self.s)**2; p=p/p.sum(); rng=np.random.default_rng(seed)
        vals=rng.choice(len(p),size=shots,p=p)
        counts={}
        for v in vals:
            bits="".join(str((int(v)>>q)&1) for q in range(self.n))
            counts[bits]=counts.get(bits,0)+1
        return dict(sorted(counts.items()))

class RunRequest(BaseModel):
    experiment:Literal["bell","ghz","random"]="bell"
    qubits:int=Field(default=3,ge=2,le=20)
    depth:int=Field(default=6,ge=1,le=100)
    shots:int=Field(default=1000,ge=1,le=1000000)
    seed:int|None=42

def run_quantum(r:RunRequest):
    n=2 if r.experiment=="bell" else r.qubits
    s=StateVector(n)
    if r.experiment=="bell":
        s.h(0); s.cnot(0,1)
    elif r.experiment=="ghz":
        s.h(0)
        for q in range(1,n): s.cnot(q-1,q)
    else:
        rng=np.random.default_rng(r.seed)
        for _ in range(r.depth):
            for q in range(n):
                op=int(rng.integers(0,3))
                if op==0:s.h(q)
                elif op==1:s.x(q)
                else:s.rz(q,float(rng.uniform(-math.pi,math.pi)))
            if n>1:
                off=int(rng.integers(0,2))
                for q in range(off,n-1,2):s.cnot(q,q+1)
    return evidence({"backend":"numpy-statevector","hardware":False,"experiment":r.experiment,
                     "qubits":n,"shots":r.shots,"seed":r.seed,"counts":s.sample(r.shots,r.seed)})

PROHIBITED_KEYS={"password","passwd","secret","api_key","apikey","token","access_token","refresh_token",
                 "credential","credentials","private_key","raw_data","raw_dataset","authorization","cookie"}
MARKERS=("-----BEGIN PRIVATE KEY-----","Bearer ","AKIA")
def privacy_walk(v,path="root"):
    if isinstance(v,dict):
        for k,x in v.items():
            if str(k).lower() in PROHIBITED_KEYS: raise ValueError(f"prohibited sensitive field at {path}.{k}")
            privacy_walk(x,f"{path}.{k}")
    elif isinstance(v,list):
        for i,x in enumerate(v): privacy_walk(x,f"{path}[{i}]")
    elif isinstance(v,str) and any(m in v for m in MARKERS):
        raise ValueError(f"prohibited secret-like value at {path}")

class PrivacyRequest(BaseModel): payload:dict
class IVVRequest(BaseModel):
    candidate_scores:list[float]
    baseline_scores:list[float]
    min_delta:float=0.01
    higher_is_better:bool=True

def ivv(req:IVVRequest):
    if len(req.candidate_scores)!=len(req.baseline_scores) or len(req.candidate_scores)<2:
        raise ValueError("paired arrays must have equal length >=2")
    diffs=np.array(req.candidate_scores)-np.array(req.baseline_scores)
    if not req.higher_is_better: diffs=-diffs
    mean=float(diffs.mean())
    se=float(diffs.std(ddof=1)/math.sqrt(len(diffs)))
    lo=mean-1.96*se; hi=mean+1.96*se
    verdict="VERIFIED_IMPROVEMENT" if lo>=req.min_delta else ("NOT_VERIFIED" if hi<req.min_delta else "INCONCLUSIVE")
    return evidence({"n":len(diffs),"mean_delta":mean,"ci95":[lo,hi],"min_delta":req.min_delta,"verdict":verdict,
                     "claim_boundary":"Statistical software verdict only; not external scientific certification."})

class LabMetric(BaseModel):
    lab_id:str
    metric_value:float
    result_digest:str=Field(min_length=32)
    environment_digest:str=Field(min_length=32)

class FederationRequest(BaseModel):
    metric_name:str
    tolerance:float=Field(ge=0)
    min_labs:int=Field(default=3,ge=2)
    submissions:list[LabMetric]

def reproduce(req:FederationRequest):
    ids=[s.lab_id for s in req.submissions]
    if len(ids)!=len(set(ids)): raise ValueError("duplicate lab submission")
    if len(req.submissions)<req.min_labs:
        verdict="INSUFFICIENT_QUORUM"; mean=None; delta=None
    else:
        vals=[s.metric_value for s in req.submissions]; mean=float(np.mean(vals))
        delta=max(abs(a-b) for i,a in enumerate(vals) for b in vals[i+1:]) if len(vals)>1 else 0.0
        verdict="CROSS_LAB_REPRODUCED" if delta<=req.tolerance else "DIVERGENT"
    return evidence({"metric_name":req.metric_name,"labs":sorted(ids),"quorum_required":req.min_labs,
                     "mean":mean,"max_pairwise_delta":delta,"tolerance":req.tolerance,"verdict":verdict,
                     "claim_boundary":"Runtime verifies metric agreement only; signed institutional trust anchors belong to the full v0.6 release."})

class WorkloadRequest(BaseModel):
    spiffe_id:str
    lab_id:str
    allowed_labs:list[str]
    action:str
    allowed_actions:list[str]
    classification:int=Field(ge=0,le=3)
    clearance:int=Field(ge=0,le=3)
    attestation_digest:str|None=None
    require_attestation:bool=True

def zero_trust(req:WorkloadRequest):
    checks={
      "spiffe_identity":req.spiffe_id.startswith("spiffe://"),
      "lab_allowed":req.lab_id in req.allowed_labs,
      "action_allowed":req.action in req.allowed_actions,
      "clearance_sufficient":req.clearance>=req.classification,
      "attestation_present":bool(req.attestation_digest) if req.require_attestation else True
    }
    return evidence({"allowed":all(checks.values()),"checks":checks,"policy":"deny-by-default"})

def pqc_status():
    try:
        p=subprocess.run(["openssl","list","-signature-algorithms"],capture_output=True,text=True,timeout=5)
        text=p.stdout+p.stderr
        algs={a:(a.lower() in text.lower()) for a in ["ML-DSA-44","ML-DSA-65","ML-DSA-87","SLH-DSA"]}
        return {"openssl_available":p.returncode==0,"algorithms":algs,
                "claim_boundary":"Algorithm availability is not FIPS module validation."}
    except Exception as e:
        return {"openssl_available":False,"algorithms":{},"error":str(e)}

DASHBOARD = r"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ASTRA QUANTUM — Sovereign Research Console</title>
<style>
:root{--bg:#060913;--panel:#0d1321;--panel2:#101a2b;--line:#1e3153;--txt:#eef5ff;--muted:#8fa5c3;--cyan:#58e7ff;--green:#62f5a4;--amber:#ffd36a;--red:#ff7185;--violet:#a98cff}
*{box-sizing:border-box} body{margin:0;background:radial-gradient(circle at 15% -10%,#16345d 0,transparent 28%),radial-gradient(circle at 90% 0,#2c1752 0,transparent 25%),var(--bg);color:var(--txt);font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif}
.wrap{max-width:1280px;margin:auto;padding:24px}.top{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:12px 0 26px}.brand{display:flex;align-items:center;gap:14px}.orb{width:44px;height:44px;border-radius:14px;background:conic-gradient(from 40deg,var(--cyan),var(--violet),var(--green),var(--cyan));box-shadow:0 0 38px #58e7ff55;position:relative}.orb:after{content:"";position:absolute;inset:7px;border-radius:10px;background:#07101d}.brand h1{font-size:20px;margin:0;letter-spacing:.08em}.brand small{display:block;color:var(--muted);margin-top:3px}.status{display:flex;gap:8px;align-items:center;border:1px solid #214533;background:#0b1d18;padding:8px 12px;border-radius:999px;color:var(--green);font-size:13px}.dot{width:8px;height:8px;background:var(--green);border-radius:50%;box-shadow:0 0 12px var(--green)}
.hero{display:grid;grid-template-columns:1.45fr .8fr;gap:18px}.card{background:linear-gradient(180deg,#0e1727dd,#0a101ddd);border:1px solid var(--line);border-radius:20px;padding:22px;box-shadow:0 20px 50px #0005}.hero h2{font-size:42px;line-height:1.05;margin:0 0 14px;max-width:760px}.accent{color:var(--cyan)}.lead{color:#b8c7da;line-height:1.65;max-width:790px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}button,.btn{border:0;border-radius:12px;padding:11px 15px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:7px}.primary{background:linear-gradient(135deg,var(--cyan),#6aa8ff);color:#03111a}.ghost{background:#111c2f;color:#dceaff;border:1px solid #263b60}.stats{display:grid;grid-template-columns:1fr 1fr;gap:10px}.stat{padding:15px;border-radius:14px;background:#091321;border:1px solid #1c2d49}.stat b{font-size:24px;display:block}.stat span{color:var(--muted);font-size:12px}.section-title{display:flex;justify-content:space-between;align-items:end;margin:30px 0 12px}.section-title h3{margin:0;font-size:17px;letter-spacing:.04em}.section-title span{font-size:12px;color:var(--muted)}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.mini{min-height:144px}.mini .kicker{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.12em}.mini h4{margin:8px 0 7px;font-size:16px}.pill{display:inline-block;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700}.pass{background:#113125;color:var(--green)}.locked{background:#322615;color:var(--amber)}.verify{background:#1a2743;color:#86b9ff}
.workspace{display:grid;grid-template-columns:.85fr 1.15fr;gap:16px}.formgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}label{font-size:12px;color:#9cb0ca}select,input,textarea{width:100%;margin-top:6px;background:#07111f;border:1px solid #243856;color:white;border-radius:10px;padding:10px;outline:none}select:focus,input:focus,textarea:focus{border-color:var(--cyan)}.full{grid-column:1/-1}.console{background:#050a12;border:1px solid #1a2a42;border-radius:14px;padding:14px;min-height:250px;overflow:auto;max-height:430px}.console pre{margin:0;color:#bcd6f5;white-space:pre-wrap;word-break:break-word;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace}.bars{display:grid;gap:8px;margin-top:14px}.barrow{display:grid;grid-template-columns:90px 1fr 54px;gap:8px;align-items:center;font-size:12px}.track{height:8px;background:#101a2a;border-radius:999px;overflow:hidden}.fill{height:100%;background:linear-gradient(90deg,var(--violet),var(--cyan));border-radius:999px}
.audit{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.audit .card{padding:17px}.audit b{display:block;margin-top:8px}.footer{color:#6f86a5;font-size:12px;padding:30px 4px 15px;display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap}
@media(max-width:900px){.hero,.workspace{grid-template-columns:1fr}.grid{grid-template-columns:1fr 1fr}.hero h2{font-size:34px}} @media(max-width:580px){.wrap{padding:14px}.grid,.audit,.formgrid{grid-template-columns:1fr}.top{align-items:flex-start}.status{font-size:11px}.hero h2{font-size:29px}}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div class="brand"><div class="orb"></div><div><h1>ASTRA QUANTUM</h1><small>Sovereign Research Console · v0.6.0</small></div></div>
    <div class="status"><span class="dot"></span><span id="liveStatus">RAILWAY · OPÉRATIONNEL</span></div>
  </div>

  <section class="hero">
    <div class="card">
      <div class="pill verify">MYTHOS ASTRA Ω · EVIDENCE-FIRST</div>
      <h2>Quantum research, <span class="accent">sans faux PASS.</span></h2>
      <p class="lead">Console publique du noyau ASTRA QUANTUM : expériences Bell/GHZ/random, preuves SHA-256, IV&V statistique, fédération inter-labs, politique Zero Trust et backends matériels maintenus en fail-closed jusqu’à preuve d’accès réel.</p>
      <div class="actions">
        <button class="primary" onclick="runExperiment()">▶ Lancer l’expérience</button>
        <a class="btn ghost" href="/docs" target="_blank">API /docs ↗</a>
        <button class="ghost" onclick="loadAll()">↻ Re-vérifier</button>
      </div>
    </div>
    <div class="card">
      <div class="stats">
        <div class="stat"><b id="runtimeV">0.6.0</b><span>Runtime</span></div>
        <div class="stat"><b id="backendCount">—</b><span>Backends déclarés</span></div>
        <div class="stat"><b id="pqcCount">—</b><span>Signatures PQC dispo</span></div>
        <div class="stat"><b>0</b><span>QPU falsifiés comme PASS</span></div>
      </div>
      <div style="margin-top:15px;color:var(--muted);font-size:12px;line-height:1.6">La console distingue explicitement simulation, provenance distante et matériel réellement vérifié.</div>
    </div>
  </section>

  <div class="section-title"><h3>TRUST FABRIC</h3><span>état du runtime public</span></div>
  <section class="grid">
    <div class="card mini"><div class="kicker">Compute</div><h4>NumPy Statevector</h4><span class="pill pass">AVAILABLE</span><p class="lead" style="font-size:12px">Simulateur exact de référence jusqu’à 20 qubits.</p></div>
    <div class="card mini"><div class="kicker">QPU</div><h4>Google QCS</h4><span class="pill locked">FAIL-CLOSED</span><p class="lead" style="font-size:12px">Aucune exécution matérielle déclarée sans accès authentifié.</p></div>
    <div class="card mini"><div class="kicker">QPU</div><h4>IBM Quantum</h4><span class="pill locked">FAIL-CLOSED</span><p class="lead" style="font-size:12px">Job ID ≠ preuve matérielle ; binding exact requis.</p></div>
    <div class="card mini"><div class="kicker">Federation</div><h4>Research Grid</h4><span class="pill pass">CORE READY</span><p class="lead" style="font-size:12px">Quorum, reproductibilité croisée et payload minimization.</p></div>
  </section>

  <div class="section-title"><h3>QUANTUM LAB</h3><span>exécution réelle du backend public</span></div>
  <section class="workspace">
    <div class="card">
      <div class="formgrid">
        <label>Expérience<select id="experiment"><option value="bell">Bell pair</option><option value="ghz">GHZ</option><option value="random">Random circuit</option></select></label>
        <label>Qubits<input id="qubits" type="number" value="5" min="2" max="20"></label>
        <label>Shots<input id="shots" type="number" value="2000" min="1" max="1000000"></label>
        <label>Profondeur<input id="depth" type="number" value="6" min="1" max="100"></label>
        <label class="full">Seed reproductible<input id="seed" type="number" value="42"></label>
      </div>
      <div class="actions"><button class="primary" onclick="runExperiment()">Exécuter maintenant</button><button class="ghost" onclick="runIVV()">Tester IV&V</button><button class="ghost" onclick="runFederation()">Tester fédération</button></div>
      <div id="bars" class="bars"></div>
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px"><b>EVIDENCE CONSOLE</b><span id="verdict" class="pill verify">READY</span></div>
      <div class="console"><pre id="output">Initialisation de la console ASTRA QUANTUM…</pre></div>
    </div>
  </section>

  <div class="section-title"><h3>INSTITUTIONAL CONTROLS</h3><span>défense en profondeur</span></div>
  <section class="audit">
    <div class="card"><span class="kicker">IV&V</span><b>Paired statistical verification</b><p class="lead" style="font-size:12px">VERIFIED_IMPROVEMENT / NOT_VERIFIED / INCONCLUSIVE avec seuil explicite.</p></div>
    <div class="card"><span class="kicker">Zero Trust</span><b>Deny by default</b><p class="lead" style="font-size:12px">Identité workload, lab, action, clearance et attestation contrôlés séparément.</p></div>
    <div class="card"><span class="kicker">PQC</span><b id="pqcLabel">Inspection…</b><p class="lead" style="font-size:12px">ML-DSA/SLH-DSA détectés via OpenSSL lorsque disponibles. Disponibilité ≠ certification FIPS.</p></div>
  </section>

  <div class="footer"><span>ASTRA QUANTUM v0.6.0 · Railway production</span><span>Truth mode: evidence-first · Hardware QPU: fail-closed</span></div>
</div>
<script>
const $=id=>document.getElementById(id);
async function api(path, options={}){
  const r=await fetch(path,{headers:{'Content-Type':'application/json'},...options});
  const data=await r.json();
  if(!r.ok) throw new Error(data.detail||JSON.stringify(data));
  return data;
}
function show(data, verdict){
  $('output').textContent=JSON.stringify(data,null,2);
  $('verdict').textContent=verdict||data.verdict||data.status||'PASS';
}
function renderBars(counts){
  const entries=Object.entries(counts||{}).sort((a,b)=>b[1]-a[1]).slice(0,12);
  const max=Math.max(...entries.map(x=>x[1]),1);
  $('bars').innerHTML=entries.map(([k,v])=>`<div class="barrow"><span>${k}</span><div class="track"><div class="fill" style="width:${(100*v/max).toFixed(1)}%"></div></div><b>${v}</b></div>`).join('');
}
async function runExperiment(){
  $('verdict').textContent='RUNNING';
  try{
    const payload={experiment:$('experiment').value,qubits:+$('qubits').value,depth:+$('depth').value,shots:+$('shots').value,seed:+$('seed').value};
    const d=await api('/run',{method:'POST',body:JSON.stringify(payload)}); show(d,'EVIDENCE HASHED'); renderBars(d.counts);
  }catch(e){show({error:e.message},'FAIL')}
}
async function runIVV(){
  try{
    const d=await api('/ivv/paired',{method:'POST',body:JSON.stringify({candidate_scores:[.91,.93,.92,.94,.95,.93],baseline_scores:[.86,.87,.88,.88,.89,.87],min_delta:.02,higher_is_better:true})});
    show(d,d.verdict);
  }catch(e){show({error:e.message},'FAIL')}
}
async function runFederation(){
  const h='a'.repeat(64), e='b'.repeat(64);
  try{
    const d=await api('/federation/reproducibility',{method:'POST',body:JSON.stringify({metric_name:'fidelity',tolerance:.02,min_labs:3,submissions:[
      {lab_id:'lab-alpha',metric_value:.982,result_digest:h,environment_digest:e},
      {lab_id:'lab-beta',metric_value:.989,result_digest:h,environment_digest:e},
      {lab_id:'lab-gamma',metric_value:.985,result_digest:h,environment_digest:e}
    ]})}); show(d,d.verdict);
  }catch(err){show({error:err.message},'FAIL')}
}
async function loadAll(){
  try{
    const [health,backends,pqc,cap]=await Promise.all([api('/health'),api('/backends'),api('/security/pqc'),api('/federation/capabilities')]);
    $('runtimeV').textContent=health.version;
    $('backendCount').textContent=Object.keys(backends).filter(k=>k!=='claim_boundary').length;
    const available=Object.entries(pqc.algorithms||{}).filter(x=>x[1]).length;
    $('pqcCount').textContent=available;
    $('pqcLabel').textContent=pqc.openssl_available?available+' algorithmes détectés':'OpenSSL PQC non détecté';
    show({health,backends,pqc,federation:cap},'LIVE VERIFIED');
  }catch(e){$('liveStatus').textContent='CHECK FAILED';show({error:e.message},'FAIL')}
}
loadAll();
</script>
</body></html>"""

@app.get("/", response_class=HTMLResponse)
def dashboard():
    return HTMLResponse(DASHBOARD)

@app.get("/api/status")
def api_status():
    return {"name":"ASTRA QUANTUM","version":VERSION,"status":"operational","platform":"Railway",
            "truth_mode":"evidence-first","runtime_scope":"public validated core","docs":"/docs"}

@app.get("/health")
def health(): return {"ok":True,"version":VERSION}

@app.get("/backends")
def backends():
    return {"numpy":{"available":True,"hardware":False},
            "google-qcs":{"available":False,"hardware":True,"restricted":True},
            "ibm-quantum":{"available":False,"hardware":True,"restricted":True},
            "claim_boundary":"Hardware backends remain fail-closed until authenticated provider access is configured."}

@app.post("/run")
def run(req:RunRequest):
    try:return run_quantum(req)
    except Exception as e:raise HTTPException(400,str(e))

@app.post("/ivv/paired")
def paired(req:IVVRequest):
    try:return ivv(req)
    except Exception as e:raise HTTPException(400,str(e))

@app.post("/federation/privacy/check")
def privacy(req:PrivacyRequest):
    try:
        privacy_walk(req.payload)
        raw=json.dumps(req.payload,sort_keys=True,separators=(",",":")).encode()
        if len(raw)>32768: raise ValueError("federated payload exceeds minimization size limit")
        return {"ok":True,"status":"MINIMIZED_PAYLOAD_ACCEPTED","sha256":hashlib.sha256(raw).hexdigest()}
    except Exception as e:raise HTTPException(400,str(e))

@app.post("/federation/reproducibility")
def federation(req:FederationRequest):
    try:return reproduce(req)
    except Exception as e:raise HTTPException(400,str(e))

@app.post("/zero-trust/authorize")
def authorize(req:WorkloadRequest): return zero_trust(req)

@app.get("/security/pqc")
def security_pqc(): return pqc_status()

@app.get("/federation/capabilities")
def capabilities():
    return {"version":VERSION,"post_quantum_release_artifacts":True,"cross_lab_reproducibility":True,
            "data_minimization":True,"zero_trust_policy":True,"live_external_labs":0,
            "real_tee_quotes_verified":0,"real_qpu_jobs_executed":0,
            "claim_boundary":"This Railway runtime exposes the validated public core; the signed full release remains the canonical institutional package."}
