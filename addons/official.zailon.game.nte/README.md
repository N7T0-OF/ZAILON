# NTE Support — official.zailon.game.nte

Support du mod loader de **Neverness to Everness** (NTE), la total conversion
Cyberpunk 2077 (spec « Finalisation des add-ons » §32) :

- **Backend PAK** : les jeux NTE sont classés `nte-pak` (.pak/.utoc/.ucas),
  un backend distinct du VFS Cyberpunk ;
- détection par marqueurs d'exécutable / nom de jeu (`nte`,
  `neverness`, `ntegloballauncher`).

- **Capacité** : `nte.modloader`
- **Slots UI** : `Game.Configuration`, `Game.Mods`
- **Installation optionnelle** — sans cet add-on, aucun jeu n'est classé NTE
  PAK (feature removal §57) : la détection retombe sur le dossier générique.
  La détection de processus au lancement (`ntegloballauncher.exe` comme stage
  intermédiaire, session tracking) reste dans le Core — mécanique de
  lancement, spec « Séparation des responsabilités » §113.

## Build

```bash
npm run addon:build:official
```

Le package est généré dans `zailon-addons/packages/nte/` et le catalogue
(`zailon-addons/catalog.json`) est mis à jour automatiquement (SHA-256, taille,
version) — la carte passe de « En développement » à « Disponible ».
