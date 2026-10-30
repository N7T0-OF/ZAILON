# Cyberpunk Advanced — official.zailon.game.cyberpunk

Outils avancés pour **Cyberpunk 2077** (spec « Finalisation des add-ons » §31) :

- **Réparer les racines Cyberpunk** : détecte et corrige les paquets dont la
  structure est mal imbriquée (snapshot + rollback, collisions bloquantes
  identifiées avant toute modification) ;
- **Réparer le déploiement (import MO2)** : restaure les fichiers runtime dont
  le fournisseur est confirmé par plusieurs signatures, reconstruit les
  manifestes et recalcule la carte virtuelle — source MO2 en lecture seule ;
- **Réparer RED4ext** : diagnostic complet (installé / manifest / déployé /
  runtime visible) + reconstruction de la table virtuelle.

- **Capacité** : `cyberpunk.frameworks`
- **Slots UI** : `Game.Tools`, `Game.Diagnostic`, `Diagnostic.Frameworks`
- **Installation optionnelle** — sans cet add-on, aucun outil de réparation
  Cyberpunk n'apparaît (feature removal §57). La détection de frameworks et le
  backend virtuel de lancement restent dans le Core (adaptateur jeu, spec
  « Séparation des responsabilités » §113) : un jeu Cyberpunk se lance et se
  scanne normalement, seuls les outils de réparation disparaissent.

## Build

```bash
npm run addon:build:official
```

Le package est généré dans `zailon-addons/packages/cyberpunk/` et le catalogue
(`zailon-addons/catalog.json`) est mis à jour automatiquement (SHA-256, taille,
version) — la carte passe de « En développement » à « Disponible ».
