# Mythos Astra Ω — Evidence-First AI Reliability

## Produit
Mythos Astra Ω est une couche de contrôle destinée à réduire les faux PASS des systèmes d'IA et des agents. La V2 transforme une sortie IA en assertions, preuves, liens de support, contrôles adversariaux et verdict PASS / PARTIAL / FAIL.

## Capacités réellement implémentées
- moteur local versionné 2.0.0 ;
- extraction heuristique des claims ;
- parsing des preuves ;
- Evidence Graph claim ↔ evidence ;
- six passes pondérées : Objective Gate, Evidence Gate, Red Team, False-Pass Hunter, Reproducibility, Source Integrity ;
- hard-fail lorsque la preuve ou le False-Pass Gate tombe sous un seuil critique ;
- empreinte SHA-256 de chaque rapport via Web Crypto ;
- export JSON et Markdown ;
- partage d'un audit par fragment d'URL ;
- historique local ;
- benchmark de régression embarqué.

## Limites
Le moteur V2 est heuristique. Il évalue la structure de preuve et la discipline de validation. Il ne remplace pas une vérification factuelle spécialisée, un moteur de recherche, un exécuteur CI ou un expert métier.

## Architecture
- `index.html` : produit et interface ;
- `styles.css` : design system ;
- `engine.js` : moteur d'audit pur ;
- `app.js` : présentation, historique, graph, benchmark, exports ;
- `openapi.json` : contrat cible pour une future API serveur ;
- `INVESTOR_DOSSIER.md` : dossier de diligence et stratégie de valorisation.

## Schéma de rapport
`mythos-astra-omega/audit@2`

Champs principaux : `id`, `createdAt`, `claims`, `evidence`, `graph`, `passes`, `score`, `verdict`, `blockers`, `recommendations`, `fingerprint`.

## Défendabilité à construire
La valeur ne doit pas reposer sur le prompt. La roadmap vise :
1. corpus propriétaire de faux PASS réels ;
2. benchmarks par métier ;
3. policies organisationnelles ;
4. connecteurs CI/CD et agent frameworks ;
5. audit ledger serveur ;
6. modèles de calibration entraînés sur décisions humaines ;
7. API / SDK ;
8. certification de processus fondée sur preuves.

## Positionnement
Catégorie visée : AI reliability / evidence control plane. Cible : équipes qui déploient des agents ou utilisent des LLM pour des décisions techniques, conformité, QA ou opérations.

## Privacy
La V2 publique est local-first : le texte collé reste dans le navigateur. Aucune API payante n'est nécessaire pour exécuter le moteur local.
