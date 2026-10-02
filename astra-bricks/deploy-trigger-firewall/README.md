# ASTRA DEPLOY TRIGGER FIREWALL Ω

Reusable fail-closed deployment trigger gate for Railway/GitHub deployments.

## What it blocks
- Railway deployments whose triggering Git commit did not change the authorized GREEN release token.
- Deployments whose triggering commit did not change the release manifest.
- Deployments from the wrong branch or controller repository.
- Commits whose message is not an authorized promotion/rollback action.
- Duplicate redeploys when the same source SHA is already public.
- Stale Railway snapshot redeploys unless an explicit `ASTRA_CONTROL_PLANE_NONCE` exactly matches the freshly pulled, GREEN-approved source SHA.

## Required Railway context
The gate relies on Railway-provided Git variables, especially:
- RAILWAY_GIT_COMMIT_SHA
- RAILWAY_GIT_BRANCH
- RAILWAY_GIT_REPO_OWNER
- RAILWAY_GIT_REPO_NAME
- RAILWAY_GIT_COMMIT_MESSAGE

## Integration
Import `assertAuthorizedRailwayTrigger()` at the very start of the existing source/build gate and run it before bootstrap, dependency installation, migrations, or application build.

Each site passes its own:
- controllerRepo
- greenPath
- manifestPath
- publicRevisionUrl

Policy is fail-closed for missing Git identity or unauthorized trigger commits.

## Stale-snapshot reconciliation

Railway may reuse the Git identity of a previous successful deployment when a service is manually redeployed. The firewall therefore supports a narrow reconciliation mode: after the latest control-plane files are pulled, `ASTRA_CONTROL_PLANE_NONCE` must exactly equal the current manifest source SHA, the GREEN marker must match that SHA, carry the canonical promotion key and a valid Never-Fail workflow run ID, and the next source gate re-verifies that workflow proof against GitHub.

A stale nonce never blocks a later normal release commit; when it does not match the current control-plane target, the normal authorized release path is evaluated instead.
