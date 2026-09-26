# Mythos Astra Ω — Sales Brief

## One-liner
Une couche de fiabilité indépendante qui transforme les réponses d'IA en objets auditables et refuse les faux PASS lorsque la preuve, le contre-test ou la reproductibilité sont insuffisants.

## Problème
Les équipes qui automatisent avec des LLM peuvent recevoir une sortie convaincante mais non vérifiée : déploiement annoncé sans URL, test déclaré sans log, conclusion scientifique sans source, tâche "terminée" sans preuve indépendante.

## Démo de 3 minutes
1. Charger le cas "faux déploiement" sans preuve.
2. Montrer le verdict FAIL et les blockers.
3. Charger le cas robuste avec HTTP 200, test, Red Team et second run.
4. Montrer PASS, Evidence Graph et fingerprint SHA-256.
5. Exécuter le benchmark 8/8.
6. Exporter le rapport JSON/Markdown.

## Acheteurs potentiels
- équipes agentic AI ;
- agences d'automatisation ;
- SaaS B2B avec copilotes ;
- équipes QA / DevOps ;
- audit et conformité ;
- laboratoires utilisant des agents pour produire des claims.

## Offre de départ
- diagnostic / atelier : 1 500–2 500 € ;
- pilote équipe : 5 000–10 000 € ;
- licence annuelle cible après industrialisation : 9 900 €+ ;
- licence/cession d'actif : prix négocié selon IP, code, transfert, exclusivité et support.

Ces montants sont des hypothèses commerciales et ne constituent ni revenu existant ni garantie de vente.

## Questions d'acheteur et réponses
**Pourquoi pas un prompt ?** Le moteur produit un schéma versionné, un Evidence Graph, des gates indépendants, un benchmark et un artefact signé par hash.

**Est-ce que cela vérifie la vérité ?** La V2 vérifie la discipline de preuve. La vérification factuelle automatique est une brique serveur de la roadmap.

**Dépendance à OpenAI/Anthropic ?** Le cœur V2 est fournisseur-agnostique et fonctionne sans API payante.

**Données sensibles ?** La V2 publique est local-first. Le futur Enterprise devra ajouter isolation tenant, chiffrement, SSO et rétention configurable.

## Preuve disponible
- moteur v2.0.0 ;
- code séparé UI/moteur ;
- benchmark 8 cas ;
- self-test exécutable ;
- workflow CI ajouté ;
- documentation produit, sécurité et diligence.
