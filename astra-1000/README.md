# ASTRA-1000 v0

Prototype d'architecture cognitive distribuée inspirée d'une IA issue d'une civilisation ayant 1000 ans d'avance, mais construite avec des composants réalisables aujourd'hui.

## Principes

- plusieurs agents spécialisés plutôt qu'un modèle unique
- cycle : Observer → Hypothèses → Critique → Évidence → Arbitrage → Mémoire
- statuts épistémiques stricts : OBSERVED, SUPPORTED, EXPERIMENTAL, SPECULATIVE, FALSIFIED
- aucune hypothèse spéculative n'est présentée comme un fait
- mémoire cumulative des campagnes exécutées
- API exploitable par une future couche LLM / outils scientifiques

## Endpoints

- GET /api/health
- GET /api/architecture
- GET /api/memory
- POST /api/run { "question": "..." }

## Lancement

npm start
