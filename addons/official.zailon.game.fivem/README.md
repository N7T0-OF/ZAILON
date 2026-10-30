# FiveM Profiles — official.zailon.game.fivem

Traitement **FiveM client** (spec « Finalisation des add-ons » §33) :

- **Base neutre** initialisée à l'import d'un jeu FiveM (indexation sans
  copie complète) ;
- **Bannière adaptateur** dans la liste de mods : plugins et fichiers client
  uniquement, refus des ressources serveur (fxmanifest.lua, __resource.lua,
  server.cfg).

- **Capacité** : `fivem.profiles`
- **Slots UI** : `Game.Mods`, `Library.Import`
- **Installation optionnelle** — sans cet add-on, un jeu FiveM s'importe
  comme n'importe quel jeu (feature removal §57). L'adaptateur de lancement
  (FiveM.exe → CitizenFX → Game) reste dans le Core — mécanique de lancement,
  spec « Séparation des responsabilités » §113.

## Build

```bash
npm run addon:build:official
```

Le package est généré dans `zailon-addons/packages/fivem/` et le catalogue
(`zailon-addons/catalog.json`) est mis à jour automatiquement (SHA-256, taille,
version) — la carte passe de « En développement » à « Disponible ».
