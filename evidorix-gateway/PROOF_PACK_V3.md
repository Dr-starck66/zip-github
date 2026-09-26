# Evidorix V3 — Proof Pack

Date: 2026-09-26

## Verified PASS
The V3 core was reconstructed from the repository in a clean local directory and executed with Node 22.

Self-test: unsupported certainty without evidence => FAIL; robust strict case => PASS; SHA-256 fingerprint format => PASS. Observed scores: negative case 31/100; robust case 84/100.

A 10-case benchmark was executed independently from the browser UI. Result: **10/10 cases matched the expected verdict**. This is a regression result for the defined suite, not a claim of universal 100% factual accuracy.

## Implemented V3 assets
- provider-agnostic audit engine;
- strict, balanced and exploratory policies;
- server-side URL verifier with timeout;
- localhost/loopback blocking;
- GitHub commit/status/Actions verifier;
- API routes and dashboard;
- OpenAPI contract;
- fingerprinted audit reports;
- Node self-test;
- 10-case benchmark;
- GitHub CI workflow;
- Netlify Functions + Netlify Blobs durable variant.

## Deployment status
- Netlify project Evidorix created.
- Reserved URL: https://evidorix.netlify.app
- Deployment remains PARTIAL because the Netlify uploader requires npx and the available container cannot resolve npm (EAI_AGAIN).
- Render free service/database creation was blocked because Render requires payment information.
- Vercel deploy action is not exposed by the connected tool in this session.

No production PASS is claimed until /healthz, audit creation, durable ledger retrieval and GitHub verification are checked on the live URL.

## Brand snapshot
Commercial brand: Evidorix. Method/engine: Mythos Astra Ω. Exact web search returned no Evidorix result at check time and evidorix.com was reported available. This is not trademark clearance and availability can change.
