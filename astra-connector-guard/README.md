# ASTRA CONNECTOR GUARD Ω

Couche de résilience fail-closed pour Railway et les autres connecteurs cloud.

## Contrat
1. Vérifier l'identité réelle.
2. Vérifier l'accès au projet/ressource cible.
3. Exécuter l'action.
4. Re-lire l'état final pour prouver le succès.
5. En cas de panne transitoire: retry borné.
6. En cas de session expirée: essayer une autre voie cloud déjà autorisée.
7. Conserver le contexte connu pour reprendre au bon endroit.
8. Ne jamais déclarer PASS sans vérification indépendante.

## États
- PASS : identité + scope + action + vérification finale prouvés.
- PARTIAL : action potentiellement partie mais non prouvée; pas de replay dangereux.
- FAIL : aucune voie autorisée n'a réussi.
- UNVERIFIED : état explicitement non prouvé.

## Railway
Avant toute action critique: `whoami` -> lecture projet/service -> action -> relecture status/config/domain/deployment.
Une panne d'authentification ou réseau ne doit jamais provoquer la création d'un service v2/v3/v4.

## Limite réelle
Aucune brique ne peut empêcher Railway/OAuth de révoquer une session. Le but est d'empêcher que cette révocation casse silencieusement le workflow: détection, fallback, reprise et fail-closed.
