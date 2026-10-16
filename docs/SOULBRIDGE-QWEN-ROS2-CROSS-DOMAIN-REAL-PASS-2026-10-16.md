# ASTRA SOULBRIDGE Ω — Réelle IA Qwen reliée à ROS 2 (16 octobre 2026)

## Résultat : **PASS technique**, deux environnements ROS 2 isolés logiquement

**Preuve publique, synthétique, reproductible :** [JSON de deux exécutions réelles](./evidence/SOULBRIDGE-QWEN-ROS2-TWO-DOMAINS-REAL-PASS-2026-10-16.json).

Deux exécutions successives ont réussi le 16 octobre 2026 à **14:30:44** et **14:31:16 UTC**, avec **quatre réponses authentiquement générées** par Qwen à chaque exécution.

La preuve est plus forte qu'un simple rappel du même fichier partagé : le premier interlocuteur a appris dans sa conversation un **code synthétique tiré au sort à l'exécution, absent de la capsule initiale**, puis le second l'a rappelé via l'historique explicitement transmis, avant de retrouver aussi un souvenir initial. Deux codes différents ont été validés : `AZUR-370` et `AZUR-437`.

## Architecture concrète

- ROS 2 : **Jazzy**, bibliothèque `rclpy`, middleware DDS réel, Ubuntu Noble ARM64 depuis la rootfs OCI officielle `ros:jazzy-ros-base`.
- Robot virtuel **A / Robotis OP2 (profil logiciel)** : son propre processus OS, son espace ROS 2 `ROS_DOMAIN_ID=42`, topics `/soulbridge/robotis_op2/{operator_text,assistant_text}`.
- Robot virtuel **B / SoftBank NAO (profil logiciel)** : autre processus OS, espace ROS 2 `ROS_DOMAIN_ID=43`, topics `/soulbridge/softbank_nao/{operator_text,assistant_text}`.
- Superviseur de transfert : deux **contextes ROS 2 et exécuteurs dédiés**, souscription/publication réelles dans deux domaines distincts ; sérialise le dialogue précédent sous forme `user/assistant` et l'envoie par le **nouveau** topic ROS 2 du robot B.
- Même mémoire **fictive**, SHA-256 `d6838573ea81a61a7977e4f7a6115aba8b552883cdd68118aa961c803fbd8eea`.
- Même véritable IA générative **Qwen2.5-1.5B-Instruct**, quantification GGUF **Q4_K_M** de `Qwen/Qwen2.5-1.5B-Instruct-GGUF`, exécutée sur CPU par **llama.cpp**, HTTP sur `127.0.0.1:18080`, sans API payante.
- Empreinte SHA-256 du fichier GGUF testé : `6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e`.

Le test vérifie **l'absence de découverte croisée DDS** entre les deux domaines, deux PID de workers distincts, une capsule intacte, le même modèle, des générations réelles, des réponses hachées, deux codes nouveaux successifs, et aucune commande moteur.

## Séquence de preuve

1. **A / ROS 42** : question sur le vin -> réponse produite par Qwen : « Chicago. »
2. **A / ROS 42** : l'utilisateur donne un **nouveau** mot de passe fictif `AZUR-370` (tiré au sort, absent des souvenirs initiaux) -> Qwen le répète.
3. Superviseur : transporte les quatre tours `user/assistant` dans une nouvelle enveloppe contrôlée à **B / ROS 43**. Les deux ROS n'ont pas besoin de découvrir leurs topics respectifs.
4. **B / ROS 43** : une question ne mentionnant PAS le nouveau code -> Qwen rappelle `AZUR-370`, obtenu exclusivement grâce au contexte reçu.
5. **B / ROS 43** : nouvelle question de vérification de la mémoire initiale -> « Chicago. »
6. Deuxième exécution, code inédit `AZUR-437` : même résultat (PASS).

## Fichiers

- `ros2_probe/qwen_ros_bridge.py` : requêtes `/v1/chat/completions` vers llama.cpp en loopback, refus des données non synthétiques, contexte conversationnel borné.
- `ros2_probe/qwen_ros_worker.py` : un worker ROS 2 par robot/profil, avec `Ros2TextAdapter` comme base et émission DDS de la réponse réellement générée.
- `ros2_probe/qwen_handoff_probe.py` : observateurs ROS 2 pour deux domaines, transfert, challenge inédit, mesure et anti-faux-PASS.
- `controllers/soulbridge_shared/ros2_text_adapter.py` : fermeture propre des nœuds après arrêt du processus.
- `docs/evidence/SOULBRIDGE-QWEN-ROS2-TWO-DOMAINS-REAL-PASS-2026-10-16.json` : preuve de deux exécutions incluant défis et empreintes.

## Alternative d'exécution gratuite

Un environnement de calcul VM **Floot déjà connecté** a permis de contourner Render Free (HTTP 402) **et** l'absence de Docker : téléchargement de l'OCI officielle via `skopeo`, extraction avec `umoci`, exécution dans une rootfs Ubuntu Noble via `chroot` avec `/dev/shm` monté. `llama.cpp` a été compilé pour ARM64, Qwen GGUF récupéré depuis sa source officielle, puis chargé localement sur le port `18080`.

Aucun GitHub Actions, aucun appel OpenAI facturé, aucun matériel ou nouveau plan payant. Toutes les pièces vérifiables sont sur GitHub ; la machine d'exécution ponctuelle n'est **pas** un serveur de déploiement permanent.

## Limites à ne pas masquer

**PASS** : authentique Qwen génératif + ROS2/DDS réel + transfert de dialogue entre deux **domaines de découverte indépendants** et deux processus, sur **le même hôte**, mémoire fictive, codes aléatoires et contrôles d'intégrité.

**NON PRUVÉ** : deux hôtes physiques distincts, deux **simulateurs de dynamique humanoïde** indépendants, pilotes/SDK Robotis et SoftBank, commandes motrices, autonomie robotique, voix, export personnel ChatGPT, confidentialité d'un réseau réel, durée de vie longue de la mémoire, sécurité DDS avec authentification et chiffrement, portage d'identité ou conscience.

`ROS_DOMAIN_ID` / `LOCALHOST` ne remplacent PAS une frontière de cybersécurité. La capsule réelle issue de l'export privé n'est pas utilisée et demeure bloquée par le chargeur du prototype public.

**Prochain seuil expérimental :** deux hôtes physiques ou simulateurs réellement distincts, une interface mémoire sécurisée, questions aléatoires décidées par un évaluateur tiers, puis intégration robotique encadrée par un laboratoire.
