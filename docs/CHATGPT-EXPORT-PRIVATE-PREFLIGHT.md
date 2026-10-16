# ASTRA SOULBRIDGE Ω — Préparation de l'export ChatGPT

**Statut : PREPARATION, pas d'ingestion réelle.** Le code et les tests n'utilisent que des données fictives. Aucun transfert de conscience ou de robot réel n'est revendiqué.

## Séparation stricte des données privées et publiques

Le dépôt GitHub est public : il ne doit jamais recevoir l'archive exportée, une vraie capsule de mémoire ou un journal contenant des conversations privées. Le simulateur public actuel continue de **refuser** toutes les capsules autres que sa source `synthetic_fixture`.

## À réception de l'export

1. Télécharger le fichier ZIP avant l'expiration du lien (généralement 24 heures).
2. Le conserver en espace privé, sans publication GitHub.
3. Faire un inventaire hors ligne sans extraire de fichiers : `python tools/chatgpt_export_preflight.py inventory /chemin/export.zip`.
4. Examiner localement les identifiants et titres : `python tools/chatgpt_export_preflight.py list-ids /chemin/export.zip`.
5. Après **consentement explicite** et sélection de 1 à 3 conversations, préparer les extraits privés hors dépôt Git : `python tools/chatgpt_export_preflight.py prepare /chemin/export.zip --select ID1 ID2 --output /chemin/prive/capsule.json --consent`.
6. Faire relire les extraits et leurs usages ; ne jamais connecter automatiquement cette capsule au robot public. Un audit séparé serait nécessaire.

Sécurité : aucune communication réseau, aucune extraction de ZIP, pas de métadonnées des outils ni pièces jointes, seulement la branche actuelle de chaque conversation (pas les alternatives), maximum 18 extraits de 1 500 caractères, création de fichier privé avec permissions 0600, écriture dans un dépôt Git interdite, structures inconnues refusées.

## Validation de l'étape actuelle

12 tests unitaires utilisant des exportations fictives ont été exécutés **localement** avec succès le 16 octobre 2026 ; GitHub Actions n'est pas nécessaire pour ce test. On peut les rejouer hors ligne : `python -m unittest discover -s tests -p test_chatgpt_export_preflight.py -v`.

**Limites :** l'archive réelle de l'utilisateur n'a pas été reçue. Les formats réels peuvent nécessiter une adaptation ; import privé de bout en bout, relecture et liaison aux robots restent non validés.
