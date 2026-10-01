# ASTRA DEPLOY TRIGGER FIREWALL Ω

Reusable fail-closed deployment trigger gate for Railway/GitHub deployments.

## What it blocks
- Railway deployments whose triggering Git commit did not change the authorized GREEN release token.
- Deployments whose triggering commit did not change the release manifest.
- Deployments from the wrong branch or controller repository.
- Commits whose message is not an authorized promotion/rollback action.
- Duplicate redeploys when the same source SHA is already public.

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
