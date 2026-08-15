# Finalisation des add-ons officiels (spec §25-59, §65)

## Statut dérivé du catalogue — jamais écrit à la main (§47-49)

La disponibilité d'une carte vient UNIQUEMENT du catalogue
(`zailon-addons/catalog.json`) :

| Catalogue | Carte |
|---|---|
| `package` réel + SHA-256 (officiel) | **Disponible** · [Installer] |
| `package: null` | **En développement** · bouton désactivé |
| `package` déclaré mais irrésoluble / hash manquant | **Erreur** (catalogue incohérent) |

Quand un package est généré, `scripts/build-official-addons.ts` met
automatiquement `package`, `version`, `sha256` et `downloadSize` dans le
catalogue → la carte devient installable à la synchronisation suivante.

## Packages réellement construits aujourd'hui

| Add-on | Statut |
|---|---|
| `official.zailon.frosty` | Disponible (package + SHA-256) |
| `official.zailon.frosty-editor` | Disponible (package + SHA-256) |
| `official.zailon.visual-profiles` | Disponible (package + SHA-256) |
| `official.zailon.discord` | Disponible (package + SHA-256) — première migration réelle hors Core |
| `official.zailon.provider.gamebanana` | Disponible (package + SHA-256) |
| `official.zailon.provider.nexus` | Disponible (package + SHA-256) |
| `official.zailon.provider.curseforge` | Disponible (package + SHA-256) |
| `official.zailon.game.cyberpunk` | Disponible (package + SHA-256) — outils avancés gated |
| `official.zailon.game.nte` | Disponible (package + SHA-256) — backend PAK gated |
| `official.zailon.reshade` | Disponible (package + SHA-256) — section gated (déjà) |
| `official.zailon.artwork` | Disponible (package + SHA-256) — sources gated (déjà) |
| `official.zailon.steam-advanced` | Disponible (package + SHA-256) — détection Steam gated |
| `official.zailon.game.fivem` | Disponible (package + SHA-256) — traitement FiveM gated |
| `official.zailon.importer.mo2` | Disponible (package + SHA-256) — import MO2 gated |
| `official.zailon.importer.vortex` | Disponible (package + SHA-256) — import Vortex gated |
| `official.zailon.performance` | Disponible (package + SHA-256) — priorité processus appliquée |
| `official.zailon.themes` | Disponible (package + SHA-256) — feature presets implémentée |
| `official.zailon.importer.frosty` | Disponible (package + SHA-256) — import installation Frosty gated |

**18/18 Disponibles.** Le dernier add-on, `official.zailon.importer.frosty`,
couvre l'import EN BULK d'une installation Frosty existante (dossier de mods
`.fbmod` détecté → profil de références). Il ne fait pas doublon avec Frosty
Support (`frosty.backend`), qui couvre l'import d'un `.fbmod` isolé, le
runtime et le lancement : l'importer détecte le dossier de mods de Frosty Mod
Manager et crée un profil en références, sans jamais copier ni re-déployer.

### Audit d'intégrité du catalogue (test-addon-catalog-audit.ts)

Invariants vérifiés automatiquement : aucune capacité orpheline, cohérence
catalogue ↔ dossiers, capabilities du manifest repointent vers leur propre
add-on, tout add-on publié déclare une capacité, aucun add-on « En
développement » résiduel, et chaque capacité publiée est réellement exercée
dans le Core (feature removal §57). L'audit a aussi supprimé la capacité morte
`ue.modding` (→ `official.zailon.ue` inexistant) et ajouté les `capabilities`
manquantes des manifests Frosty/Frosty Editor.

### Lot final — 6 add-ons (feature removal §57)

- **ReShade Manager** (`reshade.manager`) : la section ReShade de la
  configuration était déjà gated (`hasReShadeCap`) — package + tests.
- **Artwork+** (`artwork.plus`) : sections Sources/Illustrations déjà gated
  (`hasCap('artwork.plus')` dans Paramètres et dialogue ressources) — package
  + tests.
- **Steam Advanced** (`steam.advanced`) : le bouton de détection, le dialogue
  de scan et l'action store `addDetectedGames` sont désormais conditionnés par
  `steamAdvancedAllowed` — sans l'add-on, le Core ne scanne jamais la
  bibliothèque Steam.
- **FiveM Profiles** (`fivem.profiles`) : la bannière adaptateur et
  l'initialisation de la base neutre (`initializeFiveMBase`) sont gated par
  `fiveMProfilesAllowed` — un jeu FiveM s'importe comme n'importe quel jeu
  sans l'add-on ; l'adaptateur de lancement reste dans le Core.
- **MO2 Importer** (`importer.mo2`) : le bouton « Importer depuis Mod
  Organizer 2 », le dialogue et l'action store `completeMo2Import` sont gated
  par `mo2ImportAllowed` — sans l'add-on, le Core refuse l'import.
