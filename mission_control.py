from __future__ import annotations

import base64, hashlib, json, os, sqlite3, subprocess, tempfile, uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, Field

router = APIRouter(prefix="/mission", tags=["Mission Control"])
DATA_DIR=Path(os.getenv("ASTRA_DATA_DIR","/tmp/astra-quantum"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB=DATA_DIR/"mission-control.db"
KEY_DIR=DATA_DIR/"keys"; KEY_DIR.mkdir(exist_ok=True)
PRIVATE_KEY=KEY_DIR/"mission-ml-dsa-65-private.pem"
PUBLIC_KEY=KEY_DIR/"mission-ml-dsa-65-public.pem"

def now():
    return datetime.now(timezone.utc).isoformat()

def connect():
    c=sqlite3.connect(DB)
    c.row_factory=sqlite3.Row
    return c

def init_db():
    with connect() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS organizations(
          id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS projects(
          id TEXT PRIMARY KEY, org_id TEXT NOT NULL, name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS runs(
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL, experiment TEXT NOT NULL,
          qubits INTEGER NOT NULL, depth INTEGER NOT NULL, shots INTEGER NOT NULL,
          seed INTEGER, backend TEXT NOT NULL, hardware INTEGER NOT NULL,
          counts_json TEXT NOT NULL, evidence_sha256 TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        """)
        if not c.execute("SELECT 1 FROM organizations LIMIT 1").fetchone():
            c.execute("INSERT INTO organizations VALUES(?,?,?)",("astra-lab","ASTRA Research Lab",now()))
        if not c.execute("SELECT 1 FROM projects LIMIT 1").fetchone():
            c.execute("INSERT INTO projects VALUES(?,?,?,?,?)",
                      ("mission-control","astra-lab","Mission Control","Default sovereign research project",now()))
init_db()

def ensure_pqc_keys():
    if PRIVATE_KEY.exists() and PUBLIC_KEY.exists():
        return True
    try:
        subprocess.run(["openssl","genpkey","-algorithm","ML-DSA-65","-out",str(PRIVATE_KEY)],
                       check=True,capture_output=True,timeout=20)
        subprocess.run(["openssl","pkey","-in",str(PRIVATE_KEY),"-pubout","-out",str(PUBLIC_KEY)],
                       check=True,capture_output=True,timeout=20)
        return True
    except Exception:
        return False

def sign_bytes(data:bytes):
    if not ensure_pqc_keys():
        return {"available":False,"algorithm":"ML-DSA-65"}
    try:
        with tempfile.TemporaryDirectory() as td:
            inp=Path(td)/"payload.bin"; sig=Path(td)/"sig.bin"
            inp.write_bytes(data)
            subprocess.run(["openssl","pkeyutl","-sign","-inkey",str(PRIVATE_KEY),"-rawin",
                            "-in",str(inp),"-out",str(sig)],check=True,capture_output=True,timeout=20)
            pub=PUBLIC_KEY.read_bytes()
            return {
              "available":True,"algorithm":"ML-DSA-65",
              "signature_base64":base64.b64encode(sig.read_bytes()).decode(),
              "public_key_sha256":hashlib.sha256(pub).hexdigest()
            }
    except Exception as e:
        return {"available":False,"algorithm":"ML-DSA-65","error":str(e)}

def record_run(result:dict, project_id:str="mission-control", depth:int=0):
    rid="run-"+uuid.uuid4().hex[:12]
    created=now()
    with connect() as c:
        if not c.execute("SELECT 1 FROM projects WHERE id=?",(project_id,)).fetchone():
            project_id="mission-control"
        c.execute("""INSERT INTO runs
          (id,project_id,experiment,qubits,depth,shots,seed,backend,hardware,counts_json,evidence_sha256,created_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
          (rid,project_id,result["experiment"],int(result["qubits"]),int(depth),int(result["shots"]),
           result.get("seed"),result["backend"],1 if result.get("hardware") else 0,
           json.dumps(result["counts"],sort_keys=True),result["evidence_sha256"],created))
    return {**result,"run_id":rid,"project_id":project_id,"created_at":created}

def row_run(r):
    d=dict(r); d["counts"]=json.loads(d.pop("counts_json")); d["hardware"]=bool(d["hardware"]); return d

class ProjectCreate(BaseModel):
    name:str=Field(min_length=2,max_length=80)
    description:str=Field(default="",max_length=300)
    org_id:str="astra-lab"

class MissionRunRequest(BaseModel):
    experiment:str="bell"
    qubits:int=Field(default=2,ge=2,le=20)
    depth:int=Field(default=6,ge=1,le=100)
    shots:int=Field(default=2000,ge=1,le=1000000)
    seed:int|None=42
    project_id:str="mission-control"

RUNNER:Callable|None=None
REQUEST_MODEL=None

def bind_runner(runner:Callable, request_model):
    global RUNNER, REQUEST_MODEL
    RUNNER=runner; REQUEST_MODEL=request_model

@router.get("/selftest")
def selftest():
    if RUNNER is None or REQUEST_MODEL is None:
        raise HTTPException(503, "quantum runner is not bound")
    try:
        result = RUNNER(REQUEST_MODEL(experiment="bell", qubits=2, depth=1, shots=100, seed=7))
        counts = result.get("counts", {})
        ok = (
            sum(counts.values()) == 100
            and set(counts).issubset({"00", "11"})
            and bool(result.get("evidence_sha256"))
        )
        if not ok:
            raise HTTPException(503, "Bell self-test failed evidence checks")
        return {
            "ok": True,
            "version": "0.7.0",
            "test": "bell-100-seed-7",
            "counts": counts,
            "evidence_sha256": result["evidence_sha256"],
            "mission_control": True,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, f"Mission Control self-test failed: {exc}")

@router.get("/summary")
def summary():
    with connect() as c:
        runs=c.execute("SELECT COUNT(*) n FROM runs").fetchone()["n"]
        projects=c.execute("SELECT COUNT(*) n FROM projects").fetchone()["n"]
        last=c.execute("SELECT * FROM runs ORDER BY created_at DESC LIMIT 1").fetchone()
    return {
      "version":"0.7.0","mode":"MISSION_CONTROL","runs":runs,"projects":projects,
      "evidence_records":runs,"persistence":"RUNTIME_SQLITE",
      "persistent_across_redeploys":False,
      "last_run":row_run(last) if last else None,
      "claim_boundary":"SQLite history persists inside the active Railway runtime, not across destructive redeploys without a Railway volume/database."
    }

@router.get("/projects")
def projects():
    with connect() as c:
        rows=c.execute("""SELECT p.*, COUNT(r.id) run_count FROM projects p
                          LEFT JOIN runs r ON r.project_id=p.id GROUP BY p.id ORDER BY p.created_at""").fetchall()
    return [dict(x) for x in rows]

@router.post("/projects")
def create_project(req:ProjectCreate):
    pid="proj-"+uuid.uuid4().hex[:10]
    with connect() as c:
        if not c.execute("SELECT 1 FROM organizations WHERE id=?",(req.org_id,)).fetchone():
            raise HTTPException(400,"unknown organization")
        c.execute("INSERT INTO projects VALUES(?,?,?,?,?)",(pid,req.org_id,req.name,req.description,now()))
    return {"id":pid,"name":req.name,"description":req.description,"org_id":req.org_id}

@router.post("/run")
def mission_run(req:MissionRunRequest):
    if RUNNER is None or REQUEST_MODEL is None:
        raise HTTPException(503,"quantum runner is not bound")
    try:
        model=REQUEST_MODEL(experiment=req.experiment,qubits=req.qubits,depth=req.depth,shots=req.shots,seed=req.seed)
        result=RUNNER(model)
        return record_run(result,req.project_id,req.depth)
    except Exception as e:
        raise HTTPException(400,str(e))

@router.get("/runs")
def runs(limit:int=50, project_id:str|None=None):
    limit=max(1,min(limit,200))
    with connect() as c:
        if project_id:
            rows=c.execute("SELECT * FROM runs WHERE project_id=? ORDER BY created_at DESC LIMIT ?",(project_id,limit)).fetchall()
        else:
            rows=c.execute("SELECT * FROM runs ORDER BY created_at DESC LIMIT ?",(limit,)).fetchall()
    return [row_run(x) for x in rows]

@router.get("/runs/{run_id}")
def run_detail(run_id:str):
    with connect() as c:
        r=c.execute("SELECT * FROM runs WHERE id=?",(run_id,)).fetchone()
    if not r: raise HTTPException(404,"run not found")
    return row_run(r)

def dist_metrics(a:dict,b:dict):
    keys=set(a)|set(b); sa=sum(a.values()) or 1; sb=sum(b.values()) or 1
    pa={k:a.get(k,0)/sa for k in keys}; pb={k:b.get(k,0)/sb for k in keys}
    tvd=.5*sum(abs(pa[k]-pb[k]) for k in keys)
    bc=sum((pa[k]*pb[k])**.5 for k in keys)
    return {"total_variation_distance":tvd,"bhattacharyya_fidelity":bc*bc}

@router.get("/compare")
def compare(a:str,b:str):
    with connect() as c:
        ra=c.execute("SELECT * FROM runs WHERE id=?",(a,)).fetchone()
        rb=c.execute("SELECT * FROM runs WHERE id=?",(b,)).fetchone()
    if not ra or not rb: raise HTTPException(404,"one or both runs not found")
    A=row_run(ra); B=row_run(rb)
    return {
      "run_a":A,"run_b":B,"distribution_metrics":dist_metrics(A["counts"],B["counts"]),
      "same_experiment":A["experiment"]==B["experiment"],
      "same_seed":A["seed"]==B["seed"],
      "claim_boundary":"Distribution similarity is descriptive; it is not proof of quantum advantage."
    }

@router.get("/evidence/{run_id}")
def evidence_bundle(run_id:str):
    run=run_detail(run_id)
    payload={
      "format":"astra-quantum-evidence-v0.7","run":run,
      "generated_at":now(),"truth_mode":"evidence-first"
    }
    raw=json.dumps(payload,sort_keys=True,separators=(",",":")).encode()
    return {
      "payload":payload,
      "bundle_sha256":hashlib.sha256(raw).hexdigest(),
      "post_quantum_signature":sign_bytes(raw),
      "claim_boundary":"Signature attests bundle bytes and runtime key possession; it is not scientific peer review or institutional certification."
    }

@router.get("/reports/{run_id}.pdf")
def pdf_report(run_id:str):
    run=run_detail(run_id)
    evidence=evidence_bundle(run_id)
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
        from reportlab.lib.colors import HexColor
        import io
        buf=io.BytesIO(); c=canvas.Canvas(buf,pagesize=A4)
        w,h=A4
        c.setFillColor(HexColor("#07111f")); c.rect(0,0,w,h,fill=1,stroke=0)
        c.setFillColor(HexColor("#58e7ff")); c.setFont("Helvetica-Bold",22)
        c.drawString(48,h-62,"ASTRA QUANTUM · MISSION CONTROL")
        c.setFillColor(HexColor("#eef5ff")); c.setFont("Helvetica-Bold",14)
        c.drawString(48,h-92,f"Evidence Report · {run_id}")
        c.setFont("Helvetica",10); c.setFillColor(HexColor("#b8c7da"))
        lines=[
          f"Created: {run['created_at']}", f"Project: {run['project_id']}",
          f"Experiment: {run['experiment']} · Qubits: {run['qubits']} · Shots: {run['shots']} · Seed: {run['seed']}",
          f"Backend: {run['backend']} · Hardware: {run['hardware']}",
          f"Evidence SHA-256: {run['evidence_sha256']}",
          f"Bundle SHA-256: {evidence['bundle_sha256']}",
          f"ML-DSA-65 signed: {evidence['post_quantum_signature'].get('available',False)}",
          f"Signer public-key SHA-256: {evidence['post_quantum_signature'].get('public_key_sha256','UNAVAILABLE')}",
          "Counts:"
        ]
        y=h-125
        for line in lines:
            c.drawString(48,y,line[:105]); y-=18
        for k,v in sorted(run["counts"].items(), key=lambda x:x[1], reverse=True)[:22]:
            c.drawString(65,y,f"{k}: {v}"); y-=15
            if y<70: c.showPage(); y=h-60
        c.setFillColor(HexColor("#8fa5c3")); c.setFont("Helvetica",8)
        c.drawString(48,35,"Evidence-first report. Simulation is never represented as verified QPU hardware.")
        c.save(); data=buf.getvalue()
        return Response(data,media_type="application/pdf",
                        headers={"Content-Disposition":f'attachment; filename="astra-{run_id}.pdf"',
                                 "X-Evidence-SHA256":hashlib.sha256(data).hexdigest()})
    except Exception as e:
        raise HTTPException(500,f"PDF generation failed: {e}")

@router.delete("/runs/{run_id}")
def delete_run(run_id:str):
    with connect() as c:
        cur=c.execute("DELETE FROM runs WHERE id=?",(run_id,))
    return {"deleted":cur.rowcount==1,"run_id":run_id}

@router.get("/persistence")
def persistence():
    return {
      "mode":"RUNTIME_SQLITE","path":str(DB),"exists":DB.exists(),
      "persistent_across_redeploys":False,
      "next_upgrade":"Attach Railway volume or PostgreSQL for durable institutional history."
    }

def dashboard_html():
    return """<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ASTRA QUANTUM v0.7 — Mission Control</title>
<style>
:root{--bg:#050914;--p:#0c1423;--p2:#101b2e;--line:#203759;--text:#eff6ff;--mut:#8fa6c4;--cyan:#5ce7ff;--green:#61f1a5;--amber:#ffd26a;--red:#ff7185;--vio:#aa8cff}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 12% -5%,#153866 0,transparent 30%),radial-gradient(circle at 90% 0,#301958 0,transparent 27%),var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif}
.shell{max-width:1380px;margin:auto;padding:18px}.top{display:flex;justify-content:space-between;align-items:center;gap:15px;padding:10px 0 20px}.brand{display:flex;gap:13px;align-items:center}.logo{width:44px;height:44px;border-radius:13px;background:conic-gradient(var(--cyan),var(--vio),var(--green),var(--cyan));box-shadow:0 0 35px #5ce7ff55;position:relative}.logo:after{content:"";position:absolute;inset:7px;background:#07101d;border-radius:9px}.brand h1{font-size:19px;letter-spacing:.08em;margin:0}.brand small{color:var(--mut);display:block;margin-top:3px}.live{padding:8px 12px;border-radius:999px;border:1px solid #24503b;background:#0b2118;color:var(--green);font-size:12px}.nav{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}.nav button{background:#0c1626;color:#a9bdd7;border:1px solid #1d3151}.nav button.active{color:#04121a;background:var(--cyan);border-color:var(--cyan)}
button,.btn{border:0;border-radius:11px;padding:10px 14px;font-weight:750;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:7px}.primary{background:linear-gradient(135deg,var(--cyan),#7f9dff);color:#041019}.ghost{background:#111c30;color:#dceaff;border:1px solid #284067}.danger{background:#311421;color:#ff9cab;border:1px solid #642239}
.page{display:none}.page.active{display:block}.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.card{background:linear-gradient(180deg,#0e1728ed,#090f1bdd);border:1px solid var(--line);border-radius:18px;padding:18px;box-shadow:0 18px 45px #0004}.metric b{display:block;font-size:27px;margin-top:7px}.label{font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.1em}.hero{display:grid;grid-template-columns:1.3fr .7fr;gap:14px;margin-bottom:14px}.hero h2{font-size:37px;line-height:1.06;margin:7px 0 10px}.lead{color:#afc0d8;line-height:1.55}.pill{display:inline-block;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:800}.pass{background:#123124;color:var(--green)}.warn{background:#372a15;color:var(--amber)}.info{background:#172949;color:#8fc0ff}.workspace{display:grid;grid-template-columns:.82fr 1.18fr;gap:14px}.formgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}label{font-size:12px;color:#a8bad1}select,input,textarea{width:100%;margin-top:5px;background:#07111f;color:white;border:1px solid #263c61;border-radius:10px;padding:10px;outline:none}select:focus,input:focus{border-color:var(--cyan)}.full{grid-column:1/-1}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.console{background:#040912;border:1px solid #182b46;border-radius:13px;min-height:270px;max-height:500px;overflow:auto;padding:13px}.console pre{margin:0;white-space:pre-wrap;word-break:break-word;color:#bed7f6;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
.bars{display:grid;gap:7px;margin-top:14px}.bar{display:grid;grid-template-columns:88px 1fr 48px;gap:8px;align-items:center;font-size:12px}.track{height:8px;background:#121c2b;border-radius:99px;overflow:hidden}.fill{height:100%;background:linear-gradient(90deg,var(--vio),var(--cyan))}
.tablewrap{overflow:auto}.table{width:100%;border-collapse:collapse;font-size:12px}.table th,.table td{padding:10px;border-bottom:1px solid #172a44;text-align:left;white-space:nowrap}.table th{color:#8097b6;font-size:10px;text-transform:uppercase}.table tr:hover td{background:#0e1829}.hash{font-family:ui-monospace,monospace;color:#9cc8ff}.section{display:flex;justify-content:space-between;gap:12px;align-items:end;margin:24px 0 10px}.section h3{margin:0}.section span{font-size:12px;color:var(--mut)}.empty{color:var(--mut);padding:22px;text-align:center}.compare{display:grid;grid-template-columns:1fr 1fr;gap:12px}.resultbox{margin-top:12px;padding:13px;border:1px solid #213958;border-radius:12px;background:#08121f}
@media(max-width:900px){.hero,.workspace,.compare{grid-template-columns:1fr}.grid4{grid-template-columns:1fr 1fr}}@media(max-width:560px){.shell{padding:12px}.grid4,.formgrid{grid-template-columns:1fr}.hero h2{font-size:29px}.live{font-size:10px}}
</style></head>
<body><div class="shell">
<div class="top"><div class="brand"><div class="logo"></div><div><h1>ASTRA QUANTUM</h1><small>Mission Control · v0.7.0</small></div></div><div class="live">● RAILWAY · MISSION ONLINE</div></div>
<div class="nav">
<button class="active" onclick="page('overview',this)">Mission</button>
<button onclick="page('lab',this)">Quantum Lab</button>
<button onclick="page('history',this)">History</button>
<button onclick="page('compare',this)">Compare</button>
<button onclick="page('projects',this)">Projects</button>
<a class="btn ghost" href="/docs" target="_blank">API /docs ↗</a>
</div>

<section id="overview" class="page active">
<div class="hero"><div class="card"><span class="pill info">MYTHOS ASTRA Ω · EVIDENCE-FIRST</span><h2>Mission Control for <span style="color:var(--cyan)">verifiable quantum research.</span></h2><p class="lead">Exécute, historise, compare et exporte les expériences. Chaque run produit une preuve SHA-256 ; les bundles peuvent être signés ML-DSA-65. Les backends QPU restent fail-closed tant que leur provenance réelle n'est pas établie.</p><div class="actions"><button class="primary" onclick="page('lab',document.querySelectorAll('.nav button')[1])">▶ Nouvelle expérience</button><button class="ghost" onclick="refreshAll()">↻ Re-vérifier</button></div></div>
<div class="card"><div class="grid4" style="grid-template-columns:1fr 1fr"><div class="metric"><span class="label">Runs</span><b id="mRuns">0</b></div><div class="metric"><span class="label">Projects</span><b id="mProjects">0</b></div><div class="metric"><span class="label">Evidence</span><b id="mEvidence">0</b></div><div class="metric"><span class="label">PQC</span><b id="mPqc">—</b></div></div><p class="lead" id="persistNote" style="font-size:12px"></p></div></div>
<div class="grid4">
<div class="card"><span class="label">Compute</span><h3>NumPy Statevector</h3><span class="pill pass">AVAILABLE</span></div>
<div class="card"><span class="label">Google QCS</span><h3>Hardware QPU</h3><span class="pill warn">FAIL-CLOSED</span></div>
<div class="card"><span class="label">IBM Quantum</span><h3>Hardware QPU</h3><span class="pill warn">FAIL-CLOSED</span></div>
<div class="card"><span class="label">Evidence</span><h3>ML-DSA + SHA-256</h3><span class="pill pass">ACTIVE</span></div>
</div>
<div class="section"><h3>Latest mission activity</h3><span>runs capturés par le runtime</span></div>
<div class="card tablewrap"><table class="table"><thead><tr><th>Run</th><th>Experiment</th><th>Qubits</th><th>Shots</th><th>Seed</th><th>Evidence</th><th>Report</th></tr></thead><tbody id="latestBody"></tbody></table></div>
</section>

<section id="lab" class="page">
<div class="section"><h3>Quantum Lab</h3><span>Bell verrouille automatiquement 2 qubits</span></div>
<div class="workspace"><div class="card"><div class="formgrid">
<label>Project<select id="projectSelect"></select></label>
<label>Experiment<select id="experiment" onchange="syncQubits()"><option value="bell">Bell pair</option><option value="ghz">GHZ</option><option value="random">Random circuit</option></select></label>
<label>Qubits<input id="qubits" type="number" value="2" min="2" max="20" disabled></label>
<label>Shots<input id="shots" type="number" value="2000" min="1" max="1000000"></label>
<label>Depth<input id="depth" type="number" value="6" min="1" max="100"></label>
<label>Seed<input id="seed" type="number" value="42"></label>
</div><div class="actions"><button class="primary" onclick="runExperiment()">▶ Execute & record</button><button class="ghost" onclick="runIVV()">IV&V demo</button><button class="ghost" onclick="runFederation()">Federation demo</button></div><div id="bars" class="bars"></div></div>
<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><b>EVIDENCE CONSOLE</b><span id="verdict" class="pill info">READY</span></div><div class="console"><pre id="output">Mission Control ready.</pre></div><div id="runActions" class="actions"></div></div></div>
</section>

<section id="history" class="page">
<div class="section"><h3>Run History & Evidence Registry</h3><span>les hashes sont conservés avec chaque run</span></div>
<div class="card tablewrap"><table class="table"><thead><tr><th>Run</th><th>Project</th><th>Experiment</th><th>Qubits</th><th>Shots</th><th>Created</th><th>Evidence SHA-256</th><th>Actions</th></tr></thead><tbody id="historyBody"></tbody></table></div>
</section>

<section id="compare" class="page">
<div class="section"><h3>Compare Runs</h3><span>TVD + fidélité de Bhattacharyya</span></div>
<div class="card"><div class="compare"><label>Run A<select id="runA"></select></label><label>Run B<select id="runB"></select></label></div><div class="actions"><button class="primary" onclick="compareRuns()">Comparer</button></div><div class="resultbox"><pre id="compareOut">Sélectionnez deux runs.</pre></div></div>
</section>

<section id="projects" class="page">
<div class="section"><h3>Research Projects</h3><span>séparation logique des campagnes</span></div>
<div class="workspace"><div class="card"><label>Name<input id="newProjectName" placeholder="Quantum Benchmark Campaign"></label><label>Description<textarea id="newProjectDesc" rows="4" placeholder="Objectif scientifique..."></textarea></label><div class="actions"><button class="primary" onclick="createProject()">Créer le projet</button></div></div><div class="card tablewrap"><table class="table"><thead><tr><th>ID</th><th>Name</th><th>Runs</th><th>Created</th></tr></thead><tbody id="projectsBody"></tbody></table></div></div>
</section>
</div>
<script>
const $=id=>document.getElementById(id); let runsCache=[];
function page(id,btn){document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));$(id).classList.add('active');document.querySelectorAll('.nav button').forEach(x=>x.classList.remove('active'));if(btn&&btn.tagName==='BUTTON')btn.classList.add('active');if(id==='history'||id==='compare')loadRuns();if(id==='projects')loadProjects();}
async function api(path,opt={}){const r=await fetch(path,{headers:{'Content-Type':'application/json'},...opt});let d;try{d=await r.json()}catch{d={detail:await r.text()}}if(!r.ok)throw new Error(d.detail||JSON.stringify(d));return d}
function show(d,v){$('output').textContent=JSON.stringify(d,null,2);$('verdict').textContent=v||d.verdict||'PASS'}
function syncQubits(){const bell=$('experiment').value==='bell';$('qubits').disabled=bell;if(bell)$('qubits').value=2}
function bars(counts){const e=Object.entries(counts||{}).sort((a,b)=>b[1]-a[1]).slice(0,16),m=Math.max(...e.map(x=>x[1]),1);$('bars').innerHTML=e.map(([k,v])=>'<div class="bar"><span>'+k+'</span><div class="track"><div class="fill" style="width:'+((100*v/m).toFixed(1))+'%"></div></div><b>'+v+'</b></div>').join('')}
async function runExperiment(){try{$('verdict').textContent='RUNNING';const p={project_id:$('projectSelect').value,experiment:$('experiment').value,qubits:+$('qubits').value,depth:+$('depth').value,shots:+$('shots').value,seed:+$('seed').value};const d=await api('/mission/run',{method:'POST',body:JSON.stringify(p)});show(d,'RECORDED');bars(d.counts);$('runActions').innerHTML='<a class="btn ghost" target="_blank" href="/mission/reports/'+d.run_id+'.pdf">PDF report</a><button class="ghost" onclick="loadEvidence(\''+d.run_id+'\')">Signed evidence</button>';await refreshAll()}catch(e){show({error:e.message},'FAIL')}}
async function loadEvidence(id){try{show(await api('/mission/evidence/'+id),'ML-DSA EVIDENCE')}catch(e){show({error:e.message},'FAIL')}}
async function runIVV(){try{const d=await api('/ivv/paired',{method:'POST',body:JSON.stringify({candidate_scores:[.91,.93,.92,.94,.95,.93],baseline_scores:[.86,.87,.88,.88,.89,.87],min_delta:.02,higher_is_better:true})});show(d,d.verdict)}catch(e){show({error:e.message},'FAIL')}}
async function runFederation(){const h='a'.repeat(64),e='b'.repeat(64);try{const d=await api('/federation/reproducibility',{method:'POST',body:JSON.stringify({metric_name:'fidelity',tolerance:.02,min_labs:3,submissions:[{lab_id:'lab-alpha',metric_value:.982,result_digest:h,environment_digest:e},{lab_id:'lab-beta',metric_value:.989,result_digest:h,environment_digest:e},{lab_id:'lab-gamma',metric_value:.985,result_digest:h,environment_digest:e}]})});show(d,d.verdict)}catch(err){show({error:err.message},'FAIL')}}
function runOptions(sel){sel.innerHTML=runsCache.map(r=>'<option value="'+r.id+'">'+r.id+' · '+r.experiment+' · '+r.created_at.slice(0,19)+'</option>').join('')}
async function loadRuns(){runsCache=await api('/mission/runs?limit=100');const rows=runsCache.map(r=>'<tr><td>'+r.id+'</td><td>'+r.project_id+'</td><td>'+r.experiment+'</td><td>'+r.qubits+'</td><td>'+r.shots+'</td><td>'+r.created_at.slice(0,19)+'</td><td class="hash">'+r.evidence_sha256.slice(0,18)+'…</td><td><a class="btn ghost" target="_blank" href="/mission/reports/'+r.id+'.pdf">PDF</a></td></tr>').join('');$('historyBody').innerHTML=rows||'<tr><td colspan="8" class="empty">No runs yet.</td></tr>';$('latestBody').innerHTML=runsCache.slice(0,8).map(r=>'<tr><td>'+r.id+'</td><td>'+r.experiment+'</td><td>'+r.qubits+'</td><td>'+r.shots+'</td><td>'+r.seed+'</td><td class="hash">'+r.evidence_sha256.slice(0,16)+'…</td><td><a class="btn ghost" target="_blank" href="/mission/reports/'+r.id+'.pdf">PDF</a></td></tr>').join('')||'<tr><td colspan="7" class="empty">Run your first experiment.</td></tr>';runOptions($('runA'));runOptions($('runB'));if(runsCache.length>1)$('runB').selectedIndex=1}
async function compareRuns(){try{$('compareOut').textContent=JSON.stringify(await api('/mission/compare?a='+encodeURIComponent($('runA').value)+'&b='+encodeURIComponent($('runB').value)),null,2)}catch(e){$('compareOut').textContent=e.message}}
async function loadProjects(){const ps=await api('/mission/projects');$('projectSelect').innerHTML=ps.map(p=>'<option value="'+p.id+'">'+p.name+' ('+p.run_count+')</option>').join('');$('projectsBody').innerHTML=ps.map(p=>'<tr><td>'+p.id+'</td><td>'+p.name+'</td><td>'+p.run_count+'</td><td>'+p.created_at.slice(0,19)+'</td></tr>').join('')}
async function createProject(){try{await api('/mission/projects',{method:'POST',body:JSON.stringify({name:$('newProjectName').value,description:$('newProjectDesc').value})});$('newProjectName').value='';$('newProjectDesc').value='';await loadProjects()}catch(e){alert(e.message)}}
async function refreshAll(){try{const [s,pqc]=await Promise.all([api('/mission/summary'),api('/security/pqc')]);$('mRuns').textContent=s.runs;$('mProjects').textContent=s.projects;$('mEvidence').textContent=s.evidence_records;$('mPqc').textContent=Object.values(pqc.algorithms||{}).filter(Boolean).length;$('persistNote').textContent=s.persistent_across_redeploys?'Durable persistence enabled.':'History is runtime-local; durable Railway volume/Postgres is the next infrastructure upgrade.';await Promise.all([loadProjects(),loadRuns()])}catch(e){console.error(e)}}
syncQubits();refreshAll();
</script></body></html>"""
