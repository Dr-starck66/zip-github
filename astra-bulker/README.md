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

## Extension v0.2 — modèle ASTRA existant -> adaptateurs natifs (sans nouveau cron)

Le nouvel adaptateur `generator.mjs` réutilise **exclusivement** l'endpoint local OpenAI-compatible déjà employé par le générateur BetGPT : `ASTRA_LOCAL_CHAT_BASE` (ou `RAILWAY_SERVICE_BETGPT_CHAT_MODEL_URL`), `ASTRA_LOCAL_CHAT_TOKEN` et `FORUM_LOCAL_LLM_MODELS`. Il ne bascule pas sur un service commercial. Il reçoit des extraits **déjà recherchés et effectivement vérifiés** par ASTRA CRAWL, avec URL, localisation précise, date et provenance. Six appels bornés produisent six sections JSON, cinq preuves minimales et le brouillon **`review.approved=false`**. Pas de requête modèle si les trois sources HTTPS indépendantes manquent. Une déclaration de vérification dans l'entrée n'est pas une preuve indépendante.

`native-handoff.mjs` réutilise `build()` et donc le **vrai** `astra-bricks/content-quality-guard/quality.mjs`, puis exporte un fichier JSON par article compatible avec `Dr-starck66/indexation/tools/astra-zero-rich/native-run.mjs --input=...`. Le routage exige la **correspondance exacte** du registre `native-routes.json` (repo, branche, format, langue et statut d'adaptateur). Périmètre source existant : `gamicnews.com`, `betgpt.live`, `freehotels.info`, `bizarresexuality.com`. Les autres sites (dont avocat-belgique.com, else.wine et whattodoin.club) restent `NATIVE_ADAPTER_NOT_REGISTERED`, sans tentative de publication fictive. Les préfixes imbriqués comme `/news/en/` sont conservés.

### Exécution contrôlée

1. Les générateurs / ASTRA CRAWL transmettent des données réelles `brief`, `research` à `draftWithExistingModel(brief,research)` (voir `generator.mjs`). Son résultat n'est jamais publiable sans vérification humaine, sources réelles, image licenciée et `answer`, `introParagraphs`, `publishedAt` éditoriaux.
2. Préparer `reviewed-input.json` : `{ "manifest": {...}, "pages": [...] }`, avec chemins/slug des routes natifs, sources, cinq preuves présentes dans le texte, image `src` locale et `url` HTTPS sur le domaine du site, `review.approved=true` après vérification réelle.
3. `node astra-bulker/native-handoff.mjs reviewed-input.json chemin/vers/indexation/tools/astra-zero-rich/native-routes.json /data/astra-bulker/handoff` ; `receipt` = `ADAPTER_INPUT_READY_NOT_PUBLISHED`. L'output est immutable par défaut (`wx`).
4. Sur le système existant `indexation` et **dans la tâche éditoriale ASTRA existante seulement** : `node tools/astra-zero-rich/native-run.mjs --input=/data/astra-bulker/handoff/slug.json` pour vérification supplémentaire ; `--execute` uniquement si jeton autorisé, métriques vérifiées, photo réellement présente, autorisation expresse `ASTRA_ZERO_RICH_NATIVE_PUBLISH_APPROVED=true` et journal de réservation persistant. BetGPT reste bloqué par son contrôle obligatoire de **promotion GREEN immuable**. Publication réelle = URL et contenu HTTP 200, canonical, image et sitemap vérifiés après déploiement.

`node --test astra-bulker/test.mjs astra-bulker/bridge.test.mjs` effectue les tests négatifs. Les essais locaux peuvent employer une substitution de garde ; le statut **PASS qualité réelle** n'est attribué qu'avec le module du dépôt GitHub et ses tests CI, pas avec une substitution. Aucune génération longue réelle, connexion de modèle Railway, écriture de CMS, tâche programmée, coût supplémentaire ou indexation ne résulte du code source seul.