- **Vortex Importer** (`importer.vortex`) : **nouvelle vraie feature** — lib
  `vortexImport.ts` (parse défensif de `vortex.deployment.json`, déduplication
  des mods par source, digest), commande native `detect_vortex_instance`
  (manifest + dossier de staging, lecture seule), action store
  `importVortexDeployment` gated et dialogue « Importer depuis Vortex ».
  ZAILON crée un profil de RÉFÉRENCES — Vortex a déjà déployé (hardlink /
  symlink / move), rien n'est re-copié ni re-lié.
- **Theme Packs** (`themes.packs`) : **nouvelle vraie feature** — lib
  `themePacks.ts` (5 presets accent + densité + texte + animations, pur et
  testé) + section « Packs de thèmes » dans Paramètres → Apparence gated par
  la capacité.

- **Performance+** (`performance.plus`) : **nouvelle vraie feature** — la
  priorité du processus du jeu (déjà modélisée par le preset de mode) était
  une valeur purement AFFICHÉE, jamais appliquée à l'OS. L'add-on la rend
  réelle : au lancement, `set_game_process_priority` applique la priorité au
  PID du jeu (`SetPriorityClass` Windows / `setpriority` Unix), gated par
  `performancePlusAllowed`. Jamais « temps réel ».

### Plus aucun add-on « En développement » (18/18 publiés)

Le chantier est clos : les 18 add-ons officiels ont un vrai package + SHA-256,
et chaque capacité est réellement gated dans le Core. Le dernier à migrer,
**Frosty Importer** (`importer.frosty`), couvre l'import EN BULK d'une
installation Frosty existante : commande native `frosty_detect_installation`
(lecture seule du dossier de mods `.fbmod`), gate `frostyImportAllowed`, action
store `importFrostyInstallation` (profil « Frosty — <dossier> » en références,
`sourceProvider: 'frosty'`) et dialogue `FrostyImportDialog`. Il ne fait pas
doublon avec Frosty Support : l'import d'un `.fbmod` isolé reste couvert par
`frosty.backend`.

### NTE Support — migration réelle (feature removal §57)

Deuxième migration « jeu » (la plus fine du catalogue) : le support NTE était
purement déclaratif (descripteur `nte-pak` + détection par marqueurs) sans
capacité exercée. La migration a ajouté :

- le package `official.zailon.game.nte` (capacité `nte.modloader`,
  permissions `game.read`/`game.launch`/`process.read`/`mods.read`/
  `mods.write`, slots `Game.Configuration` + `Game.Mods`) — **Disponible**
  avec SHA-256 réel ;
- **gate pur `nteModsAllowed(capabilities)`** et paramètre `nteAllowed` sur
  `detectModBackend` : sans l'add-on (ou désactivé), un jeu Neverness to
  Everness retombe sur `generic-folder` — plus jamais de classement NTE PAK
  implicite ; les deux call sites de GameConfigurationPanel passent la gate
  (le défaut de la lib pure reste `true` pour préserver les tests existants) ;
- la détection de processus au lancement (`ntegloballauncher.exe` comme stage
  intermédiaire valide, session tracking) reste dans le Core — mécanique de
  lancement, spec « Séparation des responsabilités » §113 ;
- test dédié `test-nte-addon.ts` (gate ×4, catalogue/SHA, manifest) —
  513 tests au total.

### Cyberpunk Advanced — migration réelle (feature removal §57)

Première migration « jeu » : les outils de réparation Cyberpunk étaient
branchés sur le SEUL nom du jeu (aucune gate d'add-on). La migration a
ajouté :

- le package `official.zailon.game.cyberpunk` (capacité
  `cyberpunk.frameworks`, permissions `game.read`/`game.files.write`/
  `mods.read`/`mods.write`/`process.read`, slots `Game.Tools` +
  `Game.Diagnostic` + `Diagnostic.Frameworks`) — **Disponible** avec SHA-256
  réel ;
- **gate pur et testé** `cyberpunkToolsAllowed(capabilities, isCyberpunkGame)`
  : les outils n'existent que pour un jeu Cyberpunk ET avec l'add-on
  installé + activé ;
- **gating UI** : bouton « Réparer les racines Cyberpunk » (onglet Mods),
  `onRepairMo2` (réparation du déploiement MO2) et carte « Réparer RED4ext »
  (Diagnostic → Frameworks) sont tous conditionnés par la gate — plus jamais
  par le seul nom du jeu ;
- la détection de frameworks (RED4ext, redscript, TweakXL, ArchiveXL…) et le
  backend virtuel de lancement restent dans le Core (adaptateur jeu, spec
  « Séparation des responsabilités » §113) : un jeu Cyberpunk se lance et se
  scanne normalement, seuls les OUTILS de réparation disparaissent sans
  l'add-on ;
- test dédié `test-cyberpunk-addon.ts` (gate ×4, catalogue/SHA, garde-fou
  source sur GamesView/GameDiagnosticPanel, manifest) — 507 tests au total.

### CurseForge Provider — migration réelle (feature removal §57)

Dernier du trio des providers : le gating Explorer + la ligne de clé
Paramètres existaient déjà ; la migration a ajouté :

- le package `official.zailon.provider.curseforge` (capacité
  `provider.curseforge`, permissions `network`/`game.read`/`mods.write`/
  `settings`, slots `Explorer.Provider` + `Settings.Provider.CurseForge`) —
  **Disponible** avec SHA-256 réel ;
- test dédié `test-curseforge-provider.ts` (absence → rien nulle part, package
  réel, manifest correct) — ferme le trio providers GameBanana / Nexus /
  CurseForge.

### Nexus Provider — migration réelle (feature removal §57)

Comme GameBanana, le gating existait (Explorer filtré par capacité, section
Paramètres gated) ; la migration a ajouté :

- le package `official.zailon.provider.nexus` (capacité `provider.nexus`,
  permissions `network`/`game.read`/`mods.write`/`settings`, slots
  `Explorer.Provider` + `Settings.Provider.Nexus`) — **Disponible** avec
  SHA-256 réel ;
- **ligne de fournisseur individuelle** : la saisie de clé Nexus ne s'affiche
  plus dans « Fournisseurs de mods » sans l'add-on Nexus (avant, toute
  capacité provider montrait les lignes Nexus + CurseForge) — idem CurseForge
  quand il sera migré ;
