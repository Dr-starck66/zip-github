from __future__ import annotations

import hashlib
import json
import math
import subprocess
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
