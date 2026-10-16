# ASTRA SOULBRIDGE Ω — vérification ROS 2 réelle (16 octobre 2026)

## Résultat observé

**Statut final : BLOCKED / ROS2_RUNTIME_UNVERIFIED. Ne pas afficher PASS.**

### 1. Exécution locale
Le conteneur d'exécution accessible à ChatGPT est Debian 13 avec Python 3.13. Il ne possède ni commande `ros2`, ni `rclpy`, ni `std_msgs`, ni moteur Docker ou Podman. Les téléchargements directs via `curl` sont bloqués au niveau DNS.

**Conclusion :** aucun middleware ROS 2 natif ne peut actuellement y exécuter le banc DDS.

### 2. Tentative cloud gratuite
Un service Render explicitement demandé en plan `free` a été proposé :
- Nom : `soulbridge-ros2-proof-omega`
- Dépôt source : `Dr-starck66/zip-github`, branche `soulbridge-ros2-real-probe-20261016`
- Dockerfile : `ros2_probe/Dockerfile` (image officielle `ros:jazzy-ros-base`)
- Paramètres : `ROS_DOMAIN_ID=42`, `ROS_AUTOMATIC_DISCOVERY_RANGE=LOCALHOST`
- Région : Frankfurt, `autoDeploy=no`

**Réponse réelle de Render : HTTP 402 — « Payment information is required to complete this request ».**

Aucun service Render n'a été créé et aucune carte bancaire n'a été ajoutée. **Aucun coût déclenché.** Aucune clé/API privée n'a été fournie. Conformément au souhait de zéro coût, aucun plan payant n'a été tenté.

### 3. Ce qui est réellement prêt
- Programme de test dans `ros2_probe/real_dds_probe.py` : deux adaptateurs ROS 2 textuels, troisième nœud observateur, topics DDS, deux questions (connue/inconnue), refus de message invalide, empreintes identiques, exclusion des topics moteurs.
- Conteneur ROS 2 Jazzy officiel `ros2_probe/Dockerfile`.
- Rapport HTTP en lecture seule `ros2_probe/server.py` qui répond 200 à `/healthz` **uniquement** si le test ROS 2 est réellement réussi ; sinon 503, `/report` donne les détails.
- La seule mémoire autorisée est `data/synthetic_capsule.json` ; l'historique privé ChatGPT reste non importé.

### 4. Condition du PASS vérifiable
Un environnement avec Docker et accès réseau pour récupérer `ros:jazzy-ros-base` doit lancer le conteneur, puis produire un JSON `REAL_ROS2_DDS_LOOPBACK_PASS` et des logs attestant deux véritables communications ROS 2 rclpy/DDS sans mock. **Aucun rapport de ce type n'existe au 16 octobre 2026.**

**ATTENTION :** deux profils logiciels nommés « Robotis » et « SoftBank » ne constituent pas deux véritables SDK robot, ni deux robots physiques.
