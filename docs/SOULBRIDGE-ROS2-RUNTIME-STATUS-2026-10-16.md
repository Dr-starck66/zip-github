# ASTRA SOULBRIDGE Ω — ROS 2 natif réel : rapport définitif du 16 octobre 2026

## Résultat de l'exécution : **PASS**, périmètre strictement limité au test DDS de dialogue synthétique

**Preuve structurée horodatée :** [SOULBRIDGE-ROS2-DDS-REAL-PASS-2026-10-16.json](./evidence/SOULBRIDGE-ROS2-DDS-REAL-PASS-2026-10-16.json).

- Dernière exécution réussie : **2026-10-16 13:49:41 UTC**.
- Statut renvoyé par le vrai programme : `REAL_ROS2_DDS_LOOPBACK_PASS`.
- Sortie du processus : code **0** ; **0 erreur** sur cette exécution finale.
- **ROS 2 Jazzy**, Ubuntu Noble **arm64/aarch64**, paquet natif `rclpy` et `std_msgs`.
- Image OCI officielle : `docker.io/library/ros:jazzy-ros-base`, manifeste ARM64 `sha256:066420e07f60aa18262f2479981def87ebcfcec42eefb0c0c57c4a46098348ca`.
- Capsule fictive partagée, empreinte SHA-256 : `d6838573ea81a61a7977e4f7a6115aba8b552883cdd68118aa961c803fbd8eea`.
- **Trois véritables nœuds ROS 2** : deux adaptateurs de dialogue et un observateur sur DDS.
- **Quatre messages** de réponse réellement délivrés et vérifiés via DDS sur quatre topics : pour chaque profil, souvenir connu puis souvenir absent.
- Résultat identique des deux adaptateurs, avec refus explicite du souvenir absent.
- Entrée trop longue rejetée, aucune réponse publiée en retour ; aucun topic d'actionneur ni pilote robot.
- `ROS_DOMAIN_ID=42`, `ROS_AUTOMATIC_DISCOVERY_RANGE=LOCALHOST`.

### Comment le blocage Render a été contourné sans payer

La tentative initiale sur Render Free a retourné **HTTP 402** car Render réclamait des données de paiement. Aucun service Render n'a été créé, aucun débit engagé.

À la place, une **machine virtuelle de calcul déjà disponible** via l'application Floot connectée a été utilisée (aucun nouvel abonnement). Elle est Debian 12 arm64, exécutable root, mais ne disposait ni de Docker ni de ROS. Nous y avons installé les outils `skopeo` / `umoci`, téléchargé l'image officielle ROS 2 comme **rootfs OCI**, puis exécuté **directement** le runtime Ubuntu/ROS 2 via `chroot`. La mémoire partagée `/dev/shm` a été montée dans le rootfs pour supprimer les avertissements Fast DDS apparus lors des deux premiers essais, et la vérification finale a été rejouée : **PASS et logs propres**.

L'environnement était isolé au sens d'un **rootfs séparé** et d'une découverte ROS 2 limitée à `LOCALHOST`. Ce n'était **pas** un conteneur Docker avec pare-feu ou une preuve de confinement de niveau sécurité ; la découverte sur localhost ne chiffre pas les messages.

### Validation et limites exactes

**Démontré :** vrai `rclpy`, vrai middleware ROS 2 DDS, deux endpoints de dialogue, même capsule de mémoire, réponses textuelles reçues via les topics, validation des réponses, rejet d'entrée incorrecte.

**Non démontré :** deux fabricants réellement intégrés, deux machines physiques, robots réels, moteurs, voix, vraie mémoire ChatGPT exportée, DDS sécurisé, déploiement permanent sur serveur. Les noms `Robotis` / `SoftBank` sont uniquement des **profils logiciels** ; ils ne signifient pas que leurs SDK ont été utilisés.

### Reproductibilité sans Docker daemon

Sur un hôte Linux compatible ARM64 avec `skopeo`, `umoci` et `chroot` autorisés :

```bash
skopeo copy --override-arch arm64 docker://docker.io/library/ros:jazzy-ros-base oci:/tmp/soulbridge-ros-oci:jazzy
umoci unpack --rootless --image /tmp/soulbridge-ros-oci:jazzy /tmp/soulbridge-ros-bundle
mkdir -p /tmp/soulbridge-ros-bundle/rootfs/dev/shm
mount --bind /dev/shm /tmp/soulbridge-ros-bundle/rootfs/dev/shm
# Déposer les fichiers du dépôt dans /tmp/soulbridge-ros-bundle/rootfs/app
ROS_DOMAIN_ID=42 ROS_AUTOMATIC_DISCOVERY_RANGE=LOCALHOST \
chroot /tmp/soulbridge-ros-bundle/rootfs /bin/bash -lc \
  'source /opt/ros/jazzy/setup.bash; cd /app; python3 -u ros2_probe/real_dds_probe.py'
```

Le script sort avec code 0 **uniquement si** les contrôles DDS réels passent. Il ne reçoit et n'envoie aucune donnée personnelle. Le rapport synthétique horodaté dans `docs/evidence` a été sauvegardé comme preuve durable ; GitHub Actions n'a pas été utilisé.

**Suite logique :** interopérabilité entre deux processus/machines isolées, puis étude des connecteurs SDK robots réels, sous supervision scientifique.
