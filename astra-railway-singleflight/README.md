# ASTRA RAILWAY SINGLE-SOURCE GUARD Ω

Status: ACTIVE
Scope: GLOBAL Railway projects, with BetGPT as the reference implementation.

## Mission
Prevent service sprawl, accidental v2/v3/v4 clones, wrong-source deployments, stale deployments and false PASS states.

## Canonical invariants
1. Every production application has exactly one canonical public web service.
2. New fixes update/redeploy that service; they do not create `-v2`, `-v3`, `-v4` clones.
3. Helper/model/worker services are allowed only when explicitly declared by role.
4. A legacy service is never deleted automatically solely because its name looks stale.
5. PASS requires: authenticated Railway read + canonical service exists + deployment SUCCESS + expected source identity + healthcheck configured + public route verified when available.
6. Custom-domain ownership must be checked separately. A Railway-generated domain is not proof that the user domain points to the canonical service.
7. Source SHA and deployed source SHA must agree whenever revision evidence is available.
8. Unknown dependency or routing state = PARTIAL/UNVERIFIED, never PASS.

## BetGPT canonical service
Project: BETGPT LIVE
Canonical web service: betgpt
Allowed supporting roles include chat model, source inspector and explicitly documented runtime helpers.
Legacy candidates such as betgpt-complete-v* are quarantined for investigation; they are not valid release targets.

## Lifecycle
DISCOVER → AUTH VERIFY → INVENTORY → CLASSIFY → CANONICAL CHECK → SOURCE CHECK → HEALTH CHECK → DOMAIN CHECK → PUBLIC VERIFY → PASS/PARTIAL/FAIL

## Anti-sprawl rule
Any operation that would create a service whose normalized name matches an existing canonical app plus a version suffix must be rejected unless an architecture change explicitly requires a distinct service and records its role.
