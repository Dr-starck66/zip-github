# Photovoltaic Bulgaria — Енергия за дома

Bulgarian editorial site for solar, home batteries, heat pumps, renovation, subsidies and energy bills.

## Local verification

```bash
npm run build
npm run check
```

Output is generated in `dist/`.

## Editorial architecture — no external AI API

This project deliberately contains **no Gemini, OpenAI or other text-generation API dependency**.

The editorial system is split into two layers:

1. **Source scout (server/GitHub Actions)** — runs five times per day, reads configured Bulgarian/EU sources and refreshes `data/queue/latest.json`. It never writes an article and never publishes filler.
2. **ChatGPT editorial pass** — researches the queued/current topic, verifies sources, writes the Bulgarian article, checks duplication and editorial quality, and supplies a structured article JSON.
3. **Fail-closed importer** — `npm run import -- path/to/article.json` validates title, description, category, article length, source URLs, duplicate title/slug and then appends the article to `data/articles.json`.
4. **Build verification** — every content change rebuilds the static site and runs the technical checks before deployment.

This keeps the site free of paid AI API keys while preserving automated source monitoring and deterministic publishing checks.

## Article JSON shape

```json
{
  "title": "...",
  "description": "...",
  "category": "solar",
  "kind": "news",
  "image": "solar-roof",
  "sources": [
    {"label": "Official source", "url": "https://..."}
  ],
  "body": ["Paragraph 1...", "Paragraph 2..."]
}
```

Allowed categories: `solar`, `heat-pumps`, `renovation`, `support`, `bills`.

## Production steps

- Register `photovoltaicbulgaria.com`.
- Connect the repository to the hosting project.
- Point the domain to the deployment after registration.
- Keep the source scout scheduled five times per day.
- Use ChatGPT for the editorial-generation/verification stage; no AI API key is required in the repository.
- Configure AdSense only after the site has sufficient real content/traffic and consent tooling is ready.

## Google Search / Discover readiness

- static HTML
- `max-image-preview:large`
- 1200px+ source imagery where available
- `NewsArticle` JSON-LD
- author/editorial-methodology page
- corrections policy
- XML sitemap + Google News sitemap
- RSS
- canonical URLs
- robots.txt
- fail-closed article importer
- no server-side AI generation
