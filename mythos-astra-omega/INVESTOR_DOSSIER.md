# Mythos Astra Ω — Dossier de valorisation V2

Date : 26 septembre 2026

## 1. Résumé
Mythos Astra Ω est un prototype logiciel fonctionnel de contrôle de fiabilité pour sorties IA. Son angle différenciant est le refus du PASS déclaratif : chaque conclusion est évaluée par plusieurs gates et peut être bloquée par l'absence de preuve, de contre-test ou de reproductibilité.

## 2. Actifs existants aujourd'hui
### Logiciel démontré
- moteur d'audit local V2 ;
- Evidence Graph ;
- score pondéré et hard-fail ;
- False-Pass Hunter ;
- Red Team Gate ;
- Reproducibility Gate ;
- Source Integrity Gate ;
- empreinte SHA-256 ;
- export de rapports ;
- historique local ;
- benchmark intégré.

### Propriété intellectuelle de produit
- marque de travail Mythos Astra Ω ;
- taxonomie en 12 contrôles ;
- schéma d'audit versionné ;
- architecture Claim → Evidence → Test → Countertest → Repair → Verdict ;
- protocole de fermeture PASS / PARTIAL / FAIL.

## 3. Ce qui n'est PAS encore industrialisé
- backend multi-tenant ;
- authentification / SSO / RBAC ;
- facturation ;
- stockage serveur ;
- vérification automatique des URL et artefacts ;
- appels multi-LLM ;
- exécution CI distante ;
- SLA ;
- certification tierce.

Ces éléments sont volontairement séparés de l'existant pour éviter toute fausse représentation pendant une diligence.

## 4. Thèse de valeur
Le marché potentiel n'est pas le "prompt engineering". Le produit doit être vendu comme une couche de contrôle indépendante qui produit des artefacts d'audit et force la traçabilité des preuves avant validation.

Les facteurs pouvant soutenir une valeur d'actif supérieure à celle d'un simple prototype sont :
- protocole propriétaire clairement nommé ;
- moteur indépendant du fournisseur de LLM ;
- format d'audit versionné ;
- Evidence Graph ;
- benchmark reproductible ;
- privacy local-first ;
- roadmap API/SDK entreprise ;
- création future d'un corpus propriétaire de faux PASS.

## 5. Hypothèse de prix, pas valorisation garantie
Une demande de 50 000 € pour la cession ou la licence d'un actif pré-revenus reste une négociation, pas une valeur objective démontrée. Pour la soutenir, il faut présenter le code, la démo, l'IP, la roadmap, le coût de remplacement et idéalement une preuve d'intérêt commercial.

## 6. Packaging commercial indicatif
- Local Auditor : gratuit / acquisition ;
- Team Reliability Gateway : positionnement 9 900 €/an une fois API, registre et policies industrialisés ;
- Enterprise Evidence Control Plane : sur devis après intégrations, déploiement privé et support.

Ces prix sont des hypothèses de packaging et non du revenu existant.

## 7. Moat à construire en priorité
1. Corpus propriétaire de cas de faux PASS.
2. Benchmark public + benchmark privé.
3. Connecteurs GitHub, Vercel, Slack, CI et agent frameworks.
4. Verification runners exécutables.
5. Calibration par feedback humain.
6. Audit ledger tamper-evident.
7. Policies métier.
8. SDK TypeScript/Python.

## 8. Diligence checklist
- [x] code fonctionnel accessible ;
- [x] moteur séparé de l'UI ;
- [x] benchmark embarqué ;
- [x] limites explicites ;
- [x] schéma de rapport versionné ;
- [x] fingerprint SHA-256 ;
- [ ] tests automatisés CI ;
- [ ] backend API ;
- [ ] premiers utilisateurs externes ;
- [ ] LOI / pilote ;
- [ ] marque déposée ;
- [ ] licence et CGU formalisées.

## 9. Narratif acheteur
"Nous ne vendons pas un prompt. Nous vendons un moteur de contrôle qui convertit une sortie IA en objet auditable, cherche activement les faux PASS et refuse la validation lorsque les preuves ne franchissent pas les gates."

## 10. Prochaine preuve de valeur
Le verrou principal pour défendre 50 k€ n'est plus l'interface. C'est l'obtention d'une preuve externe : utilisateur pilote, benchmark tiers, corpus propriétaire ou intégration dans un workflow réel.
