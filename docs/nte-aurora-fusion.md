# Fusion Aurora → NTE Support (Neverness to Everness)

Analyse du launcher open-source **Aurora-Launcher** (GPL-3.0,
`crates/shared`, `crates/backend`, `crates/main`, `crates/steam-wrapper`) et de
ce qui a été fusionné dans ZAILON pour rendre les mods NTE réellement
fonctionnels.

## Ce qu'est Aurora

Aurora est un launcher / plateforme de modding léger pour jeux Unreal Engine
« anime » (dont Neverness to Everness) : Rust + Slint, gestionnaire de mods
intégré, moteur d'injection custom **Everlight** (PAK loader), scripts Lua,
gestionnaire de captures d'écran, gestionnaire d'add-ons QoL, métadonnées
`mod.json` (« Display file »).

## Faits établis dans le code source Aurora

### Arborescence d'une installation NTE

- Racine du jeu : `Neverness To Everness/` (dossiers connus : `異環`, `NTE`).
- Binaires : `Client/WindowsNoEditor/HT/Binaries/Win64`.
- Dossier de mods chargé par Everlight : `Client/WindowsNoEditor/HT/Content/Paks/AuroraMods`.
- Marqueurs de validation : les 3 launchers + `Client/WindowsNoEditor/HT/Content/Paks`.

### Layout du gestionnaire de mods (modmanager.rs)

- **Un mod = un sous-dossier** de AuroraMods contenant `.pak`/`.utoc`/`.ucas`.
- **Activation/désactivation** : renommage transactionnel `.pak` →
  `.pak.disabled` (et inversement), avec rollback en cas d'échec. Seul le
  `.pak` est renommé (`TOGGLE_EXTENSION = "pak"`) ; les `.utoc`/`.ucas`
  orphelins rendent l'ensemble inactif.
- **Groupes** : sous-dossiers préfixés `AU GRP - `.
- **Installation atomique** : extraction dans `.aurora-installing-<nom>` puis
  renommage final ; nom en conflit → refusé (« a mod with this name already
  exists ») ; archives protégées par mot de passe détectées.
- **Affichage** : nom = dossier sans le suffixe `_P` ; recherches, filtres
  (état/auteur/personnage/groupe), icônes, vues liste/grille, sélection en
  masse, notes et renommages persistés par chemin.

### `mod.json` (Display file)

Clés insensibles à la casse, BOM toléré, JSON invalide → repli sur le nom du
dossier : `name`, `version` (défaut `1.0.0`), `author` (défaut `Unknown`),
`icon`, et sous `optionals` : `support link` et `custom image url` (schéma
`https://` ajouté si absent).

### Versions et distribution

- `LAUNCHER_MAP` : `NTEGlobalLauncher.exe` → Global ; `NTELauncher.exe` → CN ;
  `NTETWLauncher.exe` → TW. Helpers : `NTEGlobal.exe`/`NTEGlobalGame.exe`,
  `NTEGame.exe`, `NTETWGame.exe`.
- Distribution Epic : `NTEGlobal/EOSSDK-Win64-Shipping.dll` présent → args
  `-AUTH_PASSWORD=1234 -AUTH_TYPE=exchangecode`. CN → bypass forcé
  `dsound.dll` (ACE).

### Steam wrapper (crates/steam-wrapper)

Mini launcher NTE qui démarre Aurora (élevé, « with mods ») ou le launcher du
jeu directement (« vanilla », avec les args de distribution) ; recherche le
launcher NTE par nom contenant `nte` + `launcher`, profondeur 2.

## Ce qui a été fusionné dans ZAILON

1. **`src/lib/nte.ts`** (pur, testé) : versions, distributions, marqueurs,
   chemins AuroraMods/Win64, parseur `mod.json` Aurora, helpers
   `.pak`/`.pak.disabled`, `isNteGame` branché sur la gate `nte.modloader`.
2. **Backend natif (`src-tauri/src/lib.rs`)** :
   - `scan_nte_mods` — scan Aurora (dossier = mod, mod.json, état
     `.pak.disabled`, staging ignoré, .pak lâches tolérés) ;
   - `toggle_nte_mod` — renommage `.pak` ↔ `.pak.disabled` transactionnel ;
   - `nte_game_report` — diagnostic version/distribution/marqueurs/chemins ;
   - `guess_mods_path` — candidat AuroraMods ajouté.
3. **Store** : les jeux NTE (gate `nte.modloader` ouverte) utilisent
   `scan_nte_mods`/`toggle_nte_mod` au lieu du scan/toggle générique, y compris
   l'application d'un profil (`setSelectedProfile`).
4. **UI** : carte « NTE » dans la configuration du jeu (diagnostic, version,
   distribution, boutons AuroraMods / ouvrir le dossier / tester), gated par
   l'add-on.
5. **Add-on NTE** : manifest v1.1.0 (slots `Game.Tools`, `Game.Diagnostic`),
   module enrichi, README documenté.
6. **Steam wrapper** : `tools/steam-wrapper/` (équivalent Rust autonome du
   steam-wrapper-launcher .NET, sans dépendances) + `docs/steam-wrapper-integration.md`.

## Non fusionné (hors périmètre ZAILON, à documenter)

- Le moteur **Everlight** (injection `version.dll`/`dsound.dll`, CHKSUM,
  monitoring) : binaire propriétaire d'Aurora qui charge réellement les .pak
  dans le jeu. ZAILON ne peut pas l'embarquer ; il installe/organise/active.
- Les scripts Lua, la gestion de captures d'écran et le navigateur GameBanana
  d'Aurora (ZAILON a déjà ses propres providers).
- L'interface Slint d'Aurora (ZAILON a sa propre UI).
