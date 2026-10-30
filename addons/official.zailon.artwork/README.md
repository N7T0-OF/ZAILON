# Artwork+ — official.zailon.artwork

Illustrations automatiques pour les jeux (spec « Finalisation des add-ons »
§38) :

- **Sources** : SteamGridDB, IGDB et GameBanana ;
- **Recherche automatique** pour les nouveaux jeux détectés (art officiel
  Steam d'abord, puis les sources configurées) ;
- **Configuration** des clés et de la source de recherche dans les
  Paramètres.

- **Capacité** : `artwork.plus`
- **Slots UI** : `Settings.Appearance`, `Game.Resources`
- **Installation optionnelle** — sans cet add-on, aucune source
  d'illustrations ni section de configuration n'apparaît (feature
  removal §57).

## Build

```bash
npm run addon:build:official
```

Le package est généré dans `zailon-addons/packages/artwork/` et le catalogue
(`zailon-addons/catalog.json`) est mis à jour automatiquement (SHA-256, taille,
version) — la carte passe de « En développement » à « Disponible ».
