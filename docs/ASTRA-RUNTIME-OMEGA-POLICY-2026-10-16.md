# ASTRA RUNTIME Ω — zéro dépendance Floot, Railway, Render ou GitHub Actions

**Politique appliquée à ASTRA SOULBRIDGE Ω dès le 16 octobre 2026.**

## Correction du blocage « Floot » évoqué à tort

L'environnement Floot utilisé temporairement pour des tests ROS 2 était une **ressource facultative**, pas une composante fonctionnelle de SOULBRIDGE et encore moins une dépendance du code ROS2/Qwen. Son quota quotidien ne rend pas le projet irréalisable. Aucun abonnement supplémentaire n'est requis pour nos composants.

## Notre voie intégrée

- **ASTRA RUNTIME Ω**, `tools/astra_runtime_omega.py` : choisit automatiquement entre une installation ROS 2 Jazzy native et une rootfs OCI ROS 2 **déjà disponible et préparée**, sans appeler de fournisseur cloud.
- Mode `--mode check` : inventaire sans effet secondaire ; annonce les environnements réellement détectés.
- Mode `--mode test` : exécute d'abord la batterie de validation des modèles ROBOTIS OP3 et Unitree G1, puis la démonstration Qwen/ROS 2 si le runtime et le modèle local sont réellement accessibles.
- Interdit l'annonce `PASS` si le programme ROS2 ne sort pas avec code 0 ou si le nouveau rapport JSON ne prouve pas les **deux vrais squelettes robot et JointState reçus via DDS**, les domaines ROS distincts et des générations réelles de Qwen.
- Si aucun runtime ROS2 n'est accessible dans un processus ChatGPT donné, indique **BLOCKED** avec le diagnostic précis. Ceci évite tout faux `PASS` et n'est **pas** une dépendance à Floot.
- Aucune action sur les moteurs ; le dossier `robot_models/` reste limité aux descriptions d'articulations et aux positions calculées.

## Test actuel

Le code de la nouvelle brique et ses 8 tests anti-faux-PASS sont enregistrés sur une branche GitHub distincte. **Leur exécution sur un runtime ROS2 n'est pas encore prouvée pour la nouvelle version ROBOTIS/Unitree**. Un contrôle de syntaxe et des tests locaux restent à effectuer avant de promouvoir vers `main`.

## Utilisation interne (aucun script à demander à l'utilisateur)

```bash
python3 tools/astra_runtime_omega.py --mode check
python3 tools/astra_runtime_omega.py --mode test
```

Le résultat est un JSON comprenant `PASS`, `FAIL` ou `BLOCKED`. Le programme n'utilise aucune plateforme d'hébergement, ne lance pas GitHub Actions, ne télécharge aucun modèle et n'engage aucun frais.

### Preuves déjà acquises
- Qwen réel / ROS 2 Jazzy DDS sur deux domaines distincts : `docs/evidence/SOULBRIDGE-QWEN-ROS2-TWO-DOMAINS-REAL-PASS-2026-10-16.json`.
- Arbres articulaires officiels de deux fabricants différents : `docs/evidence/SOULBRIDGE-ROBOTIS-OP3-UNITREE-G1-OFFICIAL-MODELS-2026-10-16.json`.

Ces deux preuves ont été obtenues séparément. L'exécution combinée de la version récente ne doit être déclarée PASS qu'après un nouveau test réel.
