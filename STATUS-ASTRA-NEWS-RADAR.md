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
