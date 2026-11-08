# GAMIC News — ASTRA Ω measurement gate (2026-11-08)

## Objective and definitions
- Goal: 1,000,000 **human visits per rolling 30-day period**. This is a target, not an observed statistic.
- **Google organic clicks**: clicks reported for the verified `sc-domain:gamicnews.com` Google Search Console property (Google search, dated reporting range). This is NOT a full measure of visitors or sessions.
- **Page views / referrers**: browser-side analytics from the live site; distinguish visits, visitors, pageviews and search-origin referrers.
- **Indexed/discovered pages**: Search Console indexing and performance reports. Sitemaps and HTTP 200 alone do not demonstrate Google discovery or indexing.
- **Raw CDN requests**: requests including images, CSS, bots and errors; NEVER present as human visits.

## Evidence observed this session
| Probe | Evidence | Status |
|---|---|---|
| Existing GSC property | Official Google Search Console verification-confirmation email dated 2026-11-04 | PASS — verified at that date |
| GSC access via connected SEO provider | GSC property list lacks `gamicnews.com`; exact-property lookup returned `permission_denied` | FAIL — metrics inaccessible |
| Vercel Web Analytics | `count_pageviews` and `aggregate_pageviews` returned HTTP 404 `Web Analytics not found` | FAIL — not enabled |
| Ubersuggest | No tracked projects returned; daily report quota exhausted (403) | FAIL — no observed estimate |
| Google Drive | Searches for GamicNews analytics reports returned no relevant files | UNVERIFIED — no archival report located |
| Static HTML instrumentation | ASTRA builder injects the exact Vercel plain-HTML first-party tracking script once per built HTML file | PASS — implemented in Git |
| CDN-routed HTML instrumentation | Source files for homepage, /news/, Steam Deck and three recent Steam pages now contain the same snippet | PASS — source verified |
| Vercel Git preview | Deployment `dpl_AMCzK2y2XPARNgvXY3MrXDBZn9yW` reported `READY` after syntax correction | PASS — build-only |
| Browser-side event collection | Dashboard Analytics still not enabled; zero historical tracking can be inferred | UNVERIFIED |
| Production data | Production domain deliberately not switched to unactivated tracking build | UNCHANGED |

## Source branch and deployment
- Repository: `Dr-starck66/zip-github`
- Staged branch: `astra/gamicnews-analytics-measurement-20261108`.
- Starting production source: `c826363d6a014ef7971ecda983462b99d01d82ca`.
- Vercel project: `prj_ghKN1kjf5dKNIOXNUEGRWjV0lXFP`.
- Source builder: `gamicnews/scripts/build-free-static.mjs`.
- No new cron, no paid plan, no GitHub Actions and no DNS change.

## Activation blockers (no invented success)
1. **Google search:** authorize the **already-verified** `sc-domain:gamicnews.com` property in the currently connected Search Console reporting provider, or provide a directly accessible authorized GSC reporting connection. This needs an authorized account action; reading Gmail is not an OAuth grant to Search Console.
2. **Human visits:** activate Vercel Web Analytics in the existing project's dashboard (Analytics > Enable). On the Hobby plan, published documentation lists 50,000 included events per month, so it is a starter measurement tool, NOT a guaranteed million-pageview measurement platform.
3. After enablement, deploy the staged Git build, update only the 6 existing CDN rewrite destinations to the same immutable instrumentation commit, verify the Vercel analytics script route and non-empty real pageview data. Preserve all 287 `vercel.json` redirect rules and the canonical HTML.
4. For sustained high volumes, Cloudflare Web Analytics is documented as free and usable without DNS changes; setup needs a valid Cloudflare site beacon token from the existing authorized account. Without that token, claim nothing about Cloudflare collection.
5. Export organic GSC performance per day and page (clicks, impressions, CTR, average position), plus index coverage; join with pageview/referrer data by normalized canonical URL and date. Select editorial priorities ONLY from actual observed opportunities.

## Verification rule
Never label Google indexing, organic visits, or 1,000,000-visit performance PASS without actual measured data. A successful build is only PASS_BUILD_ONLY.
