# GameBanana Provider — official.zailon.provider.gamebanana

Source **Explorer** GameBanana : recherche de jeux et de mods, galerie avec
pagination, images, états d'installation (installé / mis à jour) et
téléchargement (spec « Finalisation des add-ons » §29, « Explorer » §21-24).

- **Capacité** : `provider.gamebanana`
- **Slots UI** : `Explorer.Provider`, `Settings.Integrations`
- **Installation optionnelle** — sans cet add-on, GameBanana n'existe pas dans
  Explorer : pas de source, pas d'effet, **zéro requête distante** (feature
  removal test §57).
- **Sans compte** : le catalogue public GameBanana est connecté directement.

## Build

```bash
npm run addon:build:official
```

Le package est généré dans `zailon-addons/packages/gamebanana/` et le catalogue
(`zailon-addons/catalog.json`) est mis à jour automatiquement (SHA-256, taille,
version) — la carte passe de « En développement » à « Disponible ».
