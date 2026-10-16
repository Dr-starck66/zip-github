# ASTRA SOULBRIDGE Ω — Note technique exploratoire
**Version 0.1 — 16 octobre 2026 | Perpignan, France | Collaboration de recherche, sans engagement financier**

## Hypothèse
Une capsule de contexte conversationnel exportable, structurée et consentie peut permettre à un assistant logiciel de retrouver certaines informations d'un utilisateur entre deux plateformes robotiques hétérogènes, tout en distinguant clairement les souvenirs attestés des informations absentes. Ce travail ne constitue **ni transfert de conscience ni reproduction d'une identité subjective**.

## État expérimental vérifié
- Capsule fictive (aucune conversation privée) avec empreinte SHA-256 et contrôle d'intégrité.
- Simulation physique PyBullet avec deux représentations humanoïdes, **URDF et MJCF**, et contrôle croisé de l'empreinte de capsule : exécution réussie, https://github.com/Dr-starck66/zip-github/actions/runs/38734540001
- IA générative réelle Qwen 2.5 1.5B via Ollama local : 4 tours de dialogue par corps simulé, 8 réponses au total, contrôles heuristiques 8/8 **après** garde-fous, dont 2 corrections explicites lorsque le souvenir demandé était absent : https://github.com/Dr-starck66/zip-github/actions/runs/38736458434
- Ces deux corps virtuels fonctionnent dans **le même moteur PyBullet**. Il ne s'agit pas d'un test entre fabricants de robots, ni de transfert d'un historique privé ChatGPT.
- Webots Robotis OP2 / NAO : **non validé**, essais échoués (dont code de sortie 137) : https://github.com/Dr-starck66/zip-github/actions/runs/38732624605

## Proposition de protocole conjoint
1. Définir une interface d'accès à la mémoire, séparée des commandes motrices et compatible avec un pont ROS 2 **à étudier**.
2. Utiliser d'abord une capsule synthétique auditée contenant des faits connus, inconnus, contradictions volontaires et informations révoquées.
3. Effectuer des essais sur deux simulateurs/plates-formes distincts avec questions tirées au sort par un évaluateur externe, pas seulement des scénarios prédéfinis.
4. Mesurer : intégrité cryptographique, réponses soutenues par les sources, refus de faits absents, fuites de données, latence et comportement face aux injections d'instructions dans l'historique.
5. Produire deux journaux horodatés indépendants et reproductibles, incluant versions logicielles, identifiants de plateforme et hachages de preuves.
6. Envisager **seulement ensuite** des essais supervisés sur robot physique, sans accès initial aux actionneurs.

## Critères de réussite minimaux
**PASS logiciel** : deux exécutions indépendantes authentifiées, capsule identique par SHA-256, provenance vérifiée, questions indépendantes, seuils de fiabilité pré-enregistrés, aucune donnée privée publiée. Un test ne peut pas prendre le label "robot réel" sur la seule base d'une simulation.

**PASS sur matériel physique** : deux plateformes robotiques réelles et différentes, protocole de sécurité validé par l'équipe d'accueil, essais documentés ; aucune action dangereuse et aucune information privée utilisée sans consentement explicite.

## Questions au laboratoire
- Quelle plateforme/simulation humanoïde et quelle API de dialogue seraient pertinentes pour un premier benchmark ?
- Comment isoler l'interface mémoire d'un éventuel contrôleur moteur (ROS 2, sandbox, autorisations) ?
- Quel protocole d'évaluation rendrait les résultats convaincants pour la recherche et non seulement pour une démonstration commerciale ?
- Quel membre de l'équipe accepterait un échange exploratoire de 15–20 minutes ?

## Vie privée / économie
Le véritable export ChatGPT de l'utilisateur est **en attente** : aucune ingestion réelle, aucun transfert à un tiers ni publication GitHub. Une interface préparatoire locale exige une sélection et un consentement explicites. Aucun matériel, prestation payante ou abonnement supplémentaire n'est demandé.
