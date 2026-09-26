# EVIDENLOCK V3.1 — Live Production Proof

Date: 2026-09-26

## Production
- URL: https://evidenlock-gateway.netlify.app
- Netlify deploy: 6ab7fb83598157c3676c4622
- Deploy state: READY
- Function deployed: gateway
- Runtime: Node.js 24
- Database branch: production

## Database migrations
- 001_init — applied
- 002_seed_admin_key — applied

## Independent core test
Executed on a separate cloud VM immediately before deployment:
- 6 tests
- 6 PASS
- 0 FAIL

Coverage:
- policy profiles
- unsupported certainty -> FAIL
- robust evidence -> PASS
- strict policy blocks missing Red Team
- API-key hashing
- scope wildcard behavior

## Live production checks
Executed from a separate cloud VM against the public Netlify URL:

### Health
GET /health -> HTTP 200
Service reports:
- evidenlock-gateway
- version 3.1.0
- persistence: netlify-database

### Durable persistence
Request 1:
GET /v1/selftest?phase=write
- wrote nonce 8fc9d60d6c84ca68d306d39c

Request 2:
GET /v1/selftest?phase=read
- read the identical nonce
- score 100
- verdict PASS
- activeApiKeys: 1

Result: cross-request database persistence verified.

### Evidence/security integration
GET /v1/selftest?phase=security
- https://example.com verified HTTP 200
- private network target blocked: true
- GitHub commit verification: HTTP 200 / verified true

### Authentication gate
Unauthenticated POST /v1/audits -> HTTP 401.

## Security closure
The temporary EVIDENLOCK_BOOTSTRAP_SECRET environment variable was deleted after the hashed initial admin key was migrated into the production database.

## Truth boundary
These checks prove that the deployed V3.1 service, persistent database, auth gate, fixed evidence verifier self-tests and GitHub integration are operational for the tested paths. They do not prove universal factual accuracy across all possible AI outputs or external websites.
