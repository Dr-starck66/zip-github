# ASTRA AUTOPUBLISH

Pipeline:

`OPPORTUNITY → BRIEF → ARTICLE PACKET → PREFLIGHT → ADAPTER → DRAFT/PUBLISH → URL LEDGER → SEARCH CONSOLE`

## Fail-closed gates

A packet is blocked unless it has:
- the correct destination site;
- a usable title;
- required word count for its mode;
- at least two traceable sources;
- a canonical URL;
- a 1200px+ image with useful alt text;
- Article or NewsArticle schema;
- an identifiable author;
- Google News evidence;
- no false `confirmedDiscover` claim;
- no high duplicate-risk flag.

Reactive content: 700–1200 words by default.
Pillar content: 1500–3000 words by default.

## Adapters

- `wordpress`: WordPress REST API, credentials only via environment variables.
- `webhook`: any CMS/deployment service exposing a secured POST endpoint.
- anything else: blocked by design.

No credential is committed to GitHub.

For site id `betgpt`, environment variables are prefixed `ASTRA_BETGPT_`.
WordPress uses `WP_BASE`, `WP_USER`, `WP_APP_PASSWORD`.
Webhook uses `WEBHOOK_URL` and optional `WEBHOOK_TOKEN`.

## Safe execution

Preview only:

`node autopublish/engine.mjs autopublish/example.packet.json`

Actual send after an adapter is configured:

`node autopublish/engine.mjs autopublish/article.packet.json --send`

Every attempt is appended to `autopublish/publication-ledger.jsonl`.

## Important

A high Discover signal never becomes a claim that the article appeared in Google Discover. Only owned Search Console Discover impressions can produce that evidence.
