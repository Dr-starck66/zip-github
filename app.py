from __future__ import annotations

import hashlib
import base64
import hmac
import uuid
import json
import math
import os
import urllib.parse
import urllib.request
import subprocess
import socket
import ssl
import tempfile
from typing import Literal

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

import mission_control

VERSION = "0.8.0"
app = FastAPI(
    title="ASTRA QUANTUM — Mission Control",
    version=VERSION,
    description="Evidence-first public runtime for ASTRA QUANTUM v0.7.0",
)

def evidence(payload: dict) -> dict:
    body = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return {**payload, "evidence_sha256": hashlib.sha256(body.encode()).hexdigest()}

class StateVector:
    def __init__(self, n: int):
        if n < 1 or n > 20:
            raise ValueError("reference backend supports 1..20 qubits")
        self.n = n
        self.s = np.zeros(2**n, dtype=np.complex128)
        self.s[0] = 1

    def gate(self, g, q):
        stride = 1 << q
        period = stride << 1
        out = self.s.copy()
        for base in range(0, len(self.s), period):
            for off in range(stride):
                i0 = base + off
                i1 = i0 + stride
                a, b = self.s[i0], self.s[i1]
                out[i0] = g[0, 0] * a + g[0, 1] * b
                out[i1] = g[1, 0] * a + g[1, 1] * b
        self.s = out

    def h(self, q):
        self.gate(np.array([[1, 1], [1, -1]], complex) / math.sqrt(2), q)

    def x(self, q):
        self.gate(np.array([[0, 1], [1, 0]], complex), q)

    def rz(self, q, t):
        self.gate(np.array([[np.exp(-0.5j * t), 0], [0, np.exp(0.5j * t)]], complex), q)

    def cnot(self, c, t):
        if c == t:
            raise ValueError("control and target must differ")
        out = self.s.copy()
        for i in range(len(self.s)):
            if ((i >> c) & 1) == 1 and ((i >> t) & 1) == 0:
                j = i | (1 << t)
                out[i], out[j] = self.s[j], self.s[i]
        self.s = out

    def sample(self, shots: int, seed: int | None):
        if shots < 1:
            raise ValueError("shots must be >= 1")
        p = np.abs(self.s) ** 2
        p = p / p.sum()
        rng = np.random.default_rng(seed)
        vals = rng.choice(len(p), size=shots, p=p)
        counts = {}
        for v in vals:
            bits = "".join(str((int(v) >> q) & 1) for q in range(self.n))
            counts[bits] = counts.get(bits, 0) + 1
        return dict(sorted(counts.items()))

class RunRequest(BaseModel):
    experiment: Literal["bell", "ghz", "random"] = "bell"
    qubits: int = Field(default=2, ge=2, le=20)
    depth: int = Field(default=6, ge=1, le=100)
    shots: int = Field(default=1000, ge=1, le=1_000_000)
    seed: int | None = 42

def run_quantum(r: RunRequest):
    n = 2 if r.experiment == "bell" else r.qubits
    s = StateVector(n)
    if r.experiment == "bell":
        s.h(0)
        s.cnot(0, 1)
    elif r.experiment == "ghz":
        s.h(0)
        for q in range(1, n):
            s.cnot(q - 1, q)
    else:
        rng = np.random.default_rng(r.seed)
        for _ in range(r.depth):
            for q in range(n):
                op = int(rng.integers(0, 3))
                if op == 0:
                    s.h(q)
                elif op == 1:
                    s.x(q)
                else:
                    s.rz(q, float(rng.uniform(-math.pi, math.pi)))
            if n > 1:
                offset = int(rng.integers(0, 2))
                for q in range(offset, n - 1, 2):
                    s.cnot(q, q + 1)
    return evidence({
        "backend": "numpy-statevector",
        "hardware": False,
        "experiment": r.experiment,
        "qubits": n,
        "shots": r.shots,
        "seed": r.seed,
        "counts": s.sample(r.shots, r.seed),
    })

PROHIBITED_KEYS = {
    "password", "passwd", "secret", "api_key", "apikey", "token",
    "access_token", "refresh_token", "credential", "credentials",
    "private_key", "raw_data", "raw_dataset", "authorization", "cookie",
}
MARKERS = ("-----BEGIN PRIVATE KEY-----", "Bearer ", "AKIA")

