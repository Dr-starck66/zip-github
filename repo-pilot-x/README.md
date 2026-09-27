# RepoPilot X

Créateur automatique de repositories GitHub.

## Fonctionnement
- création unitaire ou par lot (jusqu'à 20)
- public/privé
- README automatique
- modèles .gitignore
- licences GitHub
- backend serveur : le jeton GitHub n'est jamais envoyé au navigateur
- endpoint de santé GitHub

## Variable serveur requise
`GITHUB_TOKEN`

D'après la documentation GitHub actuelle, un fine-grained PAT peut créer des dépôts avec la permission **Repository creation: write** ou **Administration: write**. Un token classic doit avoir `public_repo` pour un dépôt public, ou `repo` pour un dépôt privé.

## Lancement
`npm start`

Le serveur écoute `PORT` (Railway le fournit automatiquement) ou 3000.
