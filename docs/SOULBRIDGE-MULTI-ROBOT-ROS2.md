# ASTRA SOULBRIDGE Ω — Couche d'adaptation multi-robots / ROS 2

**16 octobre 2026 — Statut : PROTOTYPE.** La couche logicielle est implémentée. **21 tests unitaires hors ligne réussis** (notamment un faux environnement rclpy). L'exécution sur une installation ROS 2 réelle et l'intégration à un robot physique restent **UNVERIFIED**. Aucune exécution GitHub Actions n'a été demandée.

## Objectif et périmètre

Séparer la **mémoire et le dialogue** du transport et des fabricants. Les interfaces ne contiennent que des chaînes de texte et la provenance du rappel synthétique. Aucun SDK constructeur, microphone, caméra, contrôle moteur, service de navigation ou action ROS 2 n'est relié.

| Module | Fonction | État |
|---|---|---|
| `controllers/soulbridge_shared/robot_adapters.py` | Interface `RobotTextAdapter`, registre de transports, profil fabricant/modèle, contrôle de capsule identique | Implémenté, tests locaux |
| `controllers/soulbridge_shared/ros2_text_adapter.py` | Pont rclpy optionnel bidirectionnel `std_msgs/msg/String` | Testé avec mocks, ROS réel non testé |
| `controllers/soulbridge_shared/demo_robot_adapters.py` | Démonstration OP2/NAO **purement textuelle** sur deux endpoints virtuels | PASS local, pas une simulation robotique |
| `tests/test_soulbridge_robot_adapters.py` | 21 contrôles anti-faux-PASS | 21/21 local |

Les profils Robotis OP2, SoftBank NAO et Unitree G1 sont **des noms d'identité dans le contrat de transport, pas des pilotes matériels compatibles**. L'ajout d'un autre fabricant ne nécessite aucune modification du moteur de mémoire.

## Démonstration hors ligne : 0 € et sans ROS 2

Depuis la racine du dépôt sur la branche `soulbridge-ros2-adapters-20261016` :

```bash
python -m controllers.soulbridge_shared.demo_robot_adapters \
  --capsule data/synthetic_capsule.json \
  --question 'Quel projet parle de Chicago ?'
python -m unittest discover -s tests -p test_soulbridge_robot_adapters.py -v
```

La sortie affiche `SYNTHETIC_TEXT_ADAPTER_PASS`, les deux identifiants de robots virtuels, l'empreinte commune SHA-256 de la capsule, un hachage de la question, et des indicateurs `physical_robots_tested=false`, `ros2_runtime_tested=false`, `robot_actuation_enabled=false`. Ce test vérifie deux adaptateurs logiciels utilisant le même moteur de rappel, **pas** deux constructeurs physiquement intégrés.

## ROS 2 : pont texte, à activer explicitement

Exigences pour un futur **essai matériel isolé** : distribution ROS 2 avec `rclpy` et `std_msgs` disponibles, machine de test autorisée, utilisateur informé. Aucun paquet n'est installé automatiquement. `Ros2TextAdapter.start(consent=True)` est obligatoire et impose `ROS_DOMAIN_ID` défini entre 0 et 101 ainsi que `ROS_AUTOMATIC_DISCOVERY_RANGE=LOCALHOST` par défaut ; définir ces variables **avant** de démarrer ROS.

```python
import os
from controllers.soulbridge_shared.robot_adapters import RobotIdentity, Transport, SyntheticMemory
from controllers.soulbridge_shared.ros2_text_adapter import Ros2TextAdapter

os.environ['ROS_DOMAIN_ID'] = '42'
os.environ['ROS_AUTOMATIC_DISCOVERY_RANGE'] = 'LOCALHOST'
memory = SyntheticMemory.from_file('data/synthetic_capsule.json')
bridge = Ros2TextAdapter(
    RobotIdentity('robot_a', 'generic', 'text-only', Transport.ROS2_TEXT),
    memory)
try:
    bridge.start(consent=True)
    bridge.spin_once(timeout_sec=0.1)
finally:
    bridge.close()
```

Sujets ROS 2 pour `robot_a` : entrée `/soulbridge/robot_a/operator_text`, sortie `/soulbridge/robot_a/assistant_text`, type `std_msgs/msg/String`, QoS `RELIABLE` + `VOLATILE` + profondeur 10. Les messages incorrects sont rejetés sans être répétés. Un branchement sur le réseau local exige une approbation explicite `allow_lan=True` : **ceci n'est pas une autorisation de diffuser des souvenirs privés**.

**Sécurité :** `ROS_DOMAIN_ID` et la portée de découverte ne sont ni des mécanismes d'authentification ni du chiffrement. Les mesures DDS-Security et de contrôle d'accès doivent être étudiées avant une application réelle. Ne jamais publier d'historique ChatGPT ou une capsule privée sur les topics. Le moteur accepte seulement `processing.source=synthetic_fixture` ; les capsules privées issues du pré-import sont refusées. Aucun actionneur robotique n'est exposé.

## Anti-faux-PASS et limites

21 tests hors ligne effectués sur une copie du code du module et de la capsule synthétique : démarrage opt-in, domaines DDS, deux endpoints, identifiants de fabricants, même empreinte, rejet de mémoire privée, questions non valides, gestion des rappels inconnus, sujets textuels isolés, cycle de vie de ROS 2 simulé et absence d'actionneurs.

**NON validé :** démarrage sur un vrai nœud ROS 2, compatibilité des API Robotis/SoftBank/Unitree, intégration ROS 2 à Webots, transfert de vos conversations ChatGPT, tests de sécurité ROS 2 sur réseau et tout essai sur robot physique.

## Suite vérifiable

1. Essai ROS 2 réel sur environnement local isolé avec un jeu de données synthétiques.
2. Intégration de **deux véritables SDK** (ou simulateurs de fabricants distincts), sans contrôle moteur.
3. Questions inédites et journaux de provenance indépendants avant d'envisager des tests encadrés avec GEPETTO.

Documentation officielle ROS 2 : https://docs.ros.org/en/rolling/Concepts/Intermediate/About-Domain-ID.html
