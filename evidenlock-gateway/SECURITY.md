# Security Notes — EVIDENLOCK V3.1

## API keys
- plaintext keys are never stored in the database;
- SHA-256 hashes are stored in api_keys;
- keys support scopes;
- inactive keys are rejected;
- last_used_at is updated on successful authentication;
- the initial admin key plaintext is transferred separately to the owner.

## Bootstrap
A temporary bootstrap environment secret was used only during deployment setup and then deleted after the persistent admin-key hash was seeded.

## HTTP evidence verifier
- only HTTP/HTTPS are accepted;
- DNS is resolved before requests;
- loopback, link-local, RFC1918 and IPv6 local targets are rejected;
- redirect destinations are revalidated before following;
- redirects are capped;
- request timeout is enforced.

## Data
Audits are stored in the production database. Any future multi-tenant release should add organization isolation, retention controls, deletion workflows and encryption policy documentation.

## Current gaps
- no rate limiter yet;
- no SSO/RBAC yet;
- no usage metering;
- no formal external penetration test.
