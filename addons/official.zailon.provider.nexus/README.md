# Nexus Provider — official.zailon.provider.nexus

Source **Explorer** Nexus Mods : recherche, galerie, pagination, états de mise à
jour et téléchargement — avec configuration de la **clé API personnelle**
(coffre système, jamais renvoyée à l'interface) et association des liens
`nxm://` (spec « Finalisation des add-ons » §28).

- **Capacité** : `provider.nexus`
- **Slots UI** : `Explorer.Provider`, `Settings.Integrations`,
  `Settings.Provider.Nexus`
- **Installation optionnelle** — sans cet add-on, Nexus n'existe pas dans
  Explorer (source, effets et requêtes distantes coupés) ni dans les
  Paramètres (saisie de clé et liens NXM absents) — feature removal §57.
- **Sans compte obligatoire** : le catalogue public Nexus se consulte sans clé ;
  la clé débloque téléchargements et détails enrichis.

## Build

```bash
npm run addon:build:official
```

Le package est généré dans `zailon-addons/packages/nexus/` et le catalogue
(`zailon-addons/catalog.json`) est mis à jour automatiquement (SHA-256, taille,
version) — la carte passe de « En développement » à « Disponible ».
