# ASTRA NEWS RADAR — Search Console Evidence Layer

## Evidence policy

ASTRA is fail-closed.

- `CONFIRMED NEWS`: observed in a public Google News RSS surface.
- `NEWS + TREND SIGNAL`: Google News topic correlated with a public Google Trends signal.
- `DISCOVER SIGNAL`: heuristic only. It never means the article was shown in Discover.
- `CONFIRMED DISCOVER`: reserved for our own URLs when verified Search Console Discover impressions are greater than zero.
- `LEARNED FROM CONFIRMED DISCOVER`: a new opportunity resembles one or more of our historically confirmed Discover pages. This is a prior, not proof that the new topic is or will be in Discover.

## Data contract

The dashboard reads `/evidence/search-console.json`.

Each site record can contain:

```json
{
  "domain": "example.com",
  "property": "sc-domain:example.com",
  "status": "connected",
  "window": {"start":"2026-09-01","end":"2026-09-26"},
  "discover": {"clicks":120,"impressions":42000,"ctr":0.002857},
  "pages": [
    {
      "url": "https://example.com/article/",
      "title": "Article title",
      "clicks": 30,
      "impressions": 8000,
      "ctr": 0.00375,
      "queries": ["optional topical terms"]
    }
  ]
}
```

A page is admissible as confirmed evidence only if `impressions > 0`. Missing, stale, invalid or unverified data must not create a confirmation badge.

## Scoring use

Historical Discover evidence may influence opportunity ranking only as a bounded prior. It cannot override poor topical fit, low freshness, or a missing News/Trend signal.

The radar should learn which topic families work for each domain while preserving editorial originality and source verification.
