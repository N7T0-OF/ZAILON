# CurseForge Provider — official.zailon.provider.curseforge

Source **Explorer** CurseForge : recherche, détails, téléchargement — avec
configuration de la **clé API partenaire** (coffre système, jamais embarquée
dans le package) et état du fournisseur (spec « Finalisation des add-ons »
§30).

- **Capacité** : `provider.curseforge`
- **Slots UI** : `Explorer.Provider`, `Settings.Integrations`,
  `Settings.Provider.CurseForge`
- **Installation optionnelle** — sans cet add-on, CurseForge n'existe pas dans
  Explorer ni dans les Paramètres (source, effets et saisie de clé absents) —
  feature removal §57.
- **Clé partenaire** : la clé n'est jamais embarquée dans le package ; elle est
  saisie par l'utilisateur et conservée dans le coffre du système.

## Build

```bash
npm run addon:build:official
```

Le package est généré dans `zailon-addons/packages/curseforge/` et le catalogue
(`zailon-addons/catalog.json`) est mis à jour automatiquement (SHA-256, taille,
version) — la carte passe de « En développement » à « Disponible ».