def privacy_walk(v, path="root"):
    if isinstance(v, dict):
        for k, x in v.items():
            if str(k).lower() in PROHIBITED_KEYS:
                raise ValueError(f"prohibited sensitive field at {path}.{k}")
            privacy_walk(x, f"{path}.{k}")
    elif isinstance(v, list):
        for i, x in enumerate(v):
            privacy_walk(x, f"{path}[{i}]")
    elif isinstance(v, str) and any(m in v for m in MARKERS):
        raise ValueError(f"prohibited secret-like value at {path}")

class PrivacyRequest(BaseModel):
    payload: dict

class IVVRequest(BaseModel):
    candidate_scores: list[float]
    baseline_scores: list[float]
    min_delta: float = 0.01
    higher_is_better: bool = True

def ivv(req: IVVRequest):
    if len(req.candidate_scores) != len(req.baseline_scores) or len(req.candidate_scores) < 2:
        raise ValueError("paired arrays must have equal length >= 2")
    diffs = np.array(req.candidate_scores) - np.array(req.baseline_scores)
    if not req.higher_is_better:
        diffs = -diffs
    mean = float(diffs.mean())
    se = float(diffs.std(ddof=1) / math.sqrt(len(diffs)))
    lo = mean - 1.96 * se
    hi = mean + 1.96 * se
    verdict = (
        "VERIFIED_IMPROVEMENT"
        if lo >= req.min_delta
        else ("NOT_VERIFIED" if hi < req.min_delta else "INCONCLUSIVE")
    )
    return evidence({
        "n": len(diffs),
        "mean_delta": mean,
        "ci95": [lo, hi],
        "min_delta": req.min_delta,
        "verdict": verdict,
        "claim_boundary": "Statistical software verdict only; not external scientific certification.",
    })

class LabMetric(BaseModel):
    lab_id: str
    metric_value: float
    result_digest: str = Field(min_length=32)
    environment_digest: str = Field(min_length=32)

class FederationRequest(BaseModel):
    metric_name: str
    tolerance: float = Field(ge=0)
    min_labs: int = Field(default=3, ge=2)
    submissions: list[LabMetric]

def reproduce(req: FederationRequest):
    ids = [s.lab_id for s in req.submissions]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate lab submission")
    if len(req.submissions) < req.min_labs:
        verdict, mean, delta = "INSUFFICIENT_QUORUM", None, None
    else:
        vals = [s.metric_value for s in req.submissions]
        mean = float(np.mean(vals))
        delta = max(abs(a - b) for i, a in enumerate(vals) for b in vals[i + 1:]) if len(vals) > 1 else 0.0
        verdict = "CROSS_LAB_REPRODUCED" if delta <= req.tolerance else "DIVERGENT"
    return evidence({
        "metric_name": req.metric_name,
        "labs": sorted(ids),
        "quorum_required": req.min_labs,
        "mean": mean,
        "max_pairwise_delta": delta,
        "tolerance": req.tolerance,
        "verdict": verdict,
        "claim_boundary": "Runtime verifies metric agreement only; signed institutional trust anchors belong to the full release.",
    })

class WorkloadRequest(BaseModel):
    spiffe_id: str
    lab_id: str
    allowed_labs: list[str]
    action: str
    allowed_actions: list[str]
    classification: int = Field(ge=0, le=3)
    clearance: int = Field(ge=0, le=3)
    attestation_digest: str | None = None
    require_attestation: bool = True

def zero_trust(req: WorkloadRequest):
    checks = {
        "spiffe_identity": req.spiffe_id.startswith("spiffe://"),
        "lab_allowed": req.lab_id in req.allowed_labs,
        "action_allowed": req.action in req.allowed_actions,
        "clearance_sufficient": req.clearance >= req.classification,
        "attestation_present": bool(req.attestation_digest) if req.require_attestation else True,
    }
    return evidence({"allowed": all(checks.values()), "checks": checks, "policy": "deny-by-default"})

