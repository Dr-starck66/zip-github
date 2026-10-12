# ASTRA HYPER-RELEVANT IMAGE ENGINE Ω

**Reusable zero-license-fee library for all Node/Railway sites.** Images must be relevant to the actual page and genuinely reusable with verifiable license evidence. No generic placeholders qualify as PASS.

## Contract

Use `assessImage({path,title}, asset)` with approved per-route image manifests. The result is `PASS`, `PARTIAL` or `FAIL`; the 85-point score is an internal QA threshold, **not** a metric set by Google. Exact match and rights proof are mandatory. The engine deliberately does not judge semantics from a filename alone.

Only original images with named author and an approval proof, or individually verified Wikimedia Commons files under acceptable licenses, are eligible. Attribution, license URL and ShareAlike obligations must be respected. **CC BY-SA is not equivalent to CC0**; check separate trademark/personality rights and local freedom-of-panorama law. A Commons file is not a warranty of ownership. Commercial Google Images results must not be republished without rights. <https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia>

## SEO & Discover

Short, descriptive file name `<subject>-<place>-<context>.webp`, true-to-image descriptive `alt`, visible photo credit and caption, width >=1200px and >300k pixels, WebP/AVIF preferential, correct MIME, `width/height`, appropriate lazy/eager, `og:image`, `ImageObject`, actual local bytes and HTTP 200. These conform to Google Search Central guidance; no file name guarantees rankings. <https://developers.google.com/search/docs/appearance/google-images>

## Rollout safety

Use `auditManifest(pages,manifest,{blockNewPagesOnly:true})`. Do not mass-noindex an existing site simply because its old images fail quality checks: this would sacrifice existing SEO. Gate **new** pages, flag existing ones for staged repair with asset-by-asset audit and real HTTP probes. Never auto-declare editorial verification on a source selected only by search relevance. An illustration must be labeled, and a contemporary photograph may not be passed off as a photo of a historic event.

## Sample manifest record (illustrative only, NOT a license claim)

```json
{
  "path": "/images/santiago-monumento-heroes-restauracion.webp",
  "width": 1600,
  "height": 900,
  "bytes": 130000,
  "mime": "image/webp",
  "alt": "Vista contemporánea del monumento a los Héroes de la Restauración en Santiago",
  "caption": "Imagen actual; no representa la protesta de 2018.",
  "source": {
    "type": "commons",
    "filePage": "https://commons.wikimedia.org/wiki/File:EXAMPLE.jpg",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
    "licenseEvidenceUrl": "https://commons.wikimedia.org/wiki/File:EXAMPLE.jpg",
    "checkedAt": "2026-10-12",
    "author": "Photographer",
    "derivativeLicense": "CC BY-SA 4.0"
  },
  "editorial": {
    "reviewed": true,
    "exactSubjectMatch": true,
    "placeMatch": true,
    "nonStockGeneric": true,
    "isModernPhoto": true,
    "depictsHistoricalEvent": false,
    "modernContextDeclared": true
  }
}
```

This is a *schema example only*. The placeholder Commons page above must **never** be used as a source.

## Creative brief for original illustration

Render the exact geographic subject and article angle with realistic local context, 1600x900 landscape composition, contemporary documentary aesthetic and strong focal point. No made-up historical photographic evidence, no generic office stock photo, no watermark, no invented logos, and no fabricated attribution. Caption must state 'illustración editorial' whenever applicable. An original generated image is not PASS until its origin/rights provenance is recorded and the editorial subject is reviewed.

## Pilot and integration

Import `assessImage`, `renderFigure`, `imageMeta`, `imageObject`, `auditManifest` into each Node site. An adapter for WordPress/Webflow maps to the same manifest. `node --test` or `node test.mjs` validates core QA but **does not prove an actual image exists on a website**; a separate deployment HTTP probe must validate each binary.
