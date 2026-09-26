# EVIDENLOCK Gateway v3.1

Provider-independent reliability gateway for AI agents. Internal methodology: Mythos Astra Ω.

## Implemented
- durable audit ledger using Netlify Database;
- hashed API keys with scopes and one-time bootstrap;
- strict / balanced / exploratory policies;
- SHA-256 report fingerprint;
- HTTP evidence verification with private-network / SSRF blocking;
- GitHub commit verification;
- REST API and landing page;
- automated core tests.

## Security model
API keys are stored only as SHA-256 hashes. Plaintext keys are returned once at creation. The bootstrap endpoint works only before the first key is created and requires `EVIDENLOCK_BOOTSTRAP_SECRET`.

The HTTP verifier resolves DNS before each hop and rejects loopback, link-local, RFC1918 and IPv6 local targets. Redirects are manually checked before following.

## Netlify
Database migrations live in `netlify/database/migrations/`. Production deploy provisions the database automatically.

## API
Public: `GET /health`, `GET /v1/policies`.

Authenticated:
- `POST /v1/audits` — `audit:write`
- `GET /v1/audits` — `audit:read`
- `POST /v1/evidence/verify` — `evidence:verify`
- `POST /v1/evidence/github` — `evidence:verify`
- `POST /v1/api-keys` — `keys:write`

## Truth boundary
A PASS means the supplied evidence discipline satisfies the selected EVIDENLOCK policy. It is not a universal guarantee that every factual claim is true.
