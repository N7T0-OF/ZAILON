# Steam Advanced — official.zailon.steam-advanced

Détection et import avancés de la **bibliothèque Steam** (spec
« Finalisation des add-ons » §37) :

- scan des jeux installés (Steam) depuis la Bibliothèque ;
- import en un clic avec création des profils et des chemins runtime ;
- association par appId (aucun doublon).

- **Capacité** : `steam.advanced`
- **Slots UI** : `Library.Detect`, `Library.Grid`
- **Installation optionnelle** — sans cet add-on, aucun bouton de détection
  ni dialogue de scan Steam n'existe, et le Core ne scanne jamais la
  bibliothèque Steam (feature removal §57).

## Build

```bash
npm run addon:build:official
```

Le package est généré dans `zailon-addons/packages/steam-advanced/` et le
catalogue (`zailon-addons/catalog.json`) est mis à jour automatiquement
(SHA-256, taille, version) — la carte passe de « En développement » à
« Disponible ».
