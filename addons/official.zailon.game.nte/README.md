# NTE Support — official.zailon.game.nte

Support du mod loader de **Neverness to Everness** (NTE), jeu Unreal Engine 5
de Perfect World (versions **Global**, **China** et **Taiwan** ; providers
Perfect World, Steam et Epic Games). Cet add-on fusionne les connaissances du
launcher open-source **Aurora** (GPL-3.0) pour rendre les mods installés dans
ZAILON réellement fonctionnels :

- **Backend PAK** : les jeux NTE sont classés `nte-pak` (.pak/.utoc/.ucas) —
  un backend distinct du VFS Cyberpunk ; détection par marqueurs d'exécutable /
  nom de jeu (`nte`, `neverness`, `ntegloballauncher`).
- **Dossier AuroraMods** : `<jeu>/Client/WindowsNoEditor/HT/Content/Paks/AuroraMods`
  — un dossier = un mod, contenant .pak/.utoc/.ucas (layout exact du launcher
  Aurora). Le dossier est détecté automatiquement à l'ajout du jeu
  (`guess_mods_path`) et proposé en un clic depuis la configuration.
- **Activation réelle** : désactiver un mod NTE renomme `.pak` → `.pak.disabled`
  dans son dossier (transactionnel, avec rollback) — le mécanisme exact du
  moteur Aurora (Everlight), qui ignore les fichiers `.disabled`. Le toggle
  générique `DISABLED_*` (renommage du dossier) ne suffirait pas : il ne serait
  pas visible du moteur.
- **Métadonnées `mod.json`** (Aurora « Display file ») : nom, version, auteur,
  icône, `optionals.support link` et `optionals.custom image url` — clés
  insensibles à la casse, BOM toléré, suffixe `_P` retiré du nom d'affichage.
  La liste des mods ZAILON affiche ces informations et le lien de support.
- **Diagnostic d'installation** (carte NTE) : version détectée (Global/CN/TW
  par `NTEGlobalLauncher.exe`/`NTELauncher.exe`/`NTETWLauncher.exe`),
  distribution (Epic par `NTEGlobal/EOSSDK-Win64-Shipping.dll` — args d'auth
  `-AUTH_PASSWORD=1234 -AUTH_TYPE=exchangecode` —, Steam ou Standalone),
  marqueurs de validation et chemin du dossier Mods.

- **Capacité** : `nte.modloader`
- **Slots UI** : `Game.Configuration`, `Game.Mods`, `Game.Tools`,
  `Game.Diagnostic`
- **Installation optionnelle** — sans cet add-on, aucun jeu n'est classé NTE
  PAK (feature removal §57) : la détection retombe sur le dossier générique et
  la carte de diagnostic n'existe pas. La détection de processus au lancement
  (`ntegloballauncher.exe` comme stage intermédiaire, session tracking) reste
  dans le Core — mécanique de lancement, spec « Séparation des responsabilités »
  §113.

## Notes Aurora (pour les créateurs de mods)

- Le chargement réel des .pak dans le jeu est assuré par le moteur Aurora
  (Everlight, injection `version.dll`/`dsound.dll` — hors périmètre ZAILON).
  ZAILON installe, organise, active et documente ; Aurora charge.
- Versions : Global (`NTEGlobalLauncher.exe`, helpers `NTEGlobal.exe` /
  `NTEGlobalGame.exe`), China (`NTELauncher.exe`, `NTEGame.exe` — bypass
  forcé `dsound.dll` à cause de l'anti-triche ACE), Taiwan (`NTETWLauncher.exe`,
  `NTETWGame.exe`).
- Un `mod.json` dans le dossier du mod (ou un niveau plus bas) est lu par le
  scan NTE de ZAILON, comme par le mod manager d'Aurora.

## Steam

Un wrapper Steam-safe (voir `tools/steam-wrapper/` et
`docs/steam-wrapper-integration.md`) permet de lancer un jeu moddé via les
Options de lancement Steam (`%command%`) sans que les arguments injectés ne
cassent le lancement.

## Build

```bash
npm run addon:build:official
```

Le package est généré dans `zailon-addons/packages/nte/` et le catalogue
(`zailon-addons/catalog.json`) est mis à jour automatiquement (SHA-256, taille,
version) — la carte passe de « En développement » à « Disponible ».
