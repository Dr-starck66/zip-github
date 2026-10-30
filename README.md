# CarLeaseDeal — release candidate for Netlify Free

**Project**: carleasedeal.net (Porkbun registrar). **Preview**: ASTRA AppDeploy, `carleasedeal-usa-lease-intelligence-02fnei`.

**Netlify Free project was created**: [carleasedeal-net](https://app.netlify.com/projects/carleasedeal-net). Netlify team: `cedric-jeanjean66`. This branch contains the source and is **not yet connected** to the Netlify project.

## Repository isolation

This source resides only on `carleasedeal-site-20261030` in the existing public `Dr-starck66/zip-github` repository. It is deliberately not merged into `main`, which operates unrelated ASTRA infrastructure. This branch's root omits all GitHub Actions workflows, avoiding a new Actions dependency.

## Netlify build

- Connect the already-created site to the public repository using **branch `carleasedeal-site-20261030`** as its production branch, or import it as a new Netlify project if the existing empty site cannot be linked.
- `netlify.toml` builds with Node 22 and `npm run build`, publishing `dist`.
- Static HTML copy is from Vite's `public` tree. Offers and high-intent legacy paths are included. No database or server billing.
- `node scripts/verify-data.mjs` blocks partially invented price records: 40 historical vehicles, 18 priced publisher references, 22 unverified prices suppressed, zero live dealer-confirmed offers. A quote is **not** treated as live.
- Default build generates `noindex,follow` on every HTML page plus an HTTP `X-Robots-Tag: noindex` for safe preproduction.

## SEO release gate — don't skip

1. Attach `carleasedeal.net` and `www.carleasedeal.net` to the Netlify site.
2. Set Porkbun DNS after confirming the exact Netlify target. Netlify currently documents apex A 75.2.60.5 or ALIAS apex-loadbalancer.netlify.com and `www` CNAME to `carleasedeal-net.netlify.app`; verify with Netlify's project-specific instructions first.
3. Independently test apex and www HTTPS, 200 root, historical URLs, robots header, no 404s, redirects and SSL certificate.
4. Then and **only then** set Netlify production environment variables `DOMAIN_HTTPS_CONFIRMED=1` and `SITE_INDEX_RELEASE=1`, and trigger a new production deploy. That generates canonical links, sitemap and robots entries from the actual HTML paths.
5. Verify Google Search Console property ownership, submit sitemap; monitor impressions and positions. **No #1 ranking is guaranteed.**

**Caution**: the current source catalog is a snapshot, *not* an automatic real-time feed. Do not advertise live deals before current manufacturer verification and regional offer conditions are implemented.

## Cost guard

Netlify team confirmed Free; no paid addons, calls to paid models, Railway resources, or chargeable jobs are required. The Free plan has a hard monthly credit limit; exhaustion may pause the website.
