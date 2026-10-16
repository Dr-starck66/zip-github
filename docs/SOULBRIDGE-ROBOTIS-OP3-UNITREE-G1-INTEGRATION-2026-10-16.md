# ASTRA SOULBRIDGE Ω — deux modèles humanoïdes de constructeurs réellement différents

**16 octobre 2026 — construction de l'intégration expérimentale.**

## Nouvelle cible (ce n'est plus un simple nom de fabricant)

| | Robot A | Robot B |
|---|---|---|
| Constructeur | **ROBOTIS** | **Unitree Robotics** |
| Plateforme | **OP3** | **G1 (23 degrés de liberté)** |
| Source officielle | ROBOTIS-GIT/ROBOTIS-OP3-Common, branche ROS 2 Jazzy | unitreerobotics/unitree_ros |
| Commit verrouillé | `6f7d56ccef6f78061925c56c6bd9d134d243f911` | `5994d4faef0a9cadd3287f8de0199a67eeb2a259` |
| Format d'origine | Xacro (`robotis_op3.structure.*.xacro`) | `g1_23dof.urdf` |
| Articulations commandables décrites | **20** | **23** |
| Liens de l'arbre cinématique | **23** | **33** |
| Environnement DDS prévu | Domaine ROS 2 **42** | Domaine ROS 2 **43** |
| Utilisation d'un SDK constructeur ou d'un moteur physique | **Non** | **Non** |

Sources : urlOP3 dans la documentation ROBOTIShttps://docs.robotis.com/docs/systems/op3/introduction/ et urlG1 décrit par Unitreehttps://github.com/unitreerobotics/unitree_ros/tree/master/robots/g1_description.

## Actions réalisées

1. Analyse des vrais joints, liens, axes, transformations et limites dans les sources officielles **épinglées par SHA de commit**.
2. Création de `robot_models/robotis_op3.model.json` et `robot_models/unitree_g1.model.json`, d'après ces fichiers véritables.
3. `robot_models/kinematics.py` : validation du graphe, intégrité logique du modèle, position des membres calculée sans actionneur.
4. `robot_models/skeleton_urdf.py` : reconstruction d'un squelette URDF léger avec chaque véritable articulation, sans géométrie graphique STL, inertie dynamique ni contrôleur moteur.
5. Les deux workers Qwen/ROS2 du prototype chargent désormais chacun leur **modèle articulé distinct**, au lieu de porter seulement une étiquette « OP2/NAO ». Ils peuvent publier, sur leurs propres sujets ROS2 DDS, une description de squelette et un `sensor_msgs/JointState` **synthétique**.
6. Le superviseur du transfert conversationnel a été renforcé pour n'autoriser PASS que si les deux squelettes et les tableaux articulaires spécifiques des constructeurs ont été **réellement reçus via leurs DDS distincts** (en plus des défis de contexte aléatoires).
7. `tests/test_real_manufacturer_kinematics.py` : suite de **14** tests unitaires Python ajoutée ; son exécution est à vérifier sur un environnement de calcul disponible.

## Preuves exécutées et limites

**PASS sur analyse des fichiers constructeurs :** un validateur indépendant exécuté via les outils de connexion GitHub a vérifié les 20/23 articulations, 23/33 liens, le graphe, les deux sources distinctes, et une variation d'angle du genou de 0,15 rad faisant bouger l'extrémité cinématique : 0,0168755 m pour OP3 ; 0,0475906 m pour G1. Cinq mutations du manifeste ont déclenché des rejets, dont source altérée, constructeur changé, motorisation activée et lien dupliqué. Preuve JSON : `docs/evidence/SOULBRIDGE-ROBOTIS-OP3-UNITREE-G1-OFFICIAL-MODELS-2026-10-16.json`.

**PASS antérieur réellement exécuté, inchangé :** Qwen génératif lié à ROS 2 via **deux processus et domaines DDS 42/43**, avec transmission d'un code aléatoire nouveau. Preuve : `docs/evidence/SOULBRIDGE-QWEN-ROS2-TWO-DOMAINS-REAL-PASS-2026-10-16.json`. Cette preuve antérieure concernait des profils textuels et ne valide pas les nouveaux squelettes constructeur.

**PARTIAL / non vérifié :** au moment du nouveau raccordement, la VM gratuite Floot a atteint son quota quotidien de 100 actions. Les nouveaux workers ROS2 chargés avec les squelettes ne se sont donc **pas exécutés en vrai**. Les tests Python ajoutés ne sont pas non plus attestés comme exécutés. Aucune commande moteur n'a été envoyée. Aucun service facturable n'a été souscrit.

**NON DÉMONTRÉ :** pilotes physiques Unitree/ROBOTIS, deux simulateurs de physique (PyBullet, Gazebo, Webots), dynamique/collision, périphériques capteurs, commande moteur réelle, deux ordinateurs indépendants, véritable export ChatGPT, deux robots humanoïdes physiques. Les descriptions cinématiques authentiques ne sont PAS des systèmes robotiques physiques.

## Rejouer les vérifications (sans Github Actions)

```bash
python3 -m unittest discover -s tests -p test_real_manufacturer_kinematics.py -v
```

Pour une vérification ROS 2 réelle, construire le conteneur `ros2_probe/Dockerfile` mis à jour avec `ros-jazzy-sensor-msgs` et `robot_models/`, fournir Qwen GGUF local/llama.cpp sur `127.0.0.1:18080`, puis exécuter `python3 ros2_probe/qwen_handoff_probe.py` sous ROS 2 Jazzy avec `ROS_AUTOMATIC_DISCOVERY_RANGE=LOCALHOST`. Il faudra conserver un nouveau rapport distinct des anciennes preuves, prouvant les deux sujets `robot_description` et `joint_states`.

Ce montage est réservé à la démonstration sur **données fictives**. Les messages ROS2 ne sont pas chiffrés par ces seuls réglages DDS, et il ne faut pas y injecter l'archive privée de l'utilisateur.