def pqc_status():
    try:
        p = subprocess.run(["openssl", "list", "-signature-algorithms"], capture_output=True, text=True, timeout=5)
        text = p.stdout + p.stderr
        algs = {a: (a.lower() in text.lower()) for a in ["ML-DSA-44", "ML-DSA-65", "ML-DSA-87", "SLH-DSA"]}
        return {
            "openssl_available": p.returncode == 0,
            "algorithms": algs,
            "claim_boundary": "Algorithm availability is not FIPS module validation.",
        }
    except Exception as e:
        return {"openssl_available": False, "algorithms": {}, "error": str(e)}

mission_control.bind_runner(run_quantum, RunRequest)
app.include_router(mission_control.router)

@app.get("/", response_class=HTMLResponse)
def root():
    return HTMLResponse(mission_control.dashboard_html())

@app.get("/api/status")
def api_status():
    return {
        "name": "ASTRA QUANTUM",
        "version": VERSION,
        "status": "operational",
        "platform": "Railway",
        "truth_mode": "evidence-first",
        "runtime_scope": "Mission Control public validated core",
        "docs": "/docs",
    }

@app.get("/health")
def health():
    return {"ok": True, "version": VERSION, "mission_control": True}

@app.get("/backends")
def backends():
    return {
        "numpy": {"available": True, "hardware": False},
        "google-qcs": {"available": False, "hardware": True, "restricted": True},
        "ibm-quantum": {"available": False, "hardware": True, "restricted": True},
        "claim_boundary": "Hardware backends remain fail-closed until authenticated provider access is configured.",
    }

@app.post("/run")
def run(req: RunRequest):
    try:
        return run_quantum(req)
    except Exception as e:
        raise HTTPException(400, str(e))

@app.post("/ivv/paired")
def paired(req: IVVRequest):
    try:
        return ivv(req)
    except Exception as e:
        raise HTTPException(400, str(e))

@app.post("/federation/privacy/check")
def privacy(req: PrivacyRequest):
    try:
        privacy_walk(req.payload)
        raw = json.dumps(req.payload, sort_keys=True, separators=(",", ":")).encode()
        if len(raw) > 32768:
            raise ValueError("federated payload exceeds minimization size limit")
        return {
            "ok": True,
            "status": "MINIMIZED_PAYLOAD_ACCEPTED",
            "sha256": hashlib.sha256(raw).hexdigest(),
        }
    except Exception as e:
        raise HTTPException(400, str(e))

@app.post("/federation/reproducibility")
def federation(req: FederationRequest):
    try:
        return reproduce(req)
    except Exception as e:
        raise HTTPException(400, str(e))

@app.post("/zero-trust/authorize")
def authorize(req: WorkloadRequest):
    return zero_trust(req)

@app.get("/security/pqc")
def security_pqc():
    return pqc_status()

@app.get("/federation/capabilities")
def capabilities():
    return {
        "version": VERSION,
        "post_quantum_release_artifacts": True,
        "cross_lab_reproducibility": True,
        "data_minimization": True,
        "zero_trust_policy": True,
        "live_external_labs": 0,
        "real_tee_quotes_verified": 0,
        "real_qpu_jobs_executed": 0,
        "claim_boundary": "Mission Control exposes the validated public core; real external QPU/TEE claims remain fail-closed.",
    }


@app.get("/autodns/dynadot-zone")
def autodns_dynadot_zone():
    key = (os.getenv("DYNADOT_API_KEY") or "").strip().strip("'").strip('"')
    domain = os.getenv("AUTODNS_DOMAIN", "betgpt.live")
    if not key:
        raise HTTPException(503, "DYNADOT_API_KEY not configured on this service")
    params = urllib.parse.urlencode({"key": key, "command": "get_dns", "domain": domain})
    url = "https://api.dynadot.com/api3.json?" + params
    try:
        with urllib.request.urlopen(url, timeout=20) as response:
            payload = response.read().decode("utf-8")
        return json.loads(payload)
    except Exception as exc:
        raise HTTPException(502, f"Dynadot API request failed: {exc}")



