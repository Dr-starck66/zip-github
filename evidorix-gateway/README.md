# Evidorix Gateway V3

Commercial product name: **Evidorix**  
Reliability method/engine: **Mythos Astra Ω**

## Implemented
- real Node HTTP API;
- server-side URL verification with timeout and redirect handling;
- configurable strict / balanced / exploratory policies;
- fingerprinted audit reports;
- audit ledger API;
- GitHub commit + combined-status + Actions verification connector;
- browser dashboard;
- OpenAPI 3.1 contract;
- zero npm runtime dependencies.

## Endpoints
- `GET /healthz`
- `GET /v1/policies`
- `POST /v1/audits`
- `GET /v1/audits`
- `GET /v1/audits/:id`
- `POST /v1/verify/github`

## Registry limitation
The V3 deployment writes to an ephemeral JSON registry. It is a real registry during the lifetime of the service instance, but it is **not durable storage** across all redeployments/restarts. The API exposes this fact explicitly. Production V4 should attach Postgres or another persistent store.

## Local
```bash
cd evidorix-gateway
npm test
npm start
```

## Security notes
URL verifier rejects localhost/loopback URLs, limits verification count by policy and uses a 4.5 second timeout. The public demo intentionally has no user authentication and must not be treated as a multi-tenant production control plane.
