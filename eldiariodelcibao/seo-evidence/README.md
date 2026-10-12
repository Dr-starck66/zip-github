# ASTRA KEYWORD EVIDENCE Ω — El Diario del Cibao

## Objectif
Prouver **ce qui est mesurable** pour les 10 guides dominicains, sans chiffres inventés ni abonnement à un service SEO. La brique est dans le dépôt réellement lié à Railway, mais n'expose aucune clé dans le site public.

## Commandes
Depuis la racine du dépôt :

```bash
node eldiariodelcibao/seo-evidence/tests.mjs
node eldiariodelcibao/seo-evidence/run.mjs
```

Rapports locaux générés : `seo-evidence/reports/keyword-evidence.json`, `.csv`, `.md`. Sans sources vérifiables, les dix lignes sont `UNVERIFIED` (c'est volontaire).

Pour tenter de récupérer les statistiques officielles via **des accès déjà autorisés** (aucune campagne ni dépense publicitaire créée) :

```bash
node eldiariodelcibao/seo-evidence/run.mjs --fetch-official
```

Paramètres facultatifs : `GOOGLE_ADS_ACCESS_TOKEN`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID`, éventuellement `GOOGLE_ADS_LOGIN_CUSTOMER_ID`; et `GSC_ACCESS_TOKEN`, `GSC_SITE_URL`. Il faut des comptes éligibles et des autorisations OAuth déjà existantes. Aucun connecteur payant requis par le code. Aucun compte Ads ni vérification GSC n'est créé implicitement.

## Preuves, pas de chiffres marketing

| Mesure | Source | Sens exact | Limite |
|---|---|---|---|
| `avgMonthlySearches` | API Google Ads KeywordPlanIdeaService | Moyenne **approximative** mensuelle Google Search, ciblage pays DO, langue espagnole, 12 mois | Accès Google Ads/developer token requis; variantes proches parfois regroupées |
| `competitionIndexAds` | même source | Concurrence des annonces Google (0–100) | **Pas** une difficulté SEO |
| `siteImpressions` | API Google Search Console | Nombre d'impressions du **site** dans les recherches dominicaines par requête et période | Pas le volume total de la requête; anonymisation et limites de lignes |
| `proxyScore` | SERP Google top 8–10 importée avec horodatage | Score structurel transparent : titres correspondants (70%) et domaines institutionnels (30%) pondérés par rang | **Pas** un KD Semrush, pas une mesure de backlinks/autorité |
| `difficultySeo` | aucun outil officiel ne donne cet indicateur | Toujours `null` pour ne pas inventer un KD | Une estimation SEO propriétaire exige une méthode et des données supplémentaires |

Si un indicateur manque, `null` et `UNVERIFIED` sont utilisés, **jamais zéro**. Les sources sont périssables (Google Ads 100 jours, GSC 45 jours, SERP 30 jours). Les données liées à un autre pays ou moteur sont refusées.

## Import de sources externes non sensibles

Facultativement placer dans `seo-evidence/input/` trois fichiers JSON : `google-ads.json` (réponse transformée de l'API et métadonnées strictes), `gsc.json` ou `serp.json`. Ne jamais commiter de cédulas, jetons OAuth ou captures contenant des données personnelles. Toute donnée déclarée « source » mais ajoutée manuellement doit être auditée indépendamment avant de servir de preuve.

Les modèles de structure se trouvent dans les tests `tests.mjs`. Le collecteur `run.mjs --fetch-official` produit les enveloppes exactes si les accès OAuth sont déjà configurés.

## Gate de publication / usage SEO

- `PASS` absolu est **interdit** par la brique actuelle pour une promesse « gros volume + faible difficulté SEO » car aucun fournisseur officiel gratuit ne fournit une difficulté SEO objective et universelle.
- `PARTIAL` : au moins un signal sourcé, mais difficulté SEO non prouvée.
- `UNVERIFIED` : aucune donnée externe actuelle exploitable.
- `CANDIDATE_PROXY_ONLY` : volume Google Ads >= 1000/mois **et** score structurel SERP <= 35, jamais appelé « faible KD prouvé ».

L'automatisation ne simule pas de trafic et ne modifie pas SEMrush. **SEMrush calcule ses estimations indépendamment**. Les améliorations organiques nécessitent indexation, pertinence et positions acquises naturellement.

Docs officielles : https://developers.google.com/webmaster-tools/v1/searchanalytics/query et https://developers.google.com/google-ads/api/docs/keyword-planning/generate-historical-metrics
