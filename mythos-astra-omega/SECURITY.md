# Security & Privacy

## V2 public
- local-first ;
- aucune donnée d'audit envoyée à un backend Mythos Astra Ω ;
- historique conservé uniquement dans localStorage ;
- partage par URL : le contenu partagé est placé dans le fragment `#`, il faut donc traiter le lien comme sensible ;
- fingerprint via SHA-256 Web Crypto quand disponible.

## Risques connus
- le fragment partagé peut être copié ou enregistré par le navigateur ;
- localStorage n'est pas un coffre-fort ;
- aucune authentification dans la V2 statique ;
- aucune signature serveur ;
- aucune vérification réseau des preuves.

## Future Enterprise
Prévoir chiffrement au repos, SSO/RBAC, rétention configurable, audit ledger append-only, secrets manager, CSP stricte, journalisation, isolation tenant et tests de sécurité.