- test dédié `test-nexus-provider.ts` (absence → rien nulle part, package
  réel, manifest correct).

### GameBanana Provider — migration réelle (feature removal §57)

Le gating Explorer existait déjà (spec §21-24 : seuls les providers dont
l'add-on est installé ET activé existent — liste des sources filtrée, effets
coupés, zéro requête distante). La migration a donc consisté à :

- créer le package `official.zailon.provider.gamebanana` (capacité
  `provider.gamebanana`, permissions `network`/`game.read`/`mods.write`, slot
  `Explorer.Provider`) — **Disponible** avec SHA-256 réel ;
- vérifier qu'aucun appel au client GameBanana n'existe hors de l'UI gated
  (recherche/refresh/téléchargement ne sont atteignables que via Explorer) ;
- test dédié `test-gamebanana-provider.ts` (absence → pas de source, package
  réel, manifest correct).

Le client GameBanana reste dans le Core mais n'est appelé QUE par l'UI gated —
même modèle que Visual Profiles et Discord Presence.

### Discord Presence — migration réelle (feature removal §57)

Premier add-on migré hors du Core avec gate de fonctionnalité complète :

- **Capacité** `discord.presence` → `official.zailon.discord` (`addonGating.ts`) ;
- section Paramètres Discord déjà gated (`hasCap('discord.presence')`) ;
- panneau rapide : état Discord **non émis** sans l'add-on, actions
  `set-discord` / `open-discord-settings` **ignorées** ;
- store : `syncDiscordPresence` refuse de publier sans la capacité (même si le
  réglage est resté activé) et **nettoie** la présence à la désinstallation /
  désactivation en pleine session (`discordPresenceAllowed`, pur et testé) ;
- test dédié `test-discord-feature-removal.ts`.

Le pont natif RPC reste dans le Core mais n'est plus jamais appelé sans
l'add-on (même modèle que Visual Profiles).

**Règle §55** : un package ne devient pas « Disponible » uniquement pour
supprimer le texte « En développement » — il doit contenir un manifeste, un
entrypoint et une vraie implémentation minimale.

## Corrections apportées

1. **Plus jamais de badge « Local » sur un officiel** (§42) : le catalogue
   embarqué est normalisé via `parseAddonCatalog` (official: true, SHA validé) —
   il se comporte exactement comme le catalogue distant.
2. **Dépendances lisibles** (§52-53) : chip « Nécessite Frosty Support ⓘ » sur
   la carte (nom humain, ids dans le tooltip) ; le dialogue d'installation
   propose toujours « Installer aussi : … ».
3. **Filtres de statut** (§65) : Tous / Installés / Disponibles / Mises à jour /
   En développement.
4. **Permissions** (§50) : icône 🔐 + nombre avec popover des libellés.

## Migration terminée (§56-57)

Les 18 add-ons officiels sont publiés : Discord Presence, Nexus/GameBanana/
CurseForge providers, Visual Profiles, Cyberpunk Advanced, NTE Support,
Performance+, ReShade, Artwork+, Steam Advanced, FiveM, Theme Packs, MO2,
Vortex et Frosty Importer ont chacun un package + SHA-256 et une capacité
réellement exercée dans le Core, avec le « feature removal test » (§57) :
désinstaller l'add-on fait disparaître la fonctionnalité réelle (réglages,
panneaux, chargements), vérifié par `test-addon-catalog-audit.ts`.
