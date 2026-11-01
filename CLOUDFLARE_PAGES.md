# ASTRA Ω — CarLeaseDeal on Cloudflare Pages Free

**Source**: `Dr-starck66/zip-github` branch `carleasedeal-site-20261030`.
**Hosting**: Cloudflare Pages Free, entirely static. **Not yet deployed**: a Cloudflare account authorisation and Git integration are not available through the current ChatGPT connectors.
**No billable features**: no Pages Functions, Workers, Browser Run, R2, D1, KV, Durable Objects, paid security or account upgrades in this site.

## Deployment contract

| Field | Required value |
| --- | --- |
| Cloudflare Pages project | `astra-carleasedeal-pages` |
| Git repo | `Dr-starck66/zip-github` |
| Production branch | `carleasedeal-site-20261030` |
| Root | `/` |
| Build command | `npm run build:pages` |
| Build output | `dist` |
| Node.js | 22 |
| Build mode | Free / static assets |
| Initial indexing | Disabled (noindex, follow) |

The version-controlled `wrangler.toml` records the Pages project name and `./dist` output, **without** paid bindings. No GitHub Actions, CircleCI, paid CI or container process is used. Choose Git integration and restrict preview builds to avoid consuming the 500-build/month free allowance unnecessarily.

The `build:pages` command verifies source catalog consistency, builds Vite, performs the SEO postbuild gate and checks the resulting artifacts: 17 HTML pages, all five known historical paths, four topical hubs, H1/title, indexation guard, one JS asset bundle, no Cloudflare Function entrypoint.

### SEO protection

The first public Pages deployment on `*.pages.dev` is a staging deployment with `SITE_INDEX_RELEASE=0` and `DOMAIN_HTTPS_CONFIRMED=0`. Do **not** disable noindex until the custom domain and HTTPS are working, canonical URLs and all historical paths are checked, and the site's historical offers are accurately labeled. Google indexing is not guaranteed by deploying a sitemap.

### IMPORTANT: email and DNS safety

On 1 Nov 2026, public DNS for `carleasedeal.net` was still delegated to `dns3002a.trouble-free.net` and `dns3002b.trouble-free.net`, with A `64.20.40.252` and suspended hosting.

Public records also showed:
- MX: priority 0 pointing to `carleasedeal.net` itself.
- `mail.carleasedeal.net`: CNAME to `carleasedeal.net`.
- SPF TXT: `v=spf1 +a +mx +ip4:162.246.16.66 include:relay.mailbaby.net ~all`.

Changing the apex A address to Cloudflare Pages could silently break mailbox routing. **Stop the domain cutover until the mail endpoint is independently verified and routed separately**; a full DNS zone export is required to protect other subdomains and DKIM records. Never remove existing mail, SPF, DKIM, DMARC or unrelated records by bulk zone replacement.

Cloudflare Pages requires Cloudflare authoritative nameservers for an apex custom domain. The user registers the domain at Porkbun, but Porkbun's DNS editor is **not authoritative** while the registrar delegates to `trouble-free.net`. Set up the new Cloudflare zone, accurately migrate all DNS records and ensure mail preservation **before** changing Porkbun nameservers. Then attach `carleasedeal.net` and `www.carleasedeal.net` to the Pages project, verify public HTTPS, status 200 for the homepage and five historical URLs, linked photos, canonical redirects and sitemap. Only then enable `SITE_INDEX_RELEASE=1` and `DOMAIN_HTTPS_CONFIRMED=1` in a verified production build.

### Strict zero-cost gate

Cloudflare Pages static asset requests are free and unlimited; Pages Free includes 500 builds/month. On quota exhaustion, stop new builds rather than upgrade. **Never** add a payment method, activate a paid plan, introduce Functions or enable a usage-priced Cloudflare service. This project cannot be declared live from a GitHub commit alone.

Official docs:
- https://developers.cloudflare.com/pages/platform/limits/
- https://developers.cloudflare.com/pages/functions/pricing/
- https://developers.cloudflare.com/pages/get-started/git-integration/
- https://developers.cloudflare.com/pages/configuration/custom-domains/
