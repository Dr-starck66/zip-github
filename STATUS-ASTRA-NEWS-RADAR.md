# ASTRA NEWS RADAR — Validation Status

Date: 2026-09-26
Mode: Mythos Astra Ω / Evidence-First / FAIL CLOSED

## V0.2 Search Console Evidence Layer

- Dashboard JavaScript syntax: PASS
- Evidence contract: PASS
- Missing evidence cannot confirm Discover: PASS
- Zero-impression evidence cannot confirm Discover: PASS
- Evidence older than 36h cannot confirm Discover: PASS
- Fresh connected property with Discover impressions is admissible: PASS
- Similar confirmed historical Discover page can create a bounded prior: PASS
- Unrelated topic receives no prior: PASS
- Evidence builder unit test: PASS
- Evidence builder synthetic fixture: PASS
- Competitor Discover confirmation from public data: FORBIDDEN BY DESIGN

## Current external state

Search Console account data has not yet been ingested. Until an authorized Search Console connector is connected, all site records remain fail-closed and the UI must not display confirmed Discover data.

## Next data ingestion

Use an authorized Google Search Console connection to populate `evidence/search-console.json` with each owned property's Discover totals and page-level evidence.


## V0.3 Opportunity → Editorial Brief

- Dashboard JavaScript syntax after integration: PASS
- Brief generated from the selected opportunity only: PASS BY DESIGN
- Reactive vs pillar length policy encoded: PASS
- Source links preserved in brief: PASS
- 1200×675 image requirement encoded: PASS
- YouTube research prompt encoded without fabricating a video: PASS
- Internal-link recommendation encoded: PASS
- Confirmed Discover label remains fail-closed: PASS
- No guarantee of Google News / Discover distribution is generated: PASS

Latest implementation commit: 5bdf864cf68975ca84cc2f354dcc656155ccfe02


## V0.4 ASTRA AUTOPUBLISH

- Multi-site publication engine: PASS
- Word-count gates by editorial mode: PASS
- Source traceability gate: PASS
- Canonical gate: PASS
- 1200px+ image gate: PASS
- Schema / author gates: PASS
- False CONFIRMED DISCOVER claim blocked: PASS
- High duplicate-risk flag blocked: PASS
- Unconfigured destination adapter blocks real send: PASS
- Publication ledger creation: PASS
- Editorial generation job per site: PASS
- PulsoPlaneta es-ES generation contract: PASS
- Dashboard AUTOPUBLISH job button syntax: PASS
- Static deployment fallback queues locally instead of claiming publication: PASS
- GitHub workflow definition updated to run both AUTOPUBLISH tests: PASS
- GitHub hosted workflow execution observed: NOT YET OBSERVED

Evidence from executable VM tests:
- AUTOPUBLISH_TEST_PASS
- FAIL_CLOSED_FIXTURE_PASS
- HEALTH_PASS
- PREFLIGHT_BLOCK_PASS
- PREFLIGHT_READY_PASS
- SEND_FAIL_CLOSED_PASS
- LEDGER_PASS
- GENERATION_JOB_TEST_PASS
- JOB_API_PASS
- DASHBOARD_SYNTAX_PASS

Current production gate:
All three destination adapters remain configured=false. No production publication is claimed until a real destination endpoint or authenticated WordPress connection is wired and verified.
