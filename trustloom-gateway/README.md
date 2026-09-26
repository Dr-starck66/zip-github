# EvidenLock Gateway v3

Evidence-first reliability gateway for AI agents. Internal method: Mythos Astra Ω.

## Implemented
- POST /v1/audits — deterministic audit with strict/balanced/exploratory policies
- GET /v1/policies — machine-readable policy profiles
- GET /v1/audits — process-local audit ledger
- POST /v1/evidence/verify — live HTTP evidence reachability checks
- POST /v1/evidence/github — GitHub commit verification
- GET /health — health endpoint
- SHA-256 fingerprint for every audit
- Node test suite and CI-ready zero-dependency core

## Important V3 boundary
The current ledger is process-local. It is real while the process is alive, but is not durable storage on serverless infrastructure. Durable multi-tenant persistence is the next infrastructure gate and must not be represented as complete.

## Local
npm test
npm start

## Example
POST /v1/audits
{"policy":"strict","task":"PASS if deployment and independent verification succeed","answer":"...","evidence":"https://... HTTP 200\nPlaywright test PASS independent\nRed Team counter-test PASS\nsecond run reproduced"}

## Architecture
Client/agent -> EvidenLock Gateway -> policy engine -> evidence verifiers -> audit report -> ledger

The gateway does not call an LLM. It evaluates the evidence discipline around LLM/agent outputs, keeping the control layer provider-independent.
