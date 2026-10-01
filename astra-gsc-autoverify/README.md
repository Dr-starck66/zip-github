# ASTRA GSC AUTOVERIFY

Reusable zero-click Google Search Console enrollment brick.

## Goal

For a new site, automate the whole chain:

1. obtain a Google Site Verification token;
2. publish the proof automatically;
3. wait for public proof instead of assuming success;
4. ask Google Site Verification to verify ownership;
5. add the Search Console property;
6. submit sitemap-index.xml and sitemap-news.xml;
7. run URL Inspection;
8. return PASS / PARTIAL / FAIL evidence.

## Strategies

### FILE (preferred)
No registrar dependency. The brick obtains a FILE token, writes the verification file to the site's GitHub public root, waits until the exact file is publicly reachable, verifies ownership, adds the URL-prefix Search Console property, then submits sitemaps.

Required cloud secrets:
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- GOOGLE_REFRESH_TOKEN
- GITHUB_TOKEN
- GITHUB_REPOSITORY (owner/repo)
Optional: GITHUB_BRANCH, PUBLIC_ROOT.

### DNS_TXT (domain-property fallback)
For a full Domain property (all protocols/subdomains), the brick obtains a DNS_TXT token and writes it through a registrar adapter. Dynadot and Porkbun are included.

Dynadot: DYNADOT_API_KEY and DNS_PROVIDER=dynadot.
Porkbun: PORKBUN_API_KEY, PORKBUN_SECRET_API_KEY and DNS_PROVIDER=porkbun.

Dynadot writes use set_dns2 with add_dns_to_current_setting=1 so existing DNS records are not deliberately replaced.

## Google OAuth scopes

Authorize once with:
- https://www.googleapis.com/auth/siteverification
- https://www.googleapis.com/auth/webmasters

Store the resulting refresh token as a backend secret. No repeated Google login is needed unless Google revokes the grant.

## Examples

```bash
node src/index.mjs --domain freehotels.info --strategy file --repo Dr-starck66/freehotels-site --public-root public
```

Domain-property fallback:

```bash
DNS_PROVIDER=dynadot node src/index.mjs --domain freehotels.info --strategy dns
```

## Mythos Astra Omega gate

PASS is forbidden unless:
- verification token was obtained;
- proof was actually visible publicly (FILE or DNS);
- Google ownership verification succeeded;
- Search Console property is not siteUnverifiedUser;
- sitemap submission succeeded.

URL Inspection may be PARTIAL immediately after first enrollment because Google can require time before crawl/index state exists. That must never turn the enrollment into a fake PASS.

## Security

Never commit OAuth tokens, registrar keys or GitHub tokens. Keep them only in Railway/Vercel/host secret storage. API responses are not allowed to log secret values.
