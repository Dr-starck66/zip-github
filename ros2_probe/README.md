# ASTRA SOULBRIDGE Ω — Proof gate: ROS 2 réellement exécuté

**Statut initial : UNVERIFIED** jusqu'à une preuve d'exécution d'un conteneur basé sur ROS Jazzy, incluant des messages réels via DDS.

## Objectif

Dans une seule instance isolée avec `ROS_AUTOMATIC_DISCOVERY_RANGE=LOCALHOST` et `ROS_DOMAIN_ID=42`, lancer **deux véritables nœuds rclpy ROS 2**, respectivement étiquetés Robotis OP2 et SoftBank NAO. Ces étiquettes **ne sont pas des SDK constructeurs**. Chaque nœud reçoit un `std_msgs/msg/String` sur un topic propre, interroge la même mémoire synthétique, puis renvoie sa réponse en DDS. Un troisième nœud observateur indépendant publie deux défis, récupère quatre réponses réelles et vérifie les empreintes SHA-256, le refus de mémoire inconnue et le rejet d'un message trop long.

**Interdictions :** données personnelles ChatGPT, pilotage moteur, `cmd_vel`, données vocales, appels externes, scripts de robot constructeur, coûts API.

## Conteneur isolé

Construire à la racine du dépôt : `docker build -f ros2_probe/Dockerfile -t soulbridge-real-ros2 .` puis `docker run --rm -p 127.0.0.1:10000:10000 soulbridge-real-ros2`. Le point d'accès `GET /report` donne le statut précis. `GET /healthz` renvoie 200 **uniquement** après un PASS réel ; sinon 503. Le serveur refuse POST et ne reçoit aucun contenu personnel.

Un déploiement facultatif sur Render **plan free uniquement** peut utiliser la branche `soulbridge-ros2-real-probe-20261016` et le fichier `ros2_probe/Dockerfile`. Le service HTTP n'expose que la preuve synthétique. Le conteneur ne demande pas d'accès réseau DDS à l'extérieur et ne reçoit aucune clé.

## Critères de PASS

- Modules natifs `rclpy`, `std_msgs` importés depuis ROS 2 Jazzy installé.
- Trois vrais nœuds rclpy dans un processus et **vrai middleware DDS**, sans mock ni émulateur.
- 4 messages de réponse reçus via DDS (deux essais par endpoint), réponses exactes appuyées sur capsule fictive.
- Deux étiquettes de constructeur mais **zéro compatibilité d'équipement réel revendiquée**.
- Souvenir absent refusé ; question malformée bloquée ; aucun topic moteur.
- Rapport horodaté `REAL_ROS2_DDS_LOOPBACK_PASS` uniquement si toutes ces conditions sont effectivement vérifiées.

Si ce service échoue à démarrer, ou si ROS 2 ne fonctionne pas, l'état doit rester **FAIL / UNVERIFIED**. Ne jamais assimiler un succès de build Docker au PASS d'un échange DDS réel.

## Sécurité

Une configuration localhost DDS ne remplace pas DDS-Security ; pour les appareils physiques, sécuriser le réseau et obtenir l'accord du propriétaire du robot. Un futur banc multi-machine nécessitera un protocole différent. Le rapport public ne contient que des tests sur une capsule fictive.
