# Theme Packs — official.zailon.themes

Packs de thèmes (spec « Finalisation des add-ons » §39) : presets complets
appliqués d'un clic depuis **Paramètres → Apparence**.

Chaque pack combine :

- **couleur d'accent** ;
- **densité** (confortable / compacte) ;
- **taille de texte** ;
- **animations** (auto / réduites).

Les réglages restent modifiables individuellement après application.
Cinq packs inclus : Classique, Or contrasté, Nuit, Émeraude, Écarlate compact.

- **Capacité** : `themes.packs`
- **Slot UI** : `Settings.Appearance`
- **Installation optionnelle** — sans cet add-on, aucun pack de thème
  n'apparaît (feature removal §57). La couleur d'accent simple reste dans le
  Core.

## Build

```bash
npm run addon:build:official
```

Le package est généré dans `zailon-addons/packages/themes/` et le catalogue
(`zailon-addons/catalog.json`) est mis à jour automatiquement (SHA-256, taille,
version) — la carte passe de « En développement » à « Disponible ».
