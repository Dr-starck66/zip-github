# ASTRA CONTENT QUALITY GUARD Ω

Permanent policy: no article or local guide is published merely to reach a word count. Every section must help the reader with specific, source-grounded, non-repeated information.

Forbidden in editorial articles: SEO reconstruction passages, keyword-density discussion, self-promotional editorial methodology, interchangeable H2 sections, repeated paragraph templates between cities, keyword stuffing, uncited numerical promises and vague how-to-use-this-page boilerplate.

## Publication contract

New/edited guide or article requires 1500+ words of *real paragraph text* (not headings), at least six useful sections, three distinct HTTPS sources, five distinct in-text factual claims with matching source URLs and source locators, language check (ES/FR/EN) and a named human or accountable editorial review record.

Required inventory: `config/astra-content-pages.json` with `{ "pages": [...] }`; each page declares path, title, type, language, sections, sources, evidence and review. Required route register: `config/astra-content-routes.json` with `{ "routes": [...] }`. New or edited entries set changed=true. `npm run guard:content` blocks publishing on any bad changed/new entry. `ASTRA_CONTENT_ENFORCE_ALL=1` audits/rejects all pages.

Existing unmodified legacy content is audited and reported as PARTIAL; do not mass-noindex, delete or automatically rewrite thousands of old pages. Changed/new pages fail closed; publishing adapters must populate both route and content inventories honestly.

## Evidence limits

Deterministic rules only detect *observable* failure modes. A content author can falsely fill evidence or approval fields; no program can guarantee literary quality, originality across the entire Internet, legal compliance, Google ranking or factual truth without independent editorial/source review. Editors should verify each linked claim on a real source, with dates and scope. A URL and a claim locator are traceability fields, not proof of accuracy. Automated quality score is not a Google metric.

## Past, present, future rollout

Add this brick to ASTRA Node-site creation profiles and install the injector in each legacy compatible site. WordPress, Webflow, System.io, static GitHub Pages and other platforms require their own publishing hooks or audits. Never claim global protection until each service has actual successful prepublication CI and production probes.

Evidence gate: negative tests for the exact Constanza boilerplate, repeated city titles and paragraphs, false citations, missing review, off-topic/short text; positive test for a distinctive evidenced guide; injector and release-gate CI must PASS; compare the real public website after deployment.
