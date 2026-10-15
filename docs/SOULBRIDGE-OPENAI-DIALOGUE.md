# ASTRA SOULBRIDGE Ω — dialogue IA réel (prototype expérimental)

Ce module se sert de l'API officielle **OpenAI Responses** pour donner au robot virtuel une **réponse conversationnelle générée** à partir d'une capsule synthétique.

**À ne pas confondre** : l'API OpenAI est facturée séparément de ChatGPT. Ce n'est pas l'historique courant de votre application ChatGPT et ce n'est pas un transfert de conscience.

- Sans configuration : aucun appel réseau à OpenAI, aucun coût.
- Les tests unitaires simulent les réponses ; ils ne démontrent pas une conversation avec un vrai modèle.
- Une requête vers l'API ne peut se produire qu'avec `--live --consent` **et** une clé `OPENAI_API_KEY` fournie par l'opérateur. De l'utilisation facturée est alors possible.
- La démo publique refuse les conversations réelles ou privées : uniquement une capsule fictive.
- Aucun outil moteur ni aucune commande physique.

Essai non facturé : `python -m unittest discover -s tests -p test_openai_bridge.py -v`

Essai réel sous consentement explicite et crédits disponibles (pas encore exécuté) :
```
OPENAI_API_KEY=... python tests/ask_chatgpt.py --question 'Tu te souviens de Bordeaux ?' --live --consent
```

Cette interface évalue le dialogue indépendamment des simulations Webots/PyBullet. L'intégration vocale temps réel et la liaison robotique sont à développer et à vérifier séparément.
