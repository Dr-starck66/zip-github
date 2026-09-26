# EVIDENLOCK V3.1 — Buyer Proof Pack

## Asset class
Provider-independent AI reliability gateway built around the Mythos Astra Ω evidence-first methodology.

## Implemented and live
- public production deployment;
- persistent Postgres audit ledger through Netlify Database;
- three configurable policies: strict / balanced / exploratory;
- SHA-256 audit fingerprints;
- hashed API keys with scoped authorization;
- persistent initial admin key stored only as a hash;
- HTTP evidence verification;
- SSRF/private-network blocking;
- GitHub commit verification;
- REST API;
- production landing page;
- database migrations;
- automated Node test suite;
- Netlify production build gate.

## Verified proof
See LIVE_PROOF.md.

Key production facts:
- deployment state READY;
- 6/6 independent core tests PASS;
- migration 001 applied;
- migration 002 applied;
- cross-request persistence PASS;
- seeded active API key count >= 1;
- HTTP evidence verifier PASS;
- private-network block PASS;
- GitHub commit verification PASS;
- unauthenticated audit endpoint returns 401.

## Remaining valuation gates
Not yet evidenced:
- paying customer;
- pilot/LOI;
- third-party benchmark;
- team dashboard;
- SSO/RBAC;
- rate limits and usage metering;
- billing;
- multi-tenant organization model;
- formal trademark clearance.

## 50k positioning
A €50k sale or license price is now more defensible than for the earlier browser prototype because the asset is deployed, persistent and integrable. It is still an asking-price thesis, not a proven market valuation until external commercial evidence exists.

The next highest-value milestone is a real workflow integration that automatically submits CI/deployment evidence into EVIDENLOCK and produces a signed audit record.
