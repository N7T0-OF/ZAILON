# Discord Presence — official.zailon.discord

Présence Discord réelle pendant le jeu : l'activité (jeu, profil, mods actifs,
temps écoulé) est publiée sur le canal IPC **local** de Discord au lancement et
nettoyée à la fermeture (spec « Discord Presence » §1-40, « Finalisation des
add-ons » §27).

- **Capacité** : `discord.presence`
- **Slots UI** : `Settings.Discord`, `QuickPanel.Discord`,
  `GameDiagnostics.Discord`
- **Installation optionnelle** — sans cet add-on, aucune fonctionnalité Discord
  n'existe dans le Core : pas de section Paramètres, pas de contrôle panneau
  rapide, aucun appel au pont RPC (feature removal test §57).
- **Aucun compte, aucun OAuth** : présence locale via l'IPC Discord
  (Application ID ZAILON prérempli, centralisé et identique pour tous).

## Build

```bash
npm run addon:build:official
```

Le package est généré dans `zailon-addons/packages/discord/` et le catalogue
(`zailon-addons/catalog.json`) est mis à jour automatiquement (SHA-256, taille,
version) — la carte passe de « En développement » à « Disponible ».