@app.get("/autodns/key-diagnostic")
@app.get("/autodns/key_diagnostic")
def autodns_key_diagnostic():
    key = os.getenv("DYNADOT_API_KEY", "")
    domain = os.getenv("AUTODNS_DOMAIN", "betgpt.live")
    if not key:
        result = {"ok": False, "error": "DYNADOT_API_KEY missing", "results": []}
        try:
            with open("/tmp/autodns_key_diagnostic.json", "w", encoding="utf-8") as fh:
                json.dump(result, fh, sort_keys=True)
        except Exception:
            pass
        print("AUTODNS_KEY_DIAGNOSTIC", json.dumps(result, sort_keys=True), flush=True)
        return result
    candidates = [
        ("plain", key),
        ("leading_apostrophe", "'" + key),
        ("trailing_apostrophe", key + "'"),
        ("wrapped_apostrophes", "'" + key + "'"),
    ]
    out = []
    for label, candidate in candidates:
        params = urllib.parse.urlencode({"key": candidate, "command": "get_dns", "domain": domain})
        url = "https://api.dynadot.com/api3.json?" + params
        try:
            with urllib.request.urlopen(url, timeout=20) as response:
                raw = response.read().decode("utf-8", errors="replace")
                http_status = response.status
            try:
                payload = json.loads(raw)
            except Exception:
                payload = {"raw_prefix": raw[:200]}
            code = None
            status = None
            if isinstance(payload, dict):
                code = payload.get("ResponseCode") or payload.get("response_code") or payload.get("code")
                status = payload.get("Status") or payload.get("status")
            out.append({"candidate": label, "http_status": http_status, "api_code": code, "api_status": status})
        except urllib.error.HTTPError as exc:
            out.append({"candidate": label, "http_status": exc.code, "api_code": None, "api_status": "HTTPError"})
        except Exception as exc:
            out.append({"candidate": label, "http_status": None, "api_code": None, "api_status": type(exc).__name__})
    result = {"domain": domain, "results": out}
    try:
        with open("/tmp/autodns_key_diagnostic.json", "w", encoding="utf-8") as fh:
            json.dump(result, fh, sort_keys=True)
    except Exception:
        pass
    print("AUTODNS_KEY_DIAGNOSTIC", json.dumps(result, sort_keys=True), flush=True)
    return result



@app.on_event("startup")
def autodns_startup_key_diagnostic():
    try:
        autodns_key_diagnostic()
    except Exception as exc:
        try:
            with open("/tmp/autodns_key_diagnostic.json", "w", encoding="utf-8") as fh:
                json.dump({"startup_error": type(exc).__name__}, fh, sort_keys=True)
        except Exception:
            pass
    try:
        api3_zone = autodns_dynadot_zone()
        print("AUTODNS_ZONE_API3", json.dumps(api3_zone, sort_keys=True), flush=True)
    except Exception as exc:
        print("AUTODNS_ZONE_API3_STARTUP_ERROR", type(exc).__name__, str(exc), flush=True)
    try:
        autodns_dynadot_zone_rest()
    except Exception as exc:
        print("AUTODNS_ZONE_REST_STARTUP_ERROR", type(exc).__name__, str(exc), flush=True)
    for _host in ("betgpt.live", "www.betgpt.live"):
        try:
            print("BETGPT_PUBLIC_RESOLVE", json.dumps({"host": _host, "result": socket.gethostbyname_ex(_host)}, sort_keys=True), flush=True)
        except Exception as exc:
            print("BETGPT_PUBLIC_RESOLVE_ERROR", _host, type(exc).__name__, str(exc), flush=True)
        try:
            _ctx = ssl.create_default_context()
            _ctx.check_hostname = False
            _ctx.verify_mode = ssl.CERT_NONE
            with socket.create_connection((_host, 443), timeout=10) as _sock:
                with _ctx.wrap_socket(_sock, server_hostname=_host) as _tls:
                    _der = _tls.getpeercert(binary_form=True)
            _pem = ssl.DER_cert_to_PEM_cert(_der)
            with tempfile.NamedTemporaryFile("w", delete=False, suffix=".pem") as _tmp:
                _tmp.write(_pem)
                _tmp_path = _tmp.name
            _cert = ssl._ssl._test_decode_cert(_tmp_path)
            _safe_cert = {
                "host": _host,
                "subject": _cert.get("subject"),
                "issuer": _cert.get("issuer"),
                "notBefore": _cert.get("notBefore"),
                "notAfter": _cert.get("notAfter"),
                "subjectAltName": _cert.get("subjectAltName"),
            }
            print("BETGPT_TLS_CERT", json.dumps(_safe_cert, sort_keys=True), flush=True)
        except Exception as exc:
            print("BETGPT_TLS_CERT_ERROR", _host, type(exc).__name__, str(exc), flush=True)


