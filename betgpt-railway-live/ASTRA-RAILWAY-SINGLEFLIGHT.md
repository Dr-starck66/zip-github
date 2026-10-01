# ASTRA RAILWAY SINGLE-FLIGHT

Purpose: prevent duplicate Railway deploy fan-out and false PASS states.

## Invariant
BetGPT production source is selected by exactly one file: `source-manifest.json`.

Railway watches only that file. Changes to environment variables, helper files, rebuild markers, or unrelated wrapper code no longer constitute a source promotion.

## Gate
`source-gate.mjs` fails closed unless:
- sourceRepo is valid;
- sourceSha is a full immutable 40-character Git SHA;
- GitHub confirms that exact commit exists.

The verified pair becomes the deployment key: `repo@sha`.

## Promotion rule
A new production deployment is requested only by changing `source-manifest.json` to a different immutable SHA. Re-writing the same SHA is forbidden by the controller workflow.

## PASS criteria
PASS requires:
1. ASTRA_SINGLEFLIGHT_PASS for the requested repo@sha;
2. BETGPT_SOURCE_OK for the same repo@sha;
3. build success;
4. Railway runtime success;
5. /api/health returns 2xx;
6. public /astra-revision.json reports the same sourceSha.

Anything else is PARTIAL/FAIL, never PASS.
