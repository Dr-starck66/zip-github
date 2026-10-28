# ASTRA BULKER Ω — moteur SEO en lots v0.1

Extension **sans dépendance externe** de `Dr-starck66/zip-github`, qui réutilise **exactement** le garde existant `astra-bricks/content-quality-guard/quality.mjs` lors de `build`.

## Contrat

- `plan` : construit des briefs interconnectés, des URLs canoniques prévisionnelles et les consignes de rédaction pour chaque sujet, sans générer de faux articles. Collisions avec `existingPaths` interdites.
- `build` : reçoit des articles JSON complets, impose revue humaine déclarée, qualité globale réelle via `auditCorpus(...,{enforce:'all'})`, citations, intégrité des images et génère des HTML statiques échappés avec JSON-LD, canonical, maillage et reçus SHA-256.
- **Jamais de publication automatique** par ce module ; `BUILT_NOT_DEPLOYED` ne vaut ni HTTP 200, ni sitemap, ni indexation. Un adaptateur CMS par site doit être raccordé puis testé séparément. Pas de secret, pas de nouvelle tâche planifiée ni de service payant.
- Pas d'article de 1500 mots inventé pour atteindre un quota. Le moteur vérifie les **données fournies** ; il ne crée pas de contenu factuel sans générateur/source et relecture. Les volumes SEO, classement et véracité externe ne sont pas prouvés par le code.
- Une génération IA existante peut produire les JSON via les prompts ; ne pas injecter de faux `review.approved=true` ou de références non vérifiées.

## Lancer

```bash
node astra-bulker/bulker.mjs plan astra-bulker/fixtures/avocat-belgique.json /tmp/astra-bulker-plan
node --test astra-bulker/test.mjs
# après rédaction ET contrôle des articles :
node astra-bulker/bulker.mjs build articles-reviewes.json /tmp/astra-bulker-build
```

Format `articles-reviewes.json` : `{ "manifest": <même manifeste>, "pages": [ { "path": "/guides/.../", "title": "...", "description": "...", "type": "article", "language": "fr", "sections": [{"heading":"...","paragraphs":["..."]}], "sources":[{"title":"...","url":"https://..."}], "evidence":[{"claim":"phrase exacte du paragraphe","sourceUrl":"https://...","sourceLocator":"section X"}], "review":{"approved":true,"reviewer":"...","date":"AAAA-MM-JJ","factualSpotcheck":true}, "image":{"url":"https://...","alt":"...","license":"..."} } ] }`.

## Mise en production (non encore réalisée)

Intégrer à ASTRA CRAWL Ω pour vérifier les sources ; connecter le générateur ASTRA/Qwen existant une fois **son appel et son quota prouvés** ; utiliser les hooks CMS authentifiés de chaque site, un gate immuable et produire un reçu par URL. Réutiliser l'orchestrateur ASTRA existant au lieu de créer un nouveau cron. Sources : `astra-global/content-fleet-rollout.json`, `AGENTS.md`, `Dr-starck66/indexation/config/astra-consignes.json`.