@app.get("/autodns/dynadot-zone-rest")
@app.get("/autodns/dynadot_zone_rest")
def autodns_dynadot_zone_rest():
    key = os.getenv("DYNADOT_API_KEY")
    secret = os.getenv("DYNADOT_API_SECRET")
    domain = os.getenv("AUTODNS_DOMAIN", "betgpt.live")
    if not key or not secret:
        raise HTTPException(503, "Dynadot credentials not configured")
    path = f"/restful/v2/domains/{domain}/records"
    request_id = str(uuid.uuid4())
    body = ""
    string_to_sign = key + "\n" + path + "\n" + request_id + "\n" + body
    signature = base64.b64encode(
        hmac.new(secret.encode("utf-8"), string_to_sign.encode("utf-8"), hashlib.sha256).digest()
    ).decode("ascii")
    req = urllib.request.Request(
        "https://api.dynadot.com" + path,
        method="GET",
        headers={
            "Accept": "application/json",
            "Authorization": "Bearer " + key,
            "X-Request-ID": request_id,
            "X-Signature": signature,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            payload = response.read().decode("utf-8")
            status = response.status
        result = {"http_status": status, "payload": json.loads(payload)}
        print("AUTODNS_ZONE_REST", json.dumps(result, sort_keys=True), flush=True)
        return result
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(payload)
        except Exception:
            parsed = {"raw": payload}
        result = {"http_status": exc.code, "payload": parsed}
        print("AUTODNS_ZONE_REST", json.dumps(result, sort_keys=True), flush=True)
        return result
    except Exception as exc:
        raise HTTPException(502, f"Dynadot REST request failed: {exc}")


# --- ASTRA AUTODNS one-shot secure setup ---
class AutodnsSetupRequest(BaseModel):
    api_key: str
    api_secret: str
    root_verification_token: str
    www_verification_token: str

_AUTODNS_SETUP_USED = False
_AUTODNS_DOMAIN = "betgpt.live"
_AUTODNS_TARGET = "v0zb7ach.up.railway.app"

def _autodns_token_ok(token: str) -> bool:
    expected = os.getenv("AUTODNS_SETUP_TOKEN", "")
    return bool(expected) and hmac.compare_digest(token or "", expected)

def _railway_verify_token(value: str) -> str:
    value = (value or "").strip().strip('"').strip("'")
    while value.startswith("railway-verify=railway-verify="):
        value = value[len("railway-verify="):]
    if not value.startswith("railway-verify="):
        value = "railway-verify=" + value
    if len(value) < len("railway-verify=") + 16:
        raise ValueError("Jeton Railway trop court")
    return value

def _dynadot_rest_call(api_key: str, api_secret: str, method: str, path: str, payload=None):
    api_key = (api_key or "").strip().strip('"').strip("'")
    api_secret = (api_secret or "").strip().strip('"').strip("'")
    if not api_key or not api_secret:
        raise ValueError("Identifiants Dynadot manquants")
    body = "" if payload is None else json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    request_id = str(uuid.uuid4())
    string_to_sign = api_key + "\n" + path + "\n" + request_id + "\n" + body
    signature = base64.b64encode(
        hmac.new(api_secret.encode("utf-8"), string_to_sign.encode("utf-8"), hashlib.sha256).digest()
    ).decode("ascii")
    headers = {
        "Accept": "application/json",
        "Authorization": "Bearer " + api_key,
        "X-Request-ID": request_id,
        "X-Signature": signature,
    }
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = body.encode("utf-8")
    req = urllib.request.Request(
        "https://api.dynadot.com" + path,
        method=method,
        headers=headers,
        data=data,
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as response:
            raw = response.read().decode("utf-8", errors="replace")
            return response.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw)
        except Exception:
            parsed = {"raw": raw[:1000]}
        return exc.code, parsed

def _dns_lists(payload: dict):
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, dict):
        data = {}
    glue = data.get("glue_info")
    if not isinstance(glue, dict):
        glue = {}
    mains = glue.get("dns_main_list") or []
    subs = glue.get("dns_sub_list") or []
    return list(mains) if isinstance(mains, list) else [], list(subs) if isinstance(subs, list) else [], glue

def _rec_type(r):
    return str(r.get("record_type", "")).lower()

def _sub_host(r):
    return str(r.get("sub_host", "")).lower().rstrip(".")

@app.get("/autodns/setup", response_class=HTMLResponse)
def autodns_setup_form(token: str = ""):
    global _AUTODNS_SETUP_USED
    if not _autodns_token_ok(token):
        raise HTTPException(404, "Not found")
    if _AUTODNS_SETUP_USED:
        return HTMLResponse("<h2>ASTRA AUTODNS</h2><p>Ce lien one-shot a déjà été utilisé avec succès.</p>")
    page = """<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ASTRA AUTODNS — BetGPT</title>
<style>body{font-family:system-ui;background:#0b1020;color:#eef2ff;max-width:760px;margin:40px auto;padding:0 20px}
.card{background:#151b2f;border:1px solid #303a63;border-radius:18px;padding:24px}label{display:block;margin-top:16px;font-weight:700}
input{width:100%;box-sizing:border-box;padding:12px;margin-top:6px;border-radius:10px;border:1px solid #47527a;background:#0f1528;color:#fff}
button{margin-top:22px;padding:13px 18px;border:0;border-radius:11px;font-weight:800;cursor:pointer}
small{color:#b7c0e0}pre{white-space:pre-wrap;background:#090d18;padding:16px;border-radius:12px}</style></head>
<body><div class="card"><h1>ASTRA AUTODNS — BetGPT.live</h1>
<p>Les identifiants sont utilisés uniquement en mémoire pour cette opération et ne sont pas enregistrés dans Railway.</p>
<label>Dynadot Production API Key<input id="k" type="password" autocomplete="off"></label>
<label>Dynadot API Secret<input id="s" type="password" autocomplete="off"></label>
<label>TXT Railway pour betgpt.live<input id="r" type="text" autocomplete="off" placeholder="railway-verify=..."></label>
<small>Dans Railway : domaine betgpt.live → valeur TXT _railway-verify.</small>
<label>TXT Railway pour www.betgpt.live<input id="w" type="text" autocomplete="off" placeholder="railway-verify=..."></label>
<small>Dans Railway : domaine www.betgpt.live → valeur TXT _railway-verify.www.</small>
<button id="go">Configurer et vérifier Dynadot</button><pre id="out">Prêt.</pre></div>
<script>
const token=new URLSearchParams(location.search).get('token')||'';
document.getElementById('go').onclick=async()=>{
 const out=document.getElementById('out'); out.textContent='Configuration en cours…';
 const payload={api_key:k.value,api_secret:s.value,root_verification_token:r.value,www_verification_token:w.value};
 try{
   const res=await fetch('/autodns/setup/apply?token='+encodeURIComponent(token),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
   const data=await res.json(); out.textContent=JSON.stringify(data,null,2);
   if(res.ok){k.value='';s.value='';}
 }catch(e){out.textContent='Erreur réseau: '+e;}
};
</script></body></html>"""
    return HTMLResponse(page)

@app.post("/autodns/setup/apply")
def autodns_setup_apply(req: AutodnsSetupRequest, token: str = ""):
    global _AUTODNS_SETUP_USED
    if not _autodns_token_ok(token):
        raise HTTPException(404, "Not found")
    if _AUTODNS_SETUP_USED:
        raise HTTPException(409, "Lien déjà utilisé")
    root_token = _railway_verify_token(req.root_verification_token)
    www_token = _railway_verify_token(req.www_verification_token)
    path = f"/restful/v2/domains/{_AUTODNS_DOMAIN}/records"

    # 1) Auth + état actuel, sans mutation.
    status, current = _dynadot_rest_call(req.api_key, req.api_secret, "GET", path)
    if status != 200:
        raise HTTPException(status_code=502, detail={"stage":"read-zone","upstream_status":status,"dynadot":current})
    mains, subs, glue = _dns_lists(current)
    glue_type = str(glue.get("glue_type", "")).lower()
    if glue_type and "dns" not in glue_type:
        raise HTTPException(409, detail={"stage":"precheck","error":"Le domaine n'utilise pas Dynadot DNS","glue_type":glue.get("glue_type")})

    # 2) Supprimer seulement les routes web conflictuelles + anciens TXT Railway.
    web_main_types = {"a","aaaa","cname","aname","forward","stealth"}
    web_sub_types = {"a","aaaa","cname","forward","stealth"}
    remove_main = [r for r in mains if _rec_type(r) in web_main_types]
    remove_sub = []
    for r in subs:
        host = _sub_host(r)
        typ = _rec_type(r)
        if host == "www" and typ in web_sub_types:
            remove_sub.append(r)
        elif host in {"_railway-verify","_railway-verify.www"} and typ == "txt":
            remove_sub.append(r)

    if remove_main or remove_sub:
        delete_payload = {}
        if remove_main: delete_payload["dns_main_list"] = remove_main
        if remove_sub: delete_payload["dns_sub_list"] = remove_sub
        dstatus, deleted = _dynadot_rest_call(req.api_key, req.api_secret, "DELETE", path, delete_payload)
        if dstatus != 200:
            raise HTTPException(502, detail={"stage":"remove-conflicts","upstream_status":dstatus,"dynadot":deleted})

    # 3) Ajouter uniquement le routage Railway et les TXT de vérification.
    add_payload = {
        "dns_main_list": [
            {"record_type":"aname","record_value1":_AUTODNS_TARGET,"record_value2":""}
        ],
        "dns_sub_list": [
            {"sub_host":"www","record_type":"cname","record_value1":_AUTODNS_TARGET,"record_value2":""},
            {"sub_host":"_railway-verify","record_type":"txt","record_value1":root_token,"record_value2":""},
            {"sub_host":"_railway-verify.www","record_type":"txt","record_value1":www_token,"record_value2":""}
        ]
    }
    astatus, added = _dynadot_rest_call(req.api_key, req.api_secret, "POST", path, add_payload)
    if astatus != 200:
        raise HTTPException(502, detail={"stage":"add-railway-records","upstream_status":astatus,"dynadot":added})

    # 4) Relecture réelle de la zone.
    vstatus, verify_payload = _dynadot_rest_call(req.api_key, req.api_secret, "GET", path)
    if vstatus != 200:
        raise HTTPException(502, detail={"stage":"verify-zone","upstream_status":vstatus})
    vmains, vsubs, _ = _dns_lists(verify_payload)
    evidence = {
        "root_routes":[r for r in vmains if _rec_type(r) in web_main_types],
        "www_routes":[r for r in vsubs if _sub_host(r)=="www" and _rec_type(r) in web_sub_types],
        "railway_txt":[r for r in vsubs if _sub_host(r) in {"_railway-verify","_railway-verify.www"} and _rec_type(r)=="txt"],
    }
    root_ok = any(_rec_type(r)=="aname" and str(r.get("record_value1","")).rstrip(".")==_AUTODNS_TARGET for r in evidence["root_routes"])
    www_ok = any(_rec_type(r)=="cname" and str(r.get("record_value1","")).rstrip(".")==_AUTODNS_TARGET for r in evidence["www_routes"])
    txt_values = {( _sub_host(r), str(r.get("record_value1","")) ) for r in evidence["railway_txt"]}
    txt_ok = ("_railway-verify", root_token) in txt_values and ("_railway-verify.www", www_token) in txt_values
    if not (root_ok and www_ok and txt_ok):
        raise HTTPException(500, detail={"stage":"verify-zone","root_ok":root_ok,"www_ok":www_ok,"txt_ok":txt_ok,"evidence":evidence})

    _AUTODNS_SETUP_USED = True
    return {
        "ok": True,
        "domain": _AUTODNS_DOMAIN,
        "target": _AUTODNS_TARGET,
        "root_route_ok": root_ok,
        "www_route_ok": www_ok,
        "verification_txt_ok": txt_ok,
        "preservation_policy": "MX/TXT/CAA/email et autres DNS non conflictuels conservés",
        "next": "Railway peut maintenant valider le domaine et émettre le certificat HTTPS."
    }
# --- end ASTRA AUTODNS one-shot setup ---
