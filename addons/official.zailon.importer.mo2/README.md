# MO2 Importer — official.zailon.importer.mo2

Import depuis **Mod Organizer 2** (spec « Finalisation des add-ons » §34) :

- lecture de l'instance MO2 : mods, profils, ordre de chargement, overwrite ;
- création des profils ZAILON correspondants (références exactes par paquet) ;
- staging des paquets et synchronisation des chemins runtime ;
- source MO2 en lecture seule.

- **Capacité** : `importer.mo2`
- **Slots UI** : `Game.Profiles`, `Game.Mods`
- **Installation optionnelle** — sans cet add-on, aucun import MO2 n'existe
  (bouton, dialogue) et le Core refuse l'import (feature removal §57).

## Build

```bash
npm run addon:build:official
```

Le package est généré dans `zailon-addons/packages/mo2-importer/` et le
catalogue (`zailon-addons/catalog.json`) est mis à jour automatiquement
(SHA-256, taille, version) — la carte passe de « En développement » à
« Disponible ».
