# ReShade Manager — official.zailon.reshade

Gestion **ReShade** par jeu (spec « Finalisation des add-ons » §26) :

- détection d'une installation ReShade existante ;
- ajout/configuration pour les jeux compatibles depuis la page du jeu ;
- résolution de la cible d'injection (exécutable du jeu).

- **Capacité** : `reshade.manager`
- **Slot UI** : `Game.Configuration`
- **Installation optionnelle** — sans cet add-on, aucune section ReShade
  n'apparaît dans la configuration d'un jeu (feature removal §57).

## Build

```bash
npm run addon:build:official
```

Le package est généré dans `zailon-addons/packages/reshade/` et le catalogue
(`zailon-addons/catalog.json`) est mis à jour automatiquement (SHA-256, taille,
version) — la carte passe de « En développement » à « Disponible ».
