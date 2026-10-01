# ASTRA MEMORY FAILOVER Ω

Résilience de mémoire indépendante d'un seul outil ou d'une seule conversation.

## But

Empêcher qu'une indisponibilité temporaire de la mémoire native bloque la continuité des règles, décisions et protocoles de Dr Starck.

## Principe

La brique ne prétend pas pouvoir forcer l'activation d'une fonctionnalité ChatGPT indisponible. Elle supprime cette dépendance en utilisant plusieurs couches persistantes vérifiables.

Ordre de lecture:
1. mémoire native/personnalisation si accessible;
2. registre persistant ChatGPT Library;
3. miroir GitHub canonique;
4. historique/contexte courant seulement comme source auxiliaire.

Ordre d'écriture:
1. tenter la mémoire native si disponible;
2. écrire le registre Library;
3. écrire le miroir GitHub;
4. relire au moins une couche durable indépendante avant PASS.

## États

- PASS: écriture durable prouvée et relecture réussie.
- PARTIAL: une couche durable a réussi mais la redondance prévue n'est pas complète.
- FAIL: aucune couche durable n'a pu être écrite.
- UNVERIFIED: une écriture a été demandée mais n'a pas été relue.

## Anti faux-PASS

Une phrase comme "c'est mémorisé" est interdite tant qu'une preuve de persistance n'existe pas.
Une indisponibilité de l'outil mémoire natif doit déclencher automatiquement le fallback au registre durable, pas interrompre le travail.

## Clé de bootstrap

Nom canonique: ASTRA MEMORY FAILOVER Ω
Registre canonique: astra-memory-failover/registry.json
Version: 1
