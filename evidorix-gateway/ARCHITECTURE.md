# Evidorix V3 Architecture

1. Client submits objective, AI output, evidence and policy.
2. Gateway extracts claims and evidence.
3. URL evidence is verified server-side.
4. Claims are linked to evidence in an Evidence Graph.
5. Six gates score Objective, Evidence Coverage, Independent Verification, Red Team, False-Pass Hunter and Reproducibility.
6. Policy rules can block PASS even when the average score is high.
7. Report receives a SHA-256 fingerprint.
8. Report is written to the audit ledger.
9. API returns PASS / PARTIAL / FAIL plus blockers.

GitHub connector checks commit existence, combined commit status and GitHub Actions runs for a SHA.

Runtime variants: evidorix-gateway is portable Node 20+; evidorix-netlify uses Netlify Functions and durable Netlify Blobs.

Enterprise roadmap: SSO/RBAC, tenant isolation, signed attestations, immutable ledger, policy DSL, SDKs, GitHub App, CI status checks, domain benchmark packs and richer evidence sandboxing.
