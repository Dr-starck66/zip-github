# ASTRA IMAGE INTEGRITY Ω — global image gate

**Status vocabulary:** PASS (actual HTTP and valid image bytes), FAIL (missing/broken image or invalid cover), UNVERIFIED (site disconnected or never tested). No blind PASS.

## What is verified
- Every `<img>` in each configured HTML page has a nonempty `src` and a resolvable image URL.
- Images return HTTP 200 with an `image/*` MIME and identifiable image payload bytes (PNG, WebP, JPEG, AVIF; SVG is not accepted as an Article/Discover cover).
- On editorial Article / NewsArticle routes, the OpenGraph image is a real raster asset with known dimensions **at least 1200 × 630**, not a fake generated URL.
- Duplicate cover bytes are rejected between articles of one site.
- A required page with zero HTML images fails.
- Broken DNS/SSL, 403/404, HTML served as image, missing captions/alt or invalid cover cannot PASS.
- The site must be public and HTTP-testable (a GitHub merge or Railway SUCCESS alone does not prove visual integrity).

## Existing site integration
- Cibao: `eldiariodelcibao/scripts/astra-image-gate.mjs` blocks the build in the site's GitHub Actions; an additional Railway probe separately confirms HTTP 200 and real WebP bytes in production.
- All sites in `sites.json`: central **daily audit**, without API subscription or additional paid service. Alerts are GitHub failed-run notifications. A central monitor is **not** equivalent to a deploy-blocking check in every individual repository.
- Inactive/unconnected sites are explicitly marked **UNVERIFIED**, not PASS.

## Attach to a new site's build
Add a job to the site's GitHub Actions workflow once a preproduction URL is deployed:

```yaml
jobs:
  image-proof:
    uses: Dr-starck66/zip-github/.github/workflows/astra-image-global.yml@main
    with:
      site_url: https://your-preproduction-site.example
      paths_csv: /article-one/,/article-two/
      articles: true
```

For sites where cross-repository reusable workflows are restricted, vendor `scan.mjs` into the repository and run `node scan.mjs --base ... --paths ... --articles` during **post-deploy** CI, requiring exit code 0.

## Daily portfolio scan
`node astra-image-integrity/scan.mjs --config astra-image-integrity/sites.json --report astra-image-integrity/latest-report.json`

## Limitations
- HTML crawling alone does not verify images introduced *only* by client-side JavaScript after hydration. Those sites require a Playwright/browser rendering gate.
- A reliable 1200px image is a technical condition for Discover, not a guarantee of Discover selection.
- This workflow does not silently modify unrelated sites or claim future sites are protected until they are explicitly integrated.
- GitHub Actions uses existing account quotas; no paid image service, stock-photo license, API subscription, or new hosting service is introduced.
