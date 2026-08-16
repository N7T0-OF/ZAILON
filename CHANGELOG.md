# Changelog

## [1.133.0] - 2026-08-16

> **Import du temps de jeu Steam** : le compteur ne repart plus de zéro —
> ZAILON lit l'historique Steam en lecture seule (localconfig.vdf) et l'affiche
> SÉPARÉMENT du suivi ZAILON, jamais fusionné.

### Added

- **`steam_playtime` (natif Rust)** : parse `localconfig.vdf` via
  `keyvalues-parser` (le même parseur que `steamlocate`), extrait
  `PlaytimeForever` en **minutes** par AppID, tous comptes `userdata/*`
  confondus (MAXIMUM par AppID, jamais de double comptage). Lecture seule —
  aucune écriture dans Steam, aucun compte, aucune API key.
- **`parse_steam_localconfig_playtime`** : parseur pur + 2 tests unitaires Rust.
- **`playtimeImport.ts` (pur, testé)** : `combinedPlaytimeMin`,
  `applySteamPlaytime` (renseigne `importedPlaytimeMin`, ne touche JAMAIS
  `totalPlaytime`), `importedTotals`.
- **Page Statistiques** : bouton « Importer Steam », bandeau « Temps Steam
  importé : X sur N jeux — jamais fusionné », badge `Steam +Xh` sur chaque jeu
  du classement et détail « Steam importé » dans la vue par jeu.

### Notes

- **Epic** : pas d'import activé — Epic ne stocke pas le temps localement de
  façon fiable (données cloud). Le champ `externalPlaytimeSource` est prêt
  (`epic`/`gog`) pour la suite.

## [1.132.0] - 2026-08-16

> **Démarrage allégé — vues chargées à la demande** : les vues lourdes
> (Frosty Editor, Visual Profiles, Statistiques, Add-ons, Explore, News) ne
> sont plus parsées/exécutées au démarrage — uniquement quand l'utilisateur
> y navigue.

### Added

- **Code-splitting des vues lourdes** (`React.lazy` + `Suspense` dans
  `AppWindow`) : `FrostyEditorView` (89 ko), `VisualProfilesPage` (42 ko),
  `ExploreView` (70 ko), `AddonsView` (36 ko), `StatisticsView` (19 ko) et
  `NewsView` deviennent des chunks séparés, chargés à la première navigation.
  C'est le pendant UI de l'exigence « zéro coût de startup » : aucun code
  Frosty/Visual/Stats/Add-ons n'est chargé tant qu'on n'y va pas.
- **`SteamDetectionDialog` lazy** : son code n'est chargé qu'à la première
  ouverture de la fenêtre « Bibliothèque locale ».
- **Fallback Suspense** minimal (spinner + « Chargement… ») pendant le
  chargement différé.
- **Switch uniforme** : « Installer les dépendances » (Add-ons) utilise
  `ZailonSwitch` au lieu d'une checkbox brute.

### Optimized

- Bundle initial réduit : les 6 vues secondaires (~260 ko minifiés) sortent du
  chunk principal, parsées seulement à la demande.

## [1.131.0] - 2026-08-16

> **Groupes épinglés en tête de bibliothèque** : les groupes épinglés
> apparaissent désormais en bandeau compact au-dessus de la grille de jeux,
> dans tous les filtres (pas seulement la vue « Groupes »).

### Added

- **Bandeau « Groupes épinglés »** dans la Bibliothèque : cartes compactes
  (nom, nombre de jeux, temps total) au-dessus de la grille, clic → vue
  Groupes. Les membres restent individuellement accessibles — jamais fusionnés.
- **`pinnedGroupsFirst` (pur, testé)** : épinglés d'abord (ordre déclaré),
  puis les autres — réutilisé par la vue Groupes et le bandeau.

## [1.130.0] - 2026-08-16

> **Statistiques par groupe** : la page « Temps de jeu & sessions » agrège
> désormais les groupes de jeux — temps et sessions des membres, jamais
> fusionnés par profil, avec détail membre au clic.

### Added

- **Section « Groupes »** dans Statistiques : classement visuel (temps total,
  barre, nombre de jeux/profils/sessions, badge « En cours »), ouvert au clic
  pour voir la **contribution distincte de chaque membre** (jamais fusionnée).
- **`perGroup` (pur, testé)** dans `sessionStats.ts` : somme du temps/sessions
  des membres d'un groupe, groupes vides ignorés, triés par temps décroissant.

## [1.129.0] - 2026-08-16

> **Raccourcis multi-profils** : la micro-fenêtre « Créer un raccourci bureau »
> crée désormais **un .lnk par profil** en une seule action — `Cyberpunk 2077 —
> Modded.lnk` et `Cyberpunk 2077 — Vanilla.lnk` restent distincts.

### Added

- **Sélecteur de profil cible** dans la micro-fenêtre : Profil actuel / Profil
  par défaut / **Tous les profils** — « Tous » produit un raccourci par profil,
  jamais fusionnés.
- **Nom de fichier suffixé par profil** dès qu'un jeu a plusieurs profils
  (`Jeu — Profil`) — chaque raccourci lance son profil via l'URI
  `zailon://launch/game/<id>?profile=<pid>`.
- **Résumé de création multiple** : liste des raccourcis créés (nom, chemin,
  méthode) + « Ouvrir le dossier », et erreurs listées par profil en cas d'échec
  partiel.
- `shortcutPlanFor` (pur, testé) : plan de création (périmètre → liste
  profil/displayName), indépendant du disque.

## [1.128.0] - 2026-08-16

> **Fix raccourci bureau** : un vrai raccourci système vérifié (`.lnk` Windows
> avec cible, arguments, répertoire de démarrage et icône — jamais un simple
> `.url`), avec choix de la méthode : via ZAILON (chaîne Frosty/FiveM/NTE
> conservée, profil inclus) ou lancement direct pour les processus directs.

### Added

- **Micro-fenêtre « Créer un raccourci bureau »** (config jeu + menu contextuel) :
  « Lancer avec le profil actuel » (sinon profil par défaut), méthode
  (via ZAILON recommandé / lancement direct quand compatible), « Utiliser
  l’icône du jeu ».
- **Vérification post-création** : fichier écrit non vide, cible résolvable,
  icône présente — en cas de problème, « Impossible de créer le raccourci »
  avec la raison exacte.
- **Résultat structuré** (`ShortcutCreationResult`) : chemin réel, mode effectif
  et message — affiché dans la micro-fenêtre avec « Ouvrir le dossier ».

### Changed

- **Mode `direct`** : le `.lnk` cible l’exécutable RÉEL du jeu (double-clic
  direct). Un jeu à chaîne de lancement (Frosty/FiveM/NTE/Steam) ou sans
  exécutable vérifiable retombe automatiquement sur **via ZAILON** — la chaîne
  est conservée, jamais de raccourci cassé.
- **Icône** (ordre) : icône de l’exécutable → icône enregistrée (PNG enveloppé
  en .ico) → icône ZAILON. Plus de raccourci blanc générique.
- Les boutons « Créer sur le bureau » et « Créer un raccourci bureau » ouvrent
  la même micro-fenêtre au lieu d’une alerte.

## [1.127.0] - 2026-08-16

> **Pipeline YouTube → cache local** : un lien YouTube de l'Accueil n'est plus
> seulement collé dans le lecteur embarqué — il est résolu en fichier MP4 local
> (yt-dlp), mis en cache dans `media/backgrounds/`, puis lu **hors-ligne**, sans
> re-téléchargement à chaque lancement. Sans yt-dlp, repli honnête sur le
> lecteur embarqué.

### Added

- **`resolve_youtube_video` (natif)** : télécharge la meilleure vidéo MP4 + une
  vignette dans `media/backgrounds/video_<id>.mp4`, avec pipeline
  « Validation → Identification → Téléchargement → Cache → Vérification » et
  trois statuts explicites (`cached` / `ytdlp_missing` / `failed`).
- **`backgroundMediaCache.ts` (pur, testé)** : manifeste de cache, noms de
  fichiers stables (`video_<id>.mp4` / `thumbnail_<id>.jpg`), déduplication,
  taille agrégée, éviction LRU et validation d'une entrée.
- **`localPath` prioritaire** : le fichier local mis en cache prime sur la
  vidéo de ressources dans l'Accueil et la config — le lien YouTube ne devient
  jamais le lecteur.
- **États du pipeline dans l'UI** (config jeu + « Changer l'apparence ») :
  étapes de progression, « ✓ lecture locale hors-ligne » après cache, repli
  expliqué avec lien d'installation yt-dlp si absent.

### Changed

- Le bouton « Utiliser comme fond » passe en « Téléchargement… » pendant la
  résolution (non bloquant) et désactive le double-clic.

## [1.126.0] - 2026-08-16

> **Statistiques premium + renommage des jeux + chaîne FiveM** : la page
> Statistiques devient une vitrine visuelle (totaux, classement avec
> couvertures, activité récente, détail par jeu/profil), un jeu peut être
> renommé sans casser son identité technique, et la détection FiveM suit le
> processus GTA V final (jamais FiveM.exe seul).

### Added

- **Statistiques « premium »** : grandes cartes de totaux, classement
  « Jeux les plus utilisés » avec couverture + barre, section « Activité
  récente » avec couvertures, et **détail par jeu** (cette semaine, ce mois,
  sessions, dernière session, activité 7 jours, répartition par profil).
  Jeu et profil restent deux niveaux distincts (Cyberpunk 142 h → Default
  96 h, Modded 31 h…).
- **Renommage d'un jeu** : champ `displayName` (cosmétique) — l'identité
  technique (`id`, exécutable, chemins, mods, profils, add-ons, stats)
  n'est jamais modifiée. Bouton crayon dans l'en-tête du jeu + menu
  contextuel de la Bibliothèque (« Renommer… », « Réinitialiser le nom »).
- **Menu contextuel Bibliothèque élargi** : Ouvrir, Changer de profil,
  Renommer, Favoris, Voir les statistiques, Configuration, Changer
  l'apparence, Ouvrir le dossier, Retirer de ZAILON.
- **Chaîne de lancement FiveM** : le processus final surveillé est GTA V
  (`GTA5.exe` / `GTA5_Enhanced.exe` / `CitizenFX.exe` / `FiveM_GTAProcess.exe`),
  jamais `FiveM.exe` seul — FiveM peut rester ouvert après la fermeture du
  jeu, la session se termine quand GTA se ferme.

## [1.125.0] - 2026-08-15

> **Harmonisation Accueil / config jeu** : widget son en haut à droite,
> bulle « Historique » masquée quand vide, sections de config réduites par
> défaut.

### Fixed

- **Bulle « Historique » toujours affichée même vide** : elle disparaît
  maintenant complètement quand aucune tâche active (téléchargement, scan,
  déploiement) ni notification n'est en cours — elle apparaît discrètement
  dès qu'une tâche démarre et disparaît à la fin (spec §1).

### Changed

- **Widget son de l'Accueil déplacé en haut à droite**, juste sous les
  boutons d'action (Paramètres du jeu · Actions du jeu) — compact, lié
  uniquement à la vidéo de fond (jamais au volume Windows), état (volume /
  mute) conservé après Alt+Tab (spec §2).
- **Sections de configuration réduites par défaut** : seul « Lancement »
  (exécutable + dossier mods, essentiel à la première configuration) est
  ouvert ; « Apparence » et toutes les sections secondaires démarrent
  repliées, l'état ouvert/fermé étant mémorisé par jeu (spec §3).

## [1.124.0] - 2026-08-15

> **Détection locale unifiée** : la fenêtre « Bibliothèque locale » devient un
> service Core partagé — le « + » de la barre latérale, « Détecter » de la
> Bibliothèque, l’Accueil et la palette ouvrent exactement la même fenêtre.

### Fixed

- **« Détecter » ne fait plus un scan silencieux en arrière-plan** : sans
  l’add-on Steam Advanced, le bouton lançait `addDetectedGames` dans le
  vide (aucune fenêtre affichée, aucun retour). Il ouvre désormais toujours
  la fenêtre « Bibliothèque locale » (spec §6).
- **Le « + » de la barre latérale ouvrait un file picker** (système différent
  de « Détecter »). Il ouvre maintenant la même micro-fenêtre (spec §5) :
  choix rapide/complète → analyse → résultats → sélection → ajout.
- **Accueil et palette unifiés** : « Ajouter », « Détecter » (Accueil) et les
  actions de la palette de commandes ouvrent la même fenêtre partagée — fin
  des « deux systèmes différents ».

### Changed

- La fenêtre est rendue **une seule fois** dans `AppWindow` (portail) et
  pilotée par `discoveryDialogOpen` (état transitoire, jamais persisté).
  HomeView/GamesView n’ont plus d’instance locale.
- La détection locale (Steam, Epic, Registre, FiveM) est un service Core,
  **plus le privilège d’un add-on** : `scan_library` reste accessible sans
  Steam Advanced. Le dialogue est indépendant du gate.

## [1.123.0] - 2026-08-15

> **Mise à niveau Bibliothèque / Add-ons — phase 1** : sauvegarde définitive
> des groupes, bouton Statistiques dans la barre latérale, pastille discrète
> au lieu du texte « Nouveau ».

### Fixed

- **Groupes réellement persistants** : `gameGroups` manquait de `partialize` —
  les groupes étaient perdus au redémarrage (et le `groupId` des jeux purgé
  par la normalisation). Ajouté au partialize : les IDs sont résolus au
  rechargement, jamais des noms (spec §7).

### Added

- **Bouton « Statistiques »** dans la barre latérale (icône graphique) —
  ouvre la vue Temps de jeu & sessions.

### Changed

- **Pastille « Nouveau »** de la barre latérale remplacée par un point discret
  avec info-bulle (spec §9) — les titres restent propres.

## [1.122.0] - 2026-08-15

> **Moteur de chaîne de lancement universel, pur et testé** — la décision
> « launcher qui sort → attendre le processus final » est formalisée pour
> Frosty, NTE, FiveM et les processus directs.

### Added

- **`src/lib/launchChain.ts`** (pur, 6 tests) : `chainAfterLauncherExit`
  (end / wait-for-game / wait-for-elevation), `chainExpectsElevation`,
  `chainAcceptsDetectedGame`, `chainIsDirect` — le même moteur couvre
  Frosty → NFS16.exe, NTE → UAC → NTE.exe, FiveM → GTA5.exe, Steam et les
  processus directs.

### Changed

- **`onGameProcessStopped`** et `sessionLauncherExited` délèguent la décision
  à la lib pure (plus de logique dupliquée dans le store) — comportement
  identique, testé par assertion de source.

## [1.121.0] - 2026-08-15

> **Activation Frosty persistante et transactionnelle** — DatapathFix /
> Launch Platform Plugin sont désormais sauvegardés par jeu + profil et
> rechargés au démarrage ; une activation conflictuelle est refusée.

### Added

- **`applyFrostyPluginToggle` / `frostyPluginConfigKey`** (`src/lib/frosty.ts`,
  purs, testés) : validation AVANT écriture — activer un plugin alors que
  l'autre est actif est refusé (rollback + notification), jamais d'état
  « impossible » écrit silencieusement.
- **`frostyPluginConfig`** (store, persisté) par `gameId:profileId` +
  `setFrostyPluginConfig` transactionnel (notice en cas de rejet).

### Fixed

- **Bug d'activation non persistante** : les switches DatapathFix /
  Launch Platform Plugin étaient des `useState` locaux qui retombaient à
  `false` à chaque ouverture — l'UI montrait « actif » sans jamais sauver.
  Ils sont maintenant branchés sur le store et survivent au redémarrage.

## [1.120.0] - 2026-08-15

> **Suivi de chaîne Frosty** — un jeu Frosty est launcher-based : ZAILON passe
> à « En cours » quand le processus final (NFS16.exe…) est détecté, jamais
> quand FrostyModManager sort ou reste ouvert.

### Added

- **`frostyLaunchAdapter(execPath)`** (`src/lib/launchAdapters.ts`) : adaptateur
  de lancement dérivé du registre Frosty — `ExternalLauncher`,
  `gameExecutableCandidates` = candidats du registre (processus FINAL, jamais
  Frosty), `launchChainStages: ['Frosty', 'Plugin', 'Game']`, rattachement
  180 s.
- **`adapterFor(game)`** reconnaît désormais un jeu Frosty par son exécutable
  (`NFS16.exe`…) avant le repli par nom : `isLauncherBased` devient vrai, la
  session ne se termine plus à la sortie du launcher.

### Changed

- `launchAdapters.ts` importe le registre Frosty (module pur, aucun cycle).

## [1.119.0] - 2026-08-15

> **Recherche globale** — une seule requête en haut de ZAILON trouve jeux,
> applications, profils, mods, groupes et add-ons. Ctrl/Cmd+K, navigation
> clavier, ouverture directe du résultat.

### Added

- **`src/lib/globalSearch.ts`** (pur, testé) : recherche multi-catégorie avec
  score simple (préfixe > mot > sous-chaîne), tri stable, total borné.
- **`GlobalSearch`** : pastille « Rechercher » dans la barre de titre +
  surcouche portail (`document.body`) — ↑/↓, Entrée, Échap. Navigation :
  jeu/app → page jeu ; profil → jeu + profil explicite ; mod → jeu + onglet
  Mods ; add-on → Add-ons ; groupe → Bibliothèque filtrée sur « Groupes ».
- **`libraryFilter` levé dans le store** (persisté) : un résultat « groupe »
  ouvre directement la vue Groupes.

### Changed

- Le filtre Bibliothèque était un état local ; il est désormais partagé
  (store) et survit au changement de vue.

## [1.118.0] - 2026-08-15

> **Sélecteur rapide de groupe sur l'Accueil** — la flèche de changement de
> profil parcourt désormais les profils de TOUS les membres du groupe.

### Added

- **`groupProfilePairs` / `nextGroupProfile`** (`src/lib/gameGroups.ts`, purs
  et testés) : séquence ordonnée de tous les profils de tous les membres d'un
  groupe + profil suivant en boucle — chaque profil garde son jeu d'origine,
  aucune fusion.
- **Flèche de profil de l'Accueil group-aware** : `FiveM — Default →
  FiveM — Graphics → FiveM — ReShade → …` ; un changement de jeu membre
  bascule `selectedGame` puis le profil cible explicite (jamais « dernier
  utilisé »).
- **Label du bouton profil** : affiche `Jeu · Profil` (ex. « FiveM ·
  Graphics ») quand le groupe a plusieurs membres (tooltip du nom complet).

### Changed

- Repli identique à avant pour un jeu sans groupe (boucle sur ses propres
  profils) — aucun comportement régressé.

## [1.117.0] - 2026-08-15

> **Groupes de jeux dans la Bibliothèque** — nouveau filtre « Groupes » avec
> cartes, statistiques agrégées, épinglage et réordonnancement. Les profils,
> mods et statistiques des membres restent totalement indépendants.

### Added

- **Filtre « Groupes »** dans la Bibliothèque (à côté de Tous / Jeux /
  Applications / Favoris / Récent), avec compteur.
- **`GroupLibraryGrid`** : cartes de groupes — nom, `X jeux · Y profils ·
  Z mods`, temps total, dernière utilisation, membres, épingle, Ouvrir,
  Modifier, Monter/Descendre, Supprimer (jamais les jeux).
- **`GameGroupDialog`** (créer / éditer) : nom + sélection des membres avec
  recherche — aucun déplacement de fichiers.
- **`GameGroup.pinned`** + actions store `toggleGameGroupPinned` et
  `moveGameGroup` (réordonnancement par tableau, bornes respectées).
- **Statistiques agrégées pures** : `groupProfileCount`, `groupModCount`,
  `groupLastPlayed`, `reorderArray` (`src/lib/gameGroups.ts`, testées).

### Changed

- `reorderArray` partagé entre le store et la grille — l'ordre des groupes
  n'est jamais perdu (spec §12).

## [1.116.0] - 2026-08-15

> **Fenêtre « Nouveautés » restaurée après chaque mise à jour** — y compris
> via l'installeur téléchargé, plus seulement via l'updater interne.

### Added

- **`src/lib/releaseNotes.ts`** (pur, testé) : `parseSemver`, `compareSemver`,
  `shouldShowReleaseNotes` — la décision d'afficher ne dépend plus de
  `lastInstalledUpdate` (renseigné uniquement par l'updater interne), mais de
  `appVersion > lastSeenReleaseNotesVersion`.
- **Commande native `fetch_release_notes(version)`** : lit le corps de la
  release GitHub précise (sans clé API, timeout 15 s) et retourne `None` —
  jamais une erreur bloquante — si hors-ligne, rate-limit ou release absente.
- **Effet démarrage** (`UpdateProvider`) : compare la version installée à la
  dernière vue, récupère les notes et les affiche une seule fois par version.
  En cas d'échec réseau, la fenêtre s'ouvre quand même avec le repli
  « Voir sur GitHub ».

### Changed

- **Déduplication** : `parseSemver` est désormais partagé depuis
  `releaseNotes.ts` (supprimé de la copie locale d'`UpdateProvider`).

## [1.115.0] - 2026-08-15

> **Fix bouton « Détecter » dans la Bibliothèque** — le bouton était un
> no-op silencieux quand l'add-on Steam Advanced n'était pas installé.

### Fixed

- **Bouton « Détecter les jeux installés »** (vue Bibliothèque) : cliquer sans
  l'add-on Steam Advanced ne faisait rien. Désormais il délègue à
  `addDetectedGames()`, qui affiche un message honnête —
  « Détection Steam indisponible : l'add-on Steam Advanced n'est pas
  installé. » — au lieu d'échouer en silence. Avec l'add-on, le comportement
  est inchangé (ouverture de `SteamDetectionDialog`).

## [1.114.0] - 2026-08-15

> **Frosty Importer devient un add-on installable (18/18)** — le catalogue
> officiel est désormais complet : chaque carte correspond à un vrai package
> + SHA-256 et une capacité réellement gated dans le Core.

### Added

- **Commande native `frosty_detect_installation`** (+ helpers purs
  `frosty_mods_candidate_dirs` / `list_fbmods_in`, testés) : détection du
  dossier de mods de Frosty Mod Manager (`%LOCALAPPDATA%\Frosty\Mods`,
  `%APPDATA%\Frosty\Mods`, `~/.config/Frosty/Mods`, + chemins fournis) et
  liste des `.fbmod` (nom, chemin, taille) — lecture seule, jamais d'écriture,
  plafonnée à 1000 entrées.
- **`src/lib/frostyImport.ts`** (pur, testé) : `frostyProfileName` (profil
  « Frosty — <dossier> » dédupliqué).
- **Gate `frostyImportAllowed`** + action store `importFrostyInstallation`
  (gated `importer.frosty`) : profil de RÉFÉRENCES (`sourceProvider:
  'frosty'`) — aucune copie, aucun lien recréé, Frosty Mod Manager reste
  l'unique gestionnaire.
- **`FrostyImportDialog`** + bouton « Importer depuis Frosty » (onglet Mods,
  réservé aux jeux Frosty via `frostyAdapterForExecutable`).
- **Package `official.zailon.importer.frosty`** construit (5,3 Ko, SHA-256
  réel) — **577 tests JS ✅** + 3 tests Rust natifs, tsc ✅, build ✅.

### Changed

- **`test-addon-catalog-audit.ts`** : l'invariant « En développement »
  devient « aucun add-on résiduel » — le catalogue est à **18/18**.
- **`test-official-addons.ts`** : `importer.frosty` rejoint les 17 autres
  ids vérifiés (package versionné + SHA-256 + URL raw).

## [1.113.0] - 2026-08-15

> **Audit d'intégrité du catalogue d'add-ons** — une carte ne ment plus :
> 17/18 Disponibles, aucune capacité orpheline, chaque capacité publiée est
> réellement exercée dans le Core.

### Added

- **`test-addon-catalog-audit.ts`** (6 tests) : aucun add-on orphelin,
  catalogue ↔ dossiers cohérents, capabilities du manifest repointent vers
  leur propre add-on, add-on publié = capacité déclarée, « En développement »
  = exactement `importer.frosty`, et chaque capacité publiée est consommée
  dans le Core (feature removal §57).

### Fixed

- **Capacité morte `ue.modding`** (→ `official.zailon.ue` inexistant) :
  supprimée du `ZailonCapability` et du mapping — fini les capacités fantômes.
- **Manifests Frosty / Frosty Editor** sans `capabilities` : ajout de
  `frosty.backend` / `frosty.editor` — auto-descriptifs comme les 15 autres.
- **575 tests ✅**, tsc ✅, build ✅, audit ✅.

## [1.112.0] - 2026-08-15

> **Performance+ devient un add-on installable (17/18)** — la priorité du
> processus du jeu, jusqu'ici purement affichée, est désormais RÉELLEMENT
> appliquée au lancement (et uniquement avec l'add-on).

### Added

- **Module natif `process_priority.rs`** + commande
  `set_game_process_priority(pid, priority)` : `SetPriorityClass` (Windows,
  NORMAL / ABOVE_NORMAL / HIGH) et `setpriority` (Unix, nice 0 / -5 / -10) —
  jamais « temps réel », échec non critique (test natif du mapping).
- **`src/lib/performancePlus.ts`** (pur, 2 tests) :
  `launchProcessPriority` (suit le preset du mode) et
  `shouldApplyProcessPriority` (auto = ne pas toucher).
- **Application au lancement** (store, gated `performance.plus`) : après
  `launchGame`, la priorité du mode du jeu est appliquée au PID réel — sans
  l'add-on, la priorité reste une valeur affichée, jamais appliquée à l'OS
  (feature removal §57).
- **UI honnête** : Configuration → Performance du jeu affiche « priorité
  appliquée au lancement » avec l'add-on, « non appliquée à l'OS » sans.
- **Add-on `official.zailon.performance`** construit (package + SHA-256 réel)
  — **17/18 Disponibles** — **569 tests ✅**, tsc ✅, build ✅, audit ✅.

## [1.111.0] - 2026-08-15

> **Vortex Importer devient un add-on installable (16/18)** — nouvelle vraie
> feature : lecture de `vortex.deployment.json` et création d'un profil ZAILON
> en références, sans re-copier ni re-lier ce que Vortex a déjà déployé.

### Added

- **`src/lib/vortexImport.ts`** (pur, 5 tests) : `parseVortexDeployment`
  (défensif — chemins normalisés, entrées incomplètes ignorées, jamais
  deviné), `vortexModSummaries` (dédup par source + comptage + méthodes),
  `vortexDeploymentDigest`, `vortexProfileName`.
- **Commande native `detect_vortex_instance`** (binding `native.ts`) : lit
  `vortex.deployment.json` (fallback `.manifest.json`) à la racine du jeu —
  lecture seule — et déduit les mods actifs + le staging
  `Vortex/mods/<instance>` (jamais codé en dur).
- **`importVortexDeployment`** (store, gated `importer.vortex`) : crée un
  profil « Vortex — `<instance>` » dont chaque mod est une RÉFÉRENCE
  (`sourceProvider: 'vortex'`) — aucune copie, aucun lien recréé.
- **Bouton « Importer depuis Vortex »** (onglet Mods, gated) →
  `VortexImportDialog` : détection, liste des mods actifs, import.
- **Add-on `official.zailon.importer.vortex`** construit (package + SHA-256
  réel) — **16/18 Disponibles** — **566 tests ✅**, tsc ✅, build ✅, audit ✅.

## [1.110.0] - 2026-08-15

> **Assistant d'installation FiveM** — dernière étape du support FiveM avancé :
> détection de l'environnement, création de profil (propre ou avec options de
> copie) et état d'initialisation déduit de la structure réelle.

### Added

- **`src/lib/fivemProfile.ts`** (pur, 4 tests) : `fiveMProfileInitState`
  (`ready`/`partial`/`missing`), `fiveMMissingItems`, `fiveMInitLabel`,
  `fiveMCopyActive` et `nextCleanFiveMProfileName` (nom propre sans conflit) —
  FiveM génère lui-même sa structure au premier lancement, ZAILON ne la crée
  jamais de toutes pièces.
- **`createFiveMProfile`** (store) : création d'un profil FiveM avec options de
  copie (config/mods/ReShade/plugins/graphiques) et état `pending` mémorisés
  dans `installOptions` (fivem_copy_*, fivem_init).
- **Bouton « Assistant FiveM »** (onglet Mods, gated `fivem.profiles`) →
  `FiveMInstallAssistant` : détection (FiveM.app, GTA V, dossiers, ini),
  création avec options, état d'initialisation — **560 tests ✅**, tsc ✅,
  build ✅, audit ✅.

## [1.109.0] - 2026-08-15

> **Packs graphiques FiveM — application réelle + rollback** : inventaire natif
> du contenu des archives, installation non destructive (backup avant
> remplacement) avec manifeste `zailon-manifest.json`, et désinstallation
> propre qui ne touche jamais aux fichiers utilisateur.

### Added

- **Commandes Rust** `fivem_pack_scan` / `fivem_pack_apply` /
  `fivem_pack_remove` / `fivem_pack_manifest` (bindings `native.ts`) :
  - `fivemPackScan` : inventaire **réel** des entrées d'un `.zip` (normalisées
    `/`, symlinks et traversée rejetés) — fini l'analyse par nom de fichier ;
  - `fivemPackApply` : extraction **uniquement** des entrées du plan vers
    l'environnement FiveM, sauvegarde de tout fichier existant
    (`<name>.zailon-pack-backup-<ts>`), écriture du manifeste
    `zailon-manifest.json` (`installedAt` + backups) ;
  - `fivemPackRemove` : restaure les backups et supprime **uniquement** les
    fichiers possédés par le manifeste — jamais un fichier utilisateur — puis
    retire le manifeste ;
  - `fivemPackManifest` : état « pack installé » pour l'UI.
- **`FiveMPackDialog`** : cible = environnement FiveM détecté (jamais codé en
  dur), bouton **Installer** (applique le plan), état « pack installé » avec
  **Désinstaller** (rollback), `.rar`/`.7z` → message explicite.
- `packManifestJson` dans `fivemPack.ts` (manifeste sérialisé prêt backend) —
  **555 tests ✅**, tsc ✅, build ✅, audit ✅.

## [1.108.0] - 2026-08-15

> **Configuration par jeu en 3 niveaux** : résolveur pur qui consolide
> profil/ReShade/touches/performance/media sans jamais fuir d'un jeu à
> l'autre, et restauration du dernier profil utilisé à l'ouverture d'un jeu.

### Added

- **`src/lib/perGameConfig.ts`** (pur, 6 tests) : `lastUsedProfileId` (profil
  actif = dernier utilisé → défaut → premier, jamais cross-game),
  `profileBelongsToGame` (garde anti-fuite), `resolveActiveProfile` (sélection
  explicite validée, sinon dernier profil du jeu) et `resolveGameSessionConfig`
  (consolidation des 3 niveaux 🌐 global / 🎮 jeu / 👤 profil).
- **`setSelectedGame`** restaure le **dernier profil utilisé** du jeu
  (spec §4, §12) au lieu de `profiles[0]` — ouvrir un jeu ramène son
  environnement réel, jamais un « Default » générique. Idem pour `removeGame`.
- Test dédié `test-per-game-config.ts` (7 tests dont garde-fou source) —
  **554 tests au total ✅**, tsc ✅, build ✅, audit ✅.

## [1.107.0] - 2026-08-15

> **Game Identity Resolver + configuration par jeu** : identité de jeu
> multi-signaux (provider+AppID, exécutable+chemin, éditeur+nom) — jamais le seul
> nom de l'exécutable — pour ne plus confondre deux installations ni un
> `launcher.exe` générique, avec dédoublonnage des jeux détectés.

### Added

- **`src/lib/gameIdentity.ts`** (pur, testé) : `resolveGameIdentity` (clé stable,
  `kind` jeu/application/launcher/inconnu, `confidence` haute/moyenne/faible,
  signaux réellement utilisés) et `sameGameIdentity` (même jeu via clé ou
  exécutable+chemin normalisés — jamais le seul nom, donc jamais de fusion
  abusive).
- **`Game.identityKey`** persisté : `makeGame` alimente la clé à la création et
  `importDetectedGames` dédoublonne par identité — un même exécutable détecté
  deux fois ne crée plus de doublon, même si le nom affiché a changé.
- Test dédié `test-game-identity.ts` (5 tests) — **547 tests au total ✅**, tsc ✅,
  build ✅, audit ✅.

## [1.106.0] - 2026-08-15

> **Packs graphiques FiveM — analyse + plan** : moteur de correspondance des
> chemins, classification et aperçu du plan sans rien installer.

### Added

- **`fivemPack.ts`** (pure, testé) : `stripCommonRoot` (racine commune
  détectée), `mapPackEntry` (mods/citizen/plugins/reshade-shaders/presets/
  citizenfx — exclusion des fichiers GTA V), `planFiveMPack` (résumé,
  exclusions, fichiers sensibles), `packManifest` / `rollbackPlanFromManifest`.
- **Bouton « Packs graphiques »** (onglet Mods FiveM, gated `fivem.profiles`)
  → `FiveMPackDialog` : import `.zip/.rar/.7z`, analyse **sans rien
  installer**, aperçu des compteurs par famille, exclusion GTA V et fichiers
  sensibles (`.exe`/`.dll`/`.asi`) signalés.
- Test dédié `test-fivem-pack.ts` (6 tests) — **542 tests ✅**, tsc ✅,
  build ✅, audit ✅.

## [1.105.0] - 2026-08-15

> **UI ReShade FiveM** : diagnostic compact + assistant d'ID avec aperçu
> avant/après et écriture avec backup — le flux complet de la spec §8-9, §12.

### Added

- **Bouton « ReShade FiveM »** (onglet Mods d'un jeu FiveM client, gated par
  `fivem.profiles`) ouvrant le dialogue `FiveMReShadeDialog` :
  - **Diagnostic compact** ✓/⚠/✕ : FiveM.app, CitizenFX.ini, dossiers
    mods/citizen/plugins, chemin GTA V (`[Game] IVPath`) et ID ReShade5 ;
  - **Assistant ID** : saisie + **aperçu avant/après** du fichier via
    `setReShade5Id` (lib pure — aucune écriture sans validation) ;
  - **Enregistrer** → `writeCitizenFx` (backup horodaté) ; **Retirer** →
    `removeReShade5Id` (désinstallation propre, autres clés `[Addons]`
    conservées) ;
  - création de la section `[Addons]` si `CitizenFX.ini` est absent.
- Garde-fous source (bouton/dialogue gated, écriture uniquement via lib pure)
  — **536 tests ✅**, tsc ✅, build ✅, audit ✅.

## [1.104.0] - 2026-08-15

> **Backend natif FiveM** : lecture/écriture sécurisée de `CitizenFX.ini` avec
> backup, et détection disque de l'environnement FiveM.

### Added

- **Commandes Rust** `read_citizenfx` / `write_citizenfx` /
  `detect_fivem_environment` (bindings `native.ts`) :
  - `readCitizenFx` : lecture seule du fichier (`exists` + `text`).
  - `writeCitizenFx` : écriture **atomique** APRÈS backup horodaté
    (`citizenfx.ini.zailon-backup-<ts>`) — jamais de réécriture sans backup.
  - `detectFiveMEnvironment` : détection disque de `FiveM.app` (remonte les
    ancêtres — chemin jamais codé en dur), dossiers `mods`/`citizen`/`plugins`
    et chemin GTA V (`[Game] IVPath`, lecture seule).
- Test Rust `citizenfx_iv_path` (parse `[Game] IVPath`, insensible à la casse,
  quotes, jamais de modification) — **534 tests JS ✅**, Verify natif ✅.

## [1.103.0] - 2026-08-15

> **Fondations du support FiveM avancé + groupes de jeux** — libs pures et
> testées pour CitizenFX.ini, la détection FiveM et les groupes.

### Added

- **`citizenfx.ts`** : éditeur sécurisé de `CitizenFX.ini` — lecture `[Game]
  IVPath` (jamais modifié), ajout/mise à jour/retrait de la SEULE ligne
  `ReShade5` dans `[Addons]` (sections, clés et commentaires préservés, aucun
  doublon, section créée si absente).
- **`fivemSupport.ts`** : détection de `FiveM.app`/`CitizenFX.ini` (chemin
  jamais codé en dur), classification de compatibilité ReShade
  (`recommended`/`compatible`/`risky`/`unknown` — jamais « dernière =
  bonne »), et classification de packs graphiques (FiveM/ReShade/GTAV/inconnu
  + fichiers sensibles jamais exécutés).
- **Groupes de jeux** : `Game.groupId` + `GameGroup`, migration **v7**
  (normalisation idempotente), actions store (créer/renommer/ajouter/
  dissocier/supprimer — la suppression ne touche jamais aux jeux), proposition
  de groupe par exécutable partagé (manuelle, jamais auto), stats de groupe
  séparées, et sélecteur « Groupe » sur la page du jeu.
- Test dédié `test-fivem-advanced.ts` (14 tests) — **534 tests au total ✅**.

## [1.102.0] - 2026-08-15

> **Lot final des add-ons officiels** : 6 nouveaux packages installables —
> ReShade Manager, Artwork+, Steam Advanced, FiveM Profiles, MO2 Importer et
> Theme Packs (nouvelle feature presets). 15/18 add-ons Disponibles.

### Added

- **`official.zailon.reshade`** et **`official.zailon.artwork`** : sections
  déjà gated par leurs capacités — packages + tests.
- **`official.zailon.steam-advanced`** : détection/import Steam gated
  (bouton, dialogue, `addDetectedGames` refuse sans la capacité).
- **`official.zailon.game.fivem`** : bannière adaptateur et base neutre gated
  — un jeu FiveM s'importe comme n'importe quel jeu sans l'add-on.
- **`official.zailon.importer.mo2`** : bouton, dialogue et `completeMo2Import`
  gated — le Core refuse l'import MO2 sans la capacité.
- **`official.zailon.themes`** : nouvelle feature — 5 presets
  (accent + densité + texte + animations) dans Paramètres → Apparence,
  lib `themePacks.ts` pure et testée.
- Test dédié `test-batch-addons.ts` (7 tests) — **520 tests au total ✅**.

### Notes

- Vortex Importer, Frosty Importer et Performance+ restent « En
  développement » : aucune feature indépendante dans le Core (pas de package
  fantôme — règle §55). Détails dans `docs/official-addons-migration.md`.

## [1.101.0] - 2026-08-15

> **NTE Support devient un add-on installable** — deuxième migration « jeu » :
> le backend PAK de Neverness to Everness est désormais conditionné par
> l'add-on, plus jamais détecté implicitement par marqueurs.

### Added

- **Add-on `official.zailon.game.nte`** (Disponible, package + SHA-256 réel) :
  capacité `nte.modloader`, permissions `game.read`/`game.launch`/
  `process.read`/`mods.read`/`mods.write`, slots `Game.Configuration` +
  `Game.Mods`.
- **Gate pur `nteModsAllowed`** + paramètre `nteAllowed` sur
  `detectModBackend` : sans l'add-on, un jeu Neverness to Everness retombe sur
  `generic-folder` — plus jamais de classement NTE PAK implicite (feature
  removal §57).
- La détection de processus au lancement (`ntegloballauncher.exe`, session
  tracking) reste dans le Core (mécanique de lancement) : un jeu NTE se lance
  et se tracke normalement, seul le backend PAK disparaît sans l'add-on.
- Test dédié `test-nte-addon.ts` (7 tests) — **513 tests au total ✅**.

## [1.100.0] - 2026-08-15

> **Cyberpunk Advanced devient un add-on installable** — première migration
> « jeu » hors du Core : les outils de réparation Cyberpunk (structure, MO2,
> RED4ext) sont désormais conditionnés par l'add-on, plus jamais par le seul
> nom du jeu.

### Added

- **Add-on `official.zailon.game.cyberpunk`** (Disponible, package + SHA-256
  réel) : capacité `cyberpunk.frameworks`, permissions
  `game.read`/`game.files.write`/`mods.read`/`mods.write`/`process.read`,
  slots `Game.Tools` + `Game.Diagnostic` + `Diagnostic.Frameworks`.
- **Gate pur `cyberpunkToolsAllowed`** : le bouton « Réparer les racines
  Cyberpunk », la réparation du déploiement MO2 et la carte « Réparer
  RED4ext » n'existent que pour un jeu Cyberpunk ET avec l'add-on installé +
  activé — feature removal §57, y compris le défaut (outils désactivés).
- La détection de frameworks et le backend virtuel de lancement restent dans
  le Core (adaptateur jeu) : un jeu Cyberpunk se lance et se scanne
  normalement, seuls les outils de réparation disparaissent.
- Test dédié `test-cyberpunk-addon.ts` (8 tests) — **507 tests au total ✅**.

## [1.99.0] - 2026-08-14

> **CurseForge Provider devient un add-on installable** — le trio des
> fournisseurs de mods est fermé : GameBanana, Nexus et CurseForge sont tous
> les trois des packages officiels hors Core.

### Added

- **Add-on `official.zailon.provider.curseforge`** (Disponible, package +
  SHA-256 réel) : source Explorer CurseForge — recherche, galerie, états de
  mise à jour ; ligne de clé API individuelle dans les Paramètres.
- **Feature removal vérifié** : sans l'add-on, CurseForge n'existe ni dans
  Explorer ni dans les Paramètres (zéro appel réseau au client CurseForge).
- Test dédié `test-curseforge-provider.ts` (5 tests) — **500 tests au
  total ✅**.

## [1.98.0] - 2026-08-14

> **Pipeline d'installation des add-ons durci** — deux bugs réels corrigés :
> « Add-on archive must be a ZIP » (la validation regardait l'extension au lieu
> du contenu) et la version ZAILON figée à 1.69 qui faisait paraître tous les
> add-ons incompatibles.

### Fixed

- **`Add-on archive must be a ZIP`** : `addon_install_staged` exigeait une
  extension `.zip` — or les packages cache sont `*.zailon-addon`. La validation
  se fait sur le CONTENU (magic bytes ZIP `PK\x03\x04`/`PK\x05\x06`/`PK\x07\x08`),
  jamais sur l'extension. `addon_download` refuse aussi les pages d'erreur
  GitHub (content-type HTML/JSON) et tout fichier non-ZIP AVANT écriture.
- **Version ZAILON figée** (`1.69.0`) : `ZAILON_CURRENT_VERSION` est désormais
  dérivée de `package.json` au build — fini les « Nécessite 1.78.0 » alors que
  le launcher affichait 1.69. Test de régression dédié.
- **Refus avant téléchargement** : un add-on incompatible (version, plateforme,
  API) ne montre plus jamais « Installer » — la carte et le dialogue bloquent
  avec la liste des raisons, sans aucun appel réseau.

### Added

- **Installation des dépendances réelle** (§5) : « Installer les dépendances »
  (coché par défaut) installe d'abord chaque dépendance via le même pipeline
  complet (Frosty Support avant Frosty Editor), puis l'add-on.
- **Miroir CDN** (§7) : en cas d'échec de l'URL principale, repli automatique
  sur jsDelivr (`mirrorAddonUrl`, pur et testé) avant d'afficher l'erreur.
- **Erreur explicite « Archive invalide »** : « L'archive de l'add-on est
  invalide ou le téléchargement GitHub n'a pas renvoyé une archive ZIP. »
- Test Rust `zip_magic_detects_real_zips_and_rejects_error_pages` + tests JS
  (classification ZIP, miroir, version réelle) — **495 tests ✅**.

## [1.97.0] - 2026-08-14

> **Nexus Provider devient un add-on installable** — 6 add-ons officiels
> Disponibles ; les lignes de clé API ne s'affichent plus sans leur add-on.

### Added

- **Add-on `official.zailon.provider.nexus`** (Disponible, package + SHA-256
  réel, 6,6 Ko) : source Explorer Nexus Mods — recherche, galerie, états de
  mise à jour, téléchargement ; clé API en coffre système, liens `nxm://`.
- **Lignes de fournisseur individuelles** (§57) : la saisie de clé Nexus ne
  s'affiche plus dans « Fournisseurs de mods » sans l'add-on Nexus (idem
  CurseForge à venir) — fini les champs fantômes.
- Test dédié `test-nexus-provider.ts` (5 tests) — **492 tests au total ✅**.

## [1.96.0] - 2026-08-14

> **GameBanana Provider devient un add-on installable** — le gating Explorer
> existait déjà ; le package réel le rend Disponible (5 add-ons officiels
> installables).

### Added

- **Add-on `official.zailon.provider.gamebanana`** (Disponible, package +
  SHA-256 réel, 6 Ko) : source Explorer GameBanana — recherche jeux/mods,
  galerie paginée, images, états d'installation, téléchargement.
- **Feature removal vérifié** (§57) : sans l'add-on installé ET activé,
  GameBanana n'existe pas dans Explorer (source filtrée, effets coupés, zéro
  requête distante) — test dédié `test-gamebanana-provider.ts` (5 tests),
  **487 tests au total ✅**.

## [1.95.0] - 2026-08-14

> **Discord Presence devient un vrai add-on installable** — première migration
> réelle hors du Core avec gate de fonctionnalité complète (feature removal) :
> sans l'add-on, plus de section Paramètres, plus de contrôle panneau rapide,
> plus aucun appel au pont RPC, et la présence est nettoyée si elle tournait.

### Added

- **Add-on `official.zailon.discord`** (Disponible, package + SHA-256 réel,
  7 Ko) : capacité `discord.presence`, réglages, diagnostic et panneau rapide.
- **Gate de fonctionnalité réelle** (§57) : `discordPresenceAllowed`
  (pur) — le Core ne publie JAMAIS sur l'IPC Discord sans l'add-on installé
  ET activé, même si le réglage utilisateur est resté activé ; désinstallation
  ou désactivation en pleine session → présence nettoyée immédiatement.
- Panneau rapide : état Discord non émis sans l'add-on ; actions
  `set-discord` / `open-discord-settings` ignorées.
- Test dédié `test-discord-feature-removal.ts` (6 tests) — **482 tests au
  total ✅**.

## [1.94.0] - 2026-08-14

> **Add-ons officiels débloqués + profils multi-installation + nettoyage
> Accueil.** Un officiel avec SHA-256 réel s'installe sans signature (la chaîne
> de signature n'est pas encore déployée) ; les cartes ne montrent plus
> « Local » sur un officiel ; « Jeu sélectionné », la barre inférieure globale
> et « En ligne » ont disparu.

### Added

- **Profils multi-installation** (spec §6-16, §60-64) : un jeu = une carte,
  plusieurs installations physiques ; chaque profil référence la sienne
  (`Profile.installationId`), le lancement bascule automatiquement exécutable /
  racine / dossier mods. Section **Configuration → Installations** (ajout par
  choix d'exécutable, renommage, chemins, suppression avec repli sur
  Principal), sélecteur « Installation utilisée » dans l'onglet Profils, badge
  d'installation sur la page jeu. Migration v6 idempotente : chaque jeu avec
  exécutable reçoit « Principal ».
- **Statistiques par installation** (§64) : répartition par installation sous
  chaque jeu (sessions legacy visibles sous le nom du profil — aucune perte).
  Sessions `GameSession`/`TrackedSession` portent `installationId` + snapshot.
- **Filtres de statut Add-ons** (§65) : Disponibles / Mises à jour / En
  développement — le statut vient du catalogue, jamais d'un texte écrit à la
  main.
- Docs : `multi-installation-profile-system.md`, `addon-trust-policy.md`,
  `official-addons-migration.md`, `core-size-after-modularization.md`.

### Fixed

- **Add-ons officiels refusés malgré SHA-256 valide** (§17-24) : la politique de
  confiance n'exige plus de signature pour v1 — SHA-256 + repository officiel +
  manifeste valide = installable. L'absence de signature n'est jamais un motif
  de refus seul.
- **Badge « Local » sur add-ons officiels** (§42) : le catalogue embarqué est
  normalisé (`official: true`) — plus aucun officiel affiché « Local ».
- **Accueil** : « Jeu sélectionné » supprimé (§1) ; **barre inférieure globale
  supprimée** (§2-5, remplacée par les toasts de tâches) ; badge « En ligne »
  retiré (état réseau affiché uniquement là où il perturbe, ex. Explorer).
- **Dépendances lisibles** (§52-53) : chip « Nécessite X ⓘ » sur les cartes
  (nom humain, ids en tooltip).

## [1.93.0] - 2026-08-14

> **Correctif : bouton « Détecter » de la Bibliothèque** — la fenêtre de
> détection ne s'ouvrait plus depuis la grille de la Bibliothèque : l'early
> return de la vue grille court-circuitait le rendu du dialogue (réservé à la
> page jeu).

### Fixed

- **Bibliothèque → « Détecter »** : la fenêtre « Détecter jeux et logiciels »
  (Steam / Epic / Registre / FiveM) s'ouvre désormais depuis la grille — le
  dialogue est rendu dans la branche `gamesBrowsing` aussi (portail React,
  aucun impact layout).

## [1.92.0] - 2026-08-14

> **Zone de notification (tray)** — une icône systray accompagne ZAILON : clic
> gauche = rouvrir la fenêtre (y compris depuis le mode discret), menu Ouvrir /
> Quitter, et un tooltip « ZAILON — <jeu> » qui affiche la session en cours.

### Added

- **Tray icon** (spec §42, §119) : icône en zone de notification sur les trois
  plateformes — clic gauche ramène la fenêtre au premier plan, menu « Ouvrir
  ZAILON » / « Quitter », tooltip piloté par la session prioritaire
  (`set_tray_session`, idempotent — le IPC n'est appelé que quand le libellé
  change). Zéro dépendance ajoutée : feature `tray-icon` de tauri 2.11 (déjà
  résolue dans le lock).

### Changed

- `lib/backgroundTracking.ts` : `traySessionLabel` (« ZAILON — <jeu> » /
  « ZAILON ») — 4 tests mode discret (`test-background-tracking.ts`),
  466 tests au total.
- Docs : `background-tracking-mode.md` — section tray, limites à jour.

## [1.91.0] - 2026-08-14

> **Mode discret : bulle système « ✓ Suivi par ZAILON »** — quand ZAILON
> démarre avec Windows en arrière-plan (fenêtre cachée), le démarrage d'une
> session suivie est annoncé par une vraie notification OS, pas un toast
> invisible dans une WebView cachée.

### Added

- **Notification système de session en mode discret** (spec §120) : en
  `--background`, les débuts de suivi (`started` / `detected` / `recovered`)
  déclenchent une bulle native « ✓ Suivi par ZAILON — <jeu> » — PowerShell
  (Windows, NotifyIcon), `osascript` (macOS) ou `notify-send` (Linux). Même
  réglage que le toast runtime : aucune notification si « En cours via
  ZAILON » est désactivé, jamais pour une fin de session, jamais en fenêtre
  visible.

### Changed

- Décision pure et testée : `lib/backgroundTracking.ts`
  (`shouldNotifyBackgroundSession`, `backgroundSessionNotification`) + 3 tests
  (`test-background-tracking.ts`) — 465 tests au total.
- Docs : `background-tracking-mode.md` — section bulle système, limites à jour
  (le raccourci Quick Panel est déjà actif en mode discret et respecte
  `quickPanelEnabled`, §121).

## [1.90.0] - 2026-08-14

> **Statistiques complètes** — la page Statistiques gagne les onglets Jeux /
> Applications / Tout, les plages 7 jours / 30 jours / Tout avec heatmap des 12
> dernières semaines, la recherche et le tri, l'affichage séparé du temps Steam
> (add-on) — et l'Accueil reçoit le widget « En cours » qui apparaît pendant
> une session active.

### Added

- **Statistiques — vues Jeux / Applications / Tout** (spec §97) : l'onglet
  filtre l'historique entier par type (`itemKind`), totaux et graphiques
  compris — Photoshop ne se mélange jamais avec les jeux.
- **Statistiques — plages et graphiques** (§47-48) : 7 jours / 30 jours en
  barres, « Tout » en **heatmap des 12 dernières semaines** (niveaux 0-4,
  `heatmapCells`, sans bibliothèque graphique).
- **Statistiques — recherche et tri** (§98) : filtre par nom, tri plus joué /
  récent / nom / sessions.
- **Temps Steam séparé** (§96) : si un add-on fournit `steamPlaytimeHours`,
  la ligne jeu affiche « Suivi ZAILON : X · Steam : Y » — jamais fusionné.
- **Widget « En cours »** (§77) : 4ᵉ widget de l'Accueil, rendu uniquement
  pendant une session (session prioritaire, durée en direct, profil, point
  vert, bouton panneau rapide) — aucune case vide quand rien ne tourne.

### Changed

- Moteur pur étendu : `heatmapCells` (semaines, jours futurs omis, niveaux) —
  9 tests de plus (`test-session-stats.ts`, `test-home-widgets.ts`), 462 au
  total.
- Docs : `statistics-engine.md` (phase 3) et `home-widget-system.md` (widget
  session) mis à jour.

## [1.89.0] - 2026-08-14

> **Suivi du temps en arrière-plan** — l'historique des sessions devient
> persistant (checkpoints ~5 min, récupération après crash), le temps de jeu
> est compté même quand un jeu est lancé hors ZAILON, la page Statistiques
> gagne les 7 derniers jours, l'export CSV/JSON et la réinitialisation, et
> ZAILON peut démarrer avec le système en **mode discret** (`--background`,
> fenêtre cachée, seul le tracking tourne).

### Added

- **Moteur de sessions persisté** (spec §34-45, §90) : `sessionHistory` est
  la source de vérité des statistiques (noms jeu/profil en snapshot, source
  zailon/external/recovered). Checkpoints toutes les ~5 min pendant la session ;
  au démarrage, une session interrompue par un crash de ZAILON est récupérée
  avec son dernier checkpoint (jamais de double comptage si le jeu tourne
  encore).
- **Suivi des apps lancées hors ZAILON** (§35-36) : le compteur de session
  démarre aussi quand le jeu est lancé depuis Steam/EA/le Bureau — réglable
  (`trackExternalApps`), désactivable sans couper le suivi des lancements
  ZAILON.
- **Démarrage discret** (§37-42, §114-118) : Paramètres → « Suivi & démarrage
  discret » — suivre le temps, suivre hors ZAILON, démarrer avec le système
  (`set_autostart` natif : registre Windows / LaunchAgent macOS / autostart
  Linux) et démarrer discrètement (`--background` : fenêtre cachée, tracking
  seul ; double-clic = fenêtre ramenée au premier plan). Cohérence imposée
  (discret ⇒ démarrage système).
- **Page Statistiques v2** (§29-32, §46-52) : totaux (session en cours
  incluse), barres des **7 derniers jours**, temps par jeu et par profil depuis
  l'historique, badge « ● En cours », **export CSV/JSON** local et
  **réinitialisation** (par jeu ou tout).

### Fixed

- Les statistiques ne dépendent plus de l'exécution courante : « Cette
  semaine » et les sessions persistent entre les lancements (§46).

### Changed

- Moteur d'agrégats pur et testé : `lib/sessionStats.ts` + 7 tests
  (`test-session-stats.ts`) — fenêtres, par jeu/profil, checkpoints, recovery.
- Docs : `background-tracking-mode.md` créé, `statistics-engine.md` mis à jour.

## [1.88.0] - 2026-08-13

> **Accueil modulaire en widgets configurables** — Favoris / Statistiques /
> Activité deviennent de vrais widgets (activé, ordre, variante), ZAILON
> réorganise la grille automatiquement, un widget désactivé ne coûte rien.
> Nouvelle page Statistiques (par jeu et par profil), Hero corrigé (étoile
> favori, profil rapide ⌃, bloc descendu, plus de « Lancer sans mods »),
> switchs proportionnés, « Launcher Updates » visible par défaut, Bibliothèque
> affiche le temps de jeu, et **Visual Profiles devient un add-on officiel**
> livré avec un vrai package (onglet et backend invisibles sans lui).

### Changed

- **Accueil = widgets** (spec §1-28, §73-90) : `homeWidgets` persisté (id,
  enabled, order, variant, size), moteur de rendu qui n'affiche que les
  widgets activés (aucun trou, §4), presets Minimal/Standard/Complet/
  Personnalisé (§111), bouton « Personnaliser l'Accueil » avec micro-fenêtre
  (toggles, ordre par flèches, variantes, Réinitialiser). Normalisation des
  ids inconnus (add-on désinstallé, §84). Logique pure testée
  (`test-home-widgets.ts`).
- **Hero Accueil** : « Jeu favori » → étoile (§13) ; profil rapide — nom =
  liste complète, flèche = profil suivant en boucle (§16-19) ; bloc Hero
  descendu, relatif au Hero (§14-15, §108) ; `Lancer sans mods` retiré du menu
  contextuel (§20-21).
- **ZailonSwitch** (§66-72) : `flex-none self-center` — le rond ne flotte plus
  dans un conteneur étiré (piste 42×22, thumb 18, translateX calculé).
- **Paramètres** (§62-64) : section « Application updates » ouverte par défaut
  (Launcher Updates visible immédiatement).
- **Bibliothèque** (§53-55) : la vitrine affiche le temps de jeu (« X jouées »,
  « Jamais lancé », « ● En cours · durée ») au lieu de « 0 mods actifs » ; le
  détail garde les mods actifs (§56).

### Added

- **Page Statistiques** (spec §25-52, §29) : totaux (temps total, sessions,
  le plus joué, cette semaine), répartition par jeu ET par profil, données
  100 % locales. Ouverte depuis le widget (footer « Voir toutes les
  statistiques »), sans entrée Sidebar. Vue `statistics`.
- **Widget Favoris** : variante Compact (liste avec temps), plus de
  « 0 actif(s) » (§10-11). **Widget Statistiques** : global, sans
  « 0/0 mods » (§26-28). **Widget Activité** : variante « Dernières actions »
  lisible (§74).
- **Notification Center désactivable partout** (§22-24, §103) :
  `notificationCenterEnabled` — OFF = plus de bouton/badge/rendu ; les erreurs
  critiques restent en dialogue/toast (§23).
- **Add-on `official.zailon.visual-profiles`** (spec §57-61, §101-102) :
  manifest (capacité `visual.profiles`, permission `display.profiles`),
  module lazy, package construit et **Disponible** dans Add-ons. Sans lui :
  pas d'onglet Sidebar, pas d'onglet Visuels, pas de badge visuel, aucun
  appel backend. 3 packages livrés (Frosty Support, Frosty Editor, Visual
  Profiles).

## [1.87.0] - 2026-08-13

> **Suppression totale des GitHub Releases pour les add-ons** — un seul
> repository statique : `catalog.json` (schema 2) + packages versionnés dans
> `zailon-addons/packages/`, téléchargés en direct via raw.githubusercontent.com.
> Plus de release, de tag, de `releases/latest/download`, de resolver de release.

### Changed

- **Modèle de publication** (spec « Simplification totale » §1-7, §46-48) : le
  catalogue référence désormais un chemin RELATIF versionné (`package`), résolu
  en `BASE_URL + package` — jamais une URL construite à la volée depuis l'ID.
  Les champs `release`/`available` et les URLs `releases/...` sont interdits et
  rejetés par le parseur.
- **Catalogue schema 2** (`zailon-addons/catalog.json`, source de vérité
  unique importée par le Core) : `package`, `sha256`, `downloadSize`,
  `installedSize`, `platforms`, `dependencies`, `updatedAt`. Les entrées sans
  package (`package: null`) sont « En développement » — aucun bouton
  Installer, aucune requête 404 (§5, §49).
- **Build automatique du catalogue** (`scripts/build-official-addons.ts`, §19) :
  pack déterministe vers `zailon-addons/packages/<dir>/<id>-<version>.zailon-addon`,
  SHA-256/tailles/version/métadonnées mis à jour automatiquement — plus jamais
  de valeurs éditées à la main. Frosty Support et Frosty Editor sont committés
  avec leurs packages réels (version 1.0.0 dans le nom, §16).
- **Statuts des cartes** (§49) : Disponible / Installé / Mise à jour
  disponible / En développement / Incompatible / Hors connexion / Erreur.
  « Non publié » et « Erreur de publication » (concepts liés aux Releases)
  sont supprimés ; un 404 de téléchargement devient « Package introuvable »
  (§48).
- **Documentation développeur** : bouton 📄 vers
  `zailon-addons/docs/addon-development` dans le même repository (§30).

### Added

- **CI `Validate add-on catalog` renforcée** (§6) : chaque package déclaré doit
  EXISTER dans le dépôt, son manifest interne doit correspondre (ID + version),
  son SHA-256 réel et sa taille doivent être exacts, ses dépendances doivent
  exister — un catalogue cassé fait échouer le pipeline.
- **Hors connexion** (§22) : cartes des add-ons publiés désactivées avec le
  statut « Hors connexion » quand seul le catalogue de référence est servi.
- **`ADDON_REPOSITORY`** centralisé (§3, §25) : owner/repo/branch/préfixe en
  un seul endroit — basculer vers le dépôt autonome `zailon-addons` sera un
  changement d'une ligne.

## [1.86.0] - 2026-08-13

> Add-ons **réellement publiés** : Frosty Support et Frosty Editor passent de
> « Non publié » à **« Disponible »** — les packages `.zailon-addon` sont
> hébergés dans une release dédiée du dépôt ZAILON (`addons-v1.0.0`, tag
> explicite) et le catalogue pointe vers ces assets réels.

### Added

- **Workflow `.github/workflows/release-addons.yml`** (spec §9-11, §37-38) :
  déclenché par un tag `addons-v*` (jamais par `v*`, donc indépendant des
  installateurs) — `npm ci` → build déterministe (`build-official-addons.ts`)
  → validation du catalogue → publication d'une release dédiée avec les
  `.zailon-addon` + `checksums-sha256.txt`. Le dépôt `N7T0-OF/zailon-addons`
  n'existant pas (404), les packages sont hébergés sur `N7T0-OF/ZAILON` —
  structure équivalente documentée dans `docs/addon-release-process.md`.
- **Revalidation du catalogue** (spec §34, §45) : `fetchAddonCatalog` accepte
  un TTL (6 h) et `force` — le bouton « Actualiser » re-fetch toujours ; un
  cache périmé est revalidé au lieu d'être servi indéfiniment. Clé de cache
  bumpée en `v3` : invalide le cache `v2` (URLs `latest/download` et
  `available:false`) qui aurait affiché « Non publié » malgré les releases
  publiées (spec §33).
- **`fetchedAt`** sur le catalogue en cache (enveloppe de cache, spec §35).

### Changed

- **Catalogue** : `official.zailon.frosty` et `official.zailon.frosty-editor`
  passent à `available: true` avec `release.repository` `N7T0-OF/ZAILON` et
  `release.tag` `addons-v1.0.0` (asset exact, SHA-256 réel vérifié par
  `test-official-addons.ts`). Les 15 autres entrées restent « Non publié ».
- **Erreur 404 au téléchargement** : titre « Erreur de publication » (jamais
  « Add-on indisponible ») — un `available: true` dont l'asset est absent de
  la release référencée est une incohérence de publication, pas un add-on
  planifié (spec §20-21).
- **`OFFICIAL_CATALOG_URL`** pointe désormais sur le catalogue committé du
  dépôt ZAILON (`raw.githubusercontent.com/N7T0-OF/ZAILON/main/...`) au lieu
  du dépôt inexistant.

## [1.85.0] - 2026-08-13

> Nouveautés restaurées après chaque mise à jour, audio de l'Accueil
> repositionné au-dessus de Favoris, statuts Add-ons unifiés (un seul statut
> par carte).

### Fixed

- **La fenêtre « Nouveautés » ne revenait plus après une mise à jour** —
  cause racine : `APP_VERSION` était figé à 1.65.0 dans le Core alors que le
  processus de release ne bumpait que package.json/tauri.conf.json, donc
  `lastInstalledUpdate.version` ne correspondait jamais à la version courante.
  Corrigé : la version est désormais lue depuis package.json (source de vérité
  unique bumpée à chaque release). La popup réapparaît à chaque vraie nouvelle
  version, une seule fois (`lastSeenReleaseNotesVersion`), affichée après le
  chargement de l'interface (jamais au boot), scrollable avec header et bouton
  Fermer fixes (spec §1-4, §25-26).
- **Icône audio de l'Accueil trop basse** — le contrôle était positionné en
  absolu (`bottom-3`) sur la page et chevauchait la rangée des panneaux
  (Favoris). Corrigé : rangée alignée à droite **dans le flux**, toujours
  au-dessus de Favoris quelle que soit la hauteur du Hero ; capsule qui
  s'étend vers la gauche (spec §8-13, §27).
- **Doublon de statut « En développement + Indisponible » sur les cartes
  Add-ons** — remplacé par un seul statut principal par carte (spec §14-17) :
  « Non publié » (fiche au catalogue, aucun package téléchargeable), avec
  l'explication dans une bulle ⓘ. Un `available: true` sans release/SHA-256
  réels devient « Erreur de publication », jamais confondu avec un add-on
  simplement non publié (spec §20-21).

### Added

- **Historique des versions** dans Paramètres > À propos : les notes de chaque
  version sont conservées (`releaseNotesHistory`, persisté) et consultables
  dans une modale scrollable après fermeture de la popup (spec §7).
- **Séparation « ZAILON Core » / « Add-ons installés »** dans la popup de mise
  à jour : seuls les add-ons réellement installés sont listés (spec §23-24).
- **Badge « Nouveau » temporaire** sur Add-ons dans la navigation après une
  mise à jour, effacé à la première visite (spec §22).
- **`recordReleaseNotes`** dans le store : API publique pour enregistrer les
  notes d'une version dans l'historique permanent.

## [1.84.0] - 2026-08-13

> Add-ons — **premiers packages officiels RÉELS** : Frosty Support et Frosty
> Editor sont construits, validés et prêts (source `addons/`, pack déterministe,
> SHA-256 enregistré dans le catalogue) — la carte reste « En développement »
> tant que la release GitHub n'est pas publiée (spec §16, §38, §49).

### Added

- **`addons/official.zailon.frosty/`** — premier add-on officiel construit
  (capacité `frosty.backend`) : manifest validé, entrypoint lazy
  (événements OnGameSelected/OnGameStarted, spec §69-71), permissions
  minimales, README, licence MIT, icône.
- **`addons/official.zailon.frosty-editor/`** — premier add-on d'édition
  construit (capacité `frosty.editor`) : slot UI déclaré, dépendance
  `official.zailon.frosty` (§31, §34), lazy loading strict (§3, §116).
  Installé, il active l'espace « Création Frosty » dans la sidebar (gating
  réel déjà en place).
- **`scripts/build-official-addons.ts`** (`npm run addon:build:official`, spec
  §16, §45) : pack déterministe de chaque `addons/<id>/` vers `dist/`, double
  build vérifié octet-à-octet, SHA-256 + taille + bloc `release` affichés.
- **`test-official-addons.ts`** (5 tests) : manifestes valides, pack
  déterministe, archive contenant manifest.json + module, **SHA-256 et taille
  du catalogue identiques au package construit** (§38), `available: false`
  tant que la release n'est pas publiée (§49).

### Changed

- **Catalogue** : Frosty Support et Frosty Editor reçoivent leur `sha256` réel,
  leur taille réelle et leurs métadonnées `release` (tag `frosty-v1.0.0` /
  `frosty-editor-v1.0.0`, asset exact) — `available` reste `false` : passer à
  `true` n'aura lieu qu'une fois les assets uploadés sur GitHub (sinon le
  bouton Installer réintroduirait le 404). `minZailonVersion` aligné sur
  l'historique réel (1.78.0 / 1.79.0).
- **`docs/addon-release-process.md`** : section « Add-ons officiels
  construits » — commandes de rebuild, état exact et action restante
  (upload + `available: true`).


> Add-ons — **fix critique de l'installation** : plus aucune URL `latest/download`
> fabriquée, le catalogue devient la source de vérité (release explicite + asset
> exact), et un add-on sans package publié affiche **En développement** avec un
> bouton Installer désactivé (spec « Fix critique installation add-ons » §2-5,
> §13, §25, §49).

### Fixed

- **404 « Add-on download failed »** : les 17 cartes du catalogue construisaient
  leur URL avec `releases/latest/download/<id>.zailon-addon` — fragile et
  inventée tant que les packages ne sont pas publiés. Corrigé : suppression
  totale de ce schéma (§2-3, §39) ; le catalogue embarque désormais des
  métadonnées de release (repository + tag + asset exact) et l'URL n'est
  résolue qu'à partir d'elles (§5) — jamais dérivée de l'ID.
- **Carte « Installer » trompeuse** : un add-on planifié affichait un bouton
  Installer qui échouait en 404. Corrigé : trois états visibles —
  **Disponible / En développement / Installé** (§26-27). Le bouton Installer
  est désactivé (« Indisponible » + tooltip) tant que `available: false` ou que
  le package réel (release + SHA-256 officiel) n'est pas publié (§13, §49).

### Added

- **`src/lib/official-addon-catalog.json`** — catalogue officiel JSON, source
  de vérité unique importée par le TS (les 17 entrées, toutes `available:
  false` — aucun package publié à ce jour).
- **`resolveAddonDownloadUrl`** (spec §2-5) : construit l'URL uniquement depuis
  `release.repository/tag/asset` ; refuse toute URL `latest/download` et tout
  tag littéralement nommé `latest`.
- **`catalogAddonAvailability`** (§13, §20, §25, §49) : `installable` seulement
  si `available` + release explicite + SHA-256 réel (officiels).
- **`describeAddonDownloadError`** (§23, §40-41) : 404 → « Add-on indisponible »
  sans retry ; 403/429 → « GitHub temporairement indisponible » ; erreur réseau
  → retry. Détails techniques dans le message, actions [Réessayer] [Importer
  manuellement] [Voir la release].
- **CI `Validate add-on catalog`** (§37-38) : `validate-addon-catalog.mjs` — un
  add-on `available` sans release explicite + SHA-256 réel fait échouer le
  pipeline ; aucune URL `latest` autorisée dans le catalogue.
- **`docs/addon-release-process.md`** (§44) + **`scripts/release-addon.ps1`**
  (§45) : processus build → pack → hash → tag → release → catalogue.

### Changed

- `parseAddonCatalog` : `download` devient optionnel, accepte `available` et
  `release` (tag/asset validés, `latest` refusé) — compat avec les catalogues
  distants déjà publiés.
- Cache du catalogue forcé à v2 (invalidation du v1 contenant les URL fragiles,
  §33) ; horodatage « Catalogue mis à jour : il y a X min » (§35).


> Accueil multimédia — **volume et état muet persistants par jeu** (spec §8,
> §50), **politique « toujours démarrer muet » réellement appliquée au boot**
> (§44) et indicateur « son coupé pour cette session » enfin fonctionnel.

### Fixed

- **Boot qui restauré le son** : avec « toujours démarrer muet » (défaut), le
  layer synchronisait `localMuted` vers `resolvedAudio.muted` au montage — un
  unmute persisté (mutedOverride=false) rendait le lancement AUDIBLE au boot,
  contre la politique §44/§50. Corrigé : le boot suit désormais
  `shouldStartMuted` (toujours muet si `bgAlwaysMuted`, sinon intention
  persistée) ; le muet de session ne change plus qu'à la demande de
  l'utilisateur.
- **Indicateur « son coupé pour cette session » mort** : `sessionCut` était
  calculé avec `heroAudio.muted && persistedUnmuted` — deux valeurs exactement
  opposées (`mutedOverride ?? bgAlwaysMuted`), donc TOUJOURS faux. Corrigé :
  l'indicateur lit maintenant l'état de SESSION publié par le layer (muet
  effectif) croisé avec l'intention persistée (non muette) + un fond actif —
  le point ambre apparaît au boot quand l'utilisateur avait activé le son la
  fois précédente.

### Added

- **`shouldStartMuted`** (`src/lib/backgroundMedia.ts`, 2 tests) : politique de
  démarrage — `bgAlwaysMuted` ON → chaque lancement commence 🔇 quelle que soit
  l'intention persistée ; OFF → `mutedOverride` restauré.
- **`effectiveBackgroundVolume`** (1 test) : volume effectif persisté (surcharge
  par jeu sinon défaut global 7 %), extrait de `resolveAudioSettings`.
- **État de session du pont player** (`src/lib/backgroundMediaPlayer.ts`, 6
  tests) : `publishBackgroundPlayerState` / `subscribeBackgroundPlayerState` /
  `backgroundPlayerState` — le Hero affiche la RÉALITÉ (boot muet + bascules),
  pas seulement l'intention persistée ; `setBackgroundSessionMuted` (unmute
  restaure le volume persisté, §50) et `setBackgroundSessionVolume` commandent
  le player sans toucher à la préférence persistée.
- **Toggle « Toujours démarrer muet »** dans Personnaliser l'Accueil
  (ZailonSwitch, `bgAlwaysMuted`) — l'option recommandée du spec §50 était
  définie dans le store sans aucune UI.

### Changed

- `BackgroundMediaLayer` : les commandes `mute`/`unmute` synchronisent
  `localMuted` (l'état de session reste cohérent à chaque bascule) ; l'état
  publié inclut `available` (player monté) — sans source, le Hero retombe sur
  la politique de démarrage.
- `HomeView` : le toggle audio du Hero commande la SESSION via le pont ET écrit
  l'intention persistée (`mutedOverride`) — le slider mémorise `volumeOverride`
  par jeu, restauré quand l'utilisateur réactive le son.


> Accueil multimédia — **vrai correctif du fond YouTube** (deadlock restant de
> la 1.80.0), **reprise sans reload après Alt+Tab** (§51), **dispose du player
> pendant le jeu en mode Performance** (§53) et après longue inactivité (§52),
> indicateur « son coupé pour cette session ».

### Fixed

- **Deadlock YouTube résiduel** : l'iframe n'était montée que quand `videoReady`
  était `true`, or `videoReady` ne devient `true` que via `onReady` de l'iframe
  montée — la vidéo n'était toujours jamais rendue. Corrigé : la source est
  montée **avant** `onReady`, la visibilité suit `videoReady` (fondu 300 ms,
  §28-29).
- **Alt+Tab rechargait la vidéo** (§51) : la perte de focus démontait l'iframe,
  donc chaque retour rejouait le chargement YouTube. Corrigé : le player reste
  **monté** et reçoit `pauseVideo` ; au retour, `playVideo` reprend au même
  point, sans reload. Le démontage n'a plus lieu que sur dispose.

### Added

- **`mediaDisposePolicy`** (`src/lib/backgroundMedia.ts`, 1 test) : pendant un
  jeu, Équilibré/Qualité/Auto/Custom → pause (player conservé) ;
  **Performance/Max → dispose** (player démonté, RAM/GPU libérés, remonté à la
  fin du jeu — spec §53).
- **Dispose après longue inactivité** (§52) : ZAILON en arrière-plan plus de
  3 minutes → le player YouTube est démonté ; au retour il est recréé depuis
  `startSeconds` (reprise approximative).
- **Indicateur « son coupé pour cette session »** dans le Hero : point ambre
  + tooltip quand l'intention persistée est non muette mais que la politique
  §44 a redémarré muet — un clic active le son.

## [1.80.0] - 2026-08-12

> Accueil multimédia — **correction des trois bugs** (spec correctifs §1-55) :
> barre de son qui restait déployée, son perdu après Alt+Tab, et lien YouTube
> reconnu mais jamais réellement appliqué. Cause racine YouTube : `videoReady`
> n'était jamais passé à `true` (seul le ref était rempli sur `onReady`), donc
> le fond vidéo n'était jamais rendu.

### Fixed

- **YouTube réellement appliqué** (spec §17-20, §22-31) : `onReady` →
  `videoReady = true` → l'iframe devient visible après fondu ; erreur
  (non embeddable / supprimée) → état `Error` + fallback image + badge
  « Vidéo indisponible ⚠ » (§26-27) ; l'iframe n'est montée que si le
  `youtubeVideoId` est présent — la source reçoit les commandes par
  `postMessage` ciblé `youtube-nocookie.com` (§39).
- **Alt+Tab — le son revient** (spec §9-13) : perte de focus → suspension
  temporaire (jamais `userMuted` écrasé) ; retour → restauration de
  l'intention utilisateur (muet si muet, volume utilisateur sinon).
  `effectiveVolume` = 0 pendant toute suspension (§12).
- **Barre de son** (spec §1-5, §47-49) : zone hover commune icône + slider +
  capsule, repli après **400 ms** hors de toute la zone, repli immédiat si la
  fenêtre perd le focus, capsule `absolute` flottante — Favoris ne bouge plus.

### Added

- **`src/lib/backgroundMedia.ts`** (9 tests) : machine à états
  (`Inactive/Loading/PlayingMuted/PlayingAudible/SuspendedUnfocused/
  SuspendedGameRunning/Error`, spec §15), session audio avec intention
  utilisateur séparée des suspensions temporaires (§9-11), transitions
  focus/jeu/pause purement testées (scénarios Alt+Tab §16).
- **`src/lib/youtubeUrl.ts` étendu** (13 tests) : `start=`/`#t=15s` →
  `startSeconds`, nettoyage `list`/tracking, export `youtubeEmbedUrl`
  (start-time + `playlist` ignorée).
- **`src/lib/backgroundMediaPlayer.ts`** : pont player unifié — un seul player
  actif, le contrôle du Hero pilote le player du layer via ce pont, jamais de
  player créé dans le render (§22-23, §32).
- **UI** : `HeroAudioControl` refondu (icônes `VolumeX`/`Volume1`/`Volume2`
  selon le niveau), bloc « Fond actuel : **YouTube ✓** » + bouton
  **« Retirer la vidéo »** dans Personnaliser l'Accueil (spec §33-35).

## [1.79.0] - 2026-08-12

> Frosty Editor — **parsing réel du catalogue Frostbite `.cat`** (spec §16) et
> **commande palette dédiée** (spec §72-73). Format vérifié contre la source
> auditée `CatReader.cs` (magic « NyanNyanNyanNyan », entrées Sha1+Offset+Size+
> LogicalOffset+ArchiveIndex) — jamais deviné.

### Added

- **`src/lib/frostyCat.ts`** (6 tests) : parser pur du catalogue Frostbite —
  **format legacy** (NFS 2015 : entrées 32 octets, compteur dérivé) et **format
  moderne** (compteurs explicites, entrées 36 octets, variante avec
  `EncryptedCount` + entrées chiffrées 80 octets pour MEA/FIFA17/FIFA18),
  auto-validé par longueur exacte attendue (ressources + chiffrées + correctifs).
  Ressources → assets (sha1, taille réelle, archive Cas#N) + résumé catalogue.
- **Commande native `frosty_read_cat_file`** : lecture bornée (64 Mo) d'un
  catalogue avec **garde anti-traversal** (chemin relatif validé sous la racine
  du jeu) — test natif `frosty_read_cat_file_rejects_outside_root`.
- **UI Asset Browser** : bouton **« Catalogue (.cat) »** après l'indexation —
  lit tous les catalogues du jeu, parse, agrège les **vraies ressources**
  (badge « Catalogue N ressources · Go · M cas »), bascule Fichiers ⇄ Catalogue.
- **Commande palette éditeur** (`FrostyCommandPalette`, spec §72-73) : Ctrl+K
  (palette dédiée quand l'espace Création Frosty est ouvert — la palette globale
  se désactive sur cette vue), Ctrl+S autosave, Ctrl+B build, Ctrl+P recherche
  d'asset (focus l'Asset Browser), actions Rechercher/Build/Sauvegarder/Exporter/
  Créer/Ouvrir Bibliothèque/Add-ons.

### Validation

- 409 tests ✅ (6 nouveaux). tsc ✅, build ✅, audit accent ✅, rustfmt ✅,
  **Verify natif ✅** (lecture catalogue + garde de chemin).

## [1.78.0] - 2026-08-12

> Frosty Editor — **pont natif vers le runtime Frosty réel** (spec §76-86, §16) :
> détection du runtime officiel, inventaire réel des données du jeu, Worker natif
> (start/status/stop) et index d'assets alimenté par de vraies données. Licence
> toujours respectée : le runtime reste externe, jamais bundle.

### Added

- **Commande native `frosty_detect_runtime`** : détection du runtime Frosty officiel
  (ModManager > Editor > Cmd) dans le dossier du jeu, dossier Frosty, à côté,
  `addon-data/official.zailon.frosty` et chemins fournis — avec helper pur testable
  `find_frosty_runtime_in` (3 tests natifs).
- **Commande native `frosty_scan_game_data`** : inventaire réel des données du jeu
  (Data/, sinon racine) — chemin, taille, mtime, plafonné à 50 000 fichiers pour ne
  jamais saturer le canal IPC (test natif).
- **Worker natif** : `frosty_worker_start` (spawn du runtime officiel en processus
  séparé), `frosty_worker_status` (running + **RAM utilisée** via tasklist Windows),
  `frosty_worker_stop` (kill cross-platform, réutilise `process_is_running`).
- **`src/lib/frostyBridge.ts`** (8 tests) : classification du runtime, versions
  recommandées par jeu, **traduction de l'inventaire réel en index d'assets**
  (classification honnête par extension — jamais inventée), résumé du scan,
  politique de redémarrage après crash natif, arrêt selon le mode performance,
  et vérification « build exige un runtime réel ».
- **UI** : carte **« Runtime Frosty officiel »** dans Création Frosty (détection
  automatique à l'ouverture du jeu, chemin + type + taille), boutons **Démarrer /
  Arrêter le Worker natif** (PID + RAM affichés), et bouton **« Indexer le jeu »**
  dans l'Asset Browser qui remplace les données de démonstration par l'inventaire
  réel scanné (badge « Réel ✓ N fichiers · Go », fallback démo en dev).

### Validation

- 403 tests ✅ (8 nouveaux). tsc ✅, build ✅, audit accent ✅, rustfmt ✅,
  **Verify natif ✅** (4 nouveaux tests Rust : détection, scan réel, pid courant).

## [1.77.0] - 2026-08-12

> Frosty Editor — Asset Browser complet, édition EBX, Plugin Manager, export/import
> de projet `.zailon-frosty-project` et Bulk Export (spec §14-22, §40-45, §107-109).
> Grosse suite : toute la navigation/édition/export du modéliseur est maintenant
> fonctionnelle dans l'espace Création Frosty, toujours 100 % lazy et isolée.

### Added

- **`src/lib/frostyAssets.ts`** (6 tests) : index par jeu (cache gameVersion +
  profileVersion + frostyVersion, §16), ingestion incrémentale + progression
  (§17), recherche par pertinence (exact > préfixe > sous-chaîne) debounced
  (§18), filtres types/bundles, **liste virtualisée par fenêtre** (§15), sélection
  multiple toggle/plage (§46), favoris et historique de recherche (§95-98).
- **`src/lib/frostyEbx.ts`** (8 tests) : arbre de propriétés EBX typées
  (primitives, enums, structs, tableaux, TypeRef/ResourceRef/FileRef/PointerRef),
  **validation par type** avec bornes (§21), diff Original | Modified + revert
  (§22), actions PointerRef (aller à / copier / nouveau panneau, §20) et
  impact analysis des références (§100).
- **`src/lib/frostyPlugins.ts`** (6 tests) : Plugin Manager interne — plugins
  **jamais dans la page Add-ons** (§42), chargement à la demande par type
  d'asset (§43), désactivation après 2 crashs + réactivation (§83), compteurs.
- **`src/lib/frostyProjectFile.ts`** (5 tests) : format `.zailon-frosty-project`
  (§108) — archive ZIP déterministe (project.json + assets.json + checksum) via
  le writer pur, **jamais de caches ni de builds** (§109), import par manifest
  validé, conversion non destructive (§63). Commande native `save_project_archive`
  (écriture atomique temp+rename, test natif).
- **`src/lib/frostyBulk.ts`** (4 tests) : Bulk Export (§44-45) — plan filtré par
  capacités réelles du backend (textures/meshes/audio), noms de sortie,
  progression en arrière-plan, résumé.
- **UI « Création Frosty » enrichie** (`FrostyPanels.tsx`) : Asset Browser
  (recherche, filtres avec compteurs, bundles, historique, sélection, favoris,
  pagination virtuelle), **éditeur EBX** (propriétés typées avec validation,
  diff + revert, PointerRef), Plugin Manager, **Bulk Export** (dialogue avec
  types + dossier + progression) et dialogues **Exporter/Importer projet**.

### Validation

- 395 tests ✅ (34 nouveaux). tsc ✅, build ✅, audit accent ✅, rustfmt ✅,
  test natif `save_project_archive_writes_atomically` (validé par la CI).

## [1.76.0] - 2026-08-12

> Add-on officiel **Frosty Editor** (spec Frosty Editor §1-122) : audit profond de la
> source Frosty locale, architecture « Create » séparée de Frosty Support « Install /
> Apply / Run », Worker isolé, projets/autosave, matrice de capacités par jeu et
> espace Création Frosty dans ZAILON. Licence respectée : aucun code Frosty bundle
> (CC BY-NC-ND 4.0) — le runtime officiel externe est piloté.

### Added

- **Audit complet de la source Frosty locale** (`G:\2_Logiciel\CLAUDE CODE\EXEMPLE\Frosty Editor`) : 8 projets core, 25 profils SDK, 29 plugins, 445 fichiers .cs — 9 rapports `docs/frosty-*.md` (source-audit, source-map, plugin-inventory, license-audit, old-vs-new-architecture, editor-addon-architecture, editor-worker, nfs2015-editor-e2e-test, editor-performance).
- **Add-on `official.zailon.frosty-editor`** au catalogue (dépend de `official.zailon.frosty`, ~52 Mo, catégorie modding) + capacité `frosty.editor` (gating réel).
- **`src/lib/frostyEditor.ts`** (19 tests) : `FrostyProject` (stocké hors du jeu), autosave par snapshots avec rotation, projets récents, matrice `FROSTY_EDITOR_SUPPORT` par jeu (NFS 2015 cible complète), validation avant build (§102), pipeline de build par étapes, estimation de taille, historique de build, **cycle de vie du Worker** (warm timeout 45 s / 5 s / 0, crash de plugin → redémarrage + désactivation après 2 crashs, RAM libérée) et politique de licence stricte.
- **Vue « Création Frosty »** gatée (Frosty Support + Frosty Editor requis) : sélecteur de jeux Frostbite, projets/récents/autosave, matrice de capacités, assets (modifiés/ajoutés/supprimés, notes, favoris), Build & Test avec progression, historique, **Worker avec simulation de crash**, diagnostic compact.
- **Entrée « Création de mods — éditer avec Frosty »** dans la config Frosty des jeux compatibles (bouton « Module disponible » sinon).

### Validation

- 361 tests ✅ (19 nouveaux). tsc ✅, build ✅, audit accent ✅.

## [1.75.0] - 2026-08-12

> Boîte à outils développeur Add-ons (spec §54-56) : template officiel
> `zailon-addon-template`, CLI `zailon addon` (init / validate / pack) et
> documentation complète `docs/addon-development/`. Un développeur peut créer,
> valider et empaqueter un `.zailon-addon` sans toucher au Core.

### Added

- `src/lib/addonZip.ts` : writer ZIP pur et déterministe (pas de fs, testable en
  node) — `buildZip` (CRC-32, dates DOS valides, central directory) et
  `packAddonFolder` (manifest requis + validation avant archivage).
- Template officiel `addon-template/` : manifest valide (passe le valideur réel
  de ZAILON), module SDK d'exemple, icône, locales fr, LICENSE, README.
- CLI développeur `.github/scripts/addon-cli.ts` : `zailon addon init`,
  `zailon addon validate`, `zailon addon pack` (avec scripts npm `addon:*`).
- Documentation `docs/addon-development/README.md` : 14 sections — Getting
  Started, Manifest, SDK, Permissions, Game Adapter, Mod Backend, Provider,
  Theme, UI Extension, Packaging, Testing, Signing, Publishing, Versioning.

### Validation

- 342 tests ✅ (8 nouveaux : ZIP store/déterministe, CRC-32, dates DOS, pack
  avec manifest requis, rejets). tsc ✅, build ✅, audit accent ✅.

## [1.74.0] - 2026-08-11

> Signature Ed25519 des add-ons (spec §14, §52) : au-delà du SHA-256, chaque
> package peut déclarer une signature vérifiée contre le hash réel du fichier.
> Un add-on officiel avec SHA-256 réel mais sans signature est refusé.

### Added

- Commande native `addon_verify_signature` (Rust, ed25519-dalek 2 + base64 0.22) :
  vérifie la signature Ed25519 (base64) du SHA-256 du fichier contre la clé
  publique (32 octets) déclarée par le catalogue.
- Champs `signature` / `signaturePublicKey` dans `AddonCatalogEntry` — le
  parseur refuse une entrée qui n'en déclare qu'un des deux.
- Politique de signature pure (`addonSignaturePolicy`, `hasAddonSignature`,
  `hasRealSha256`) : officiel + SHA-256 réel sans signature → refus ; signature
  déclarée → vérifiée avant installation ; communautaire → facultative (§59).
- Pipeline d'installation : étape de vérification de signature entre le SHA-256
  et l'extraction, avec refus explicite en cas d'échec.
- Dialogue d'installation : ligne d'état de signature (verte / rouge / neutre)
  selon la politique de l'add-on.

### Changed

- Cargo.toml : dépendances `ed25519-dalek = "2"` et `base64 = "0.22"`
  (Cargo.lock synchronisé) ; test natif de vérification/altération + clé de
  mauvaise taille.

## [1.73.0] - 2026-08-11

> Gating natif des services : le Core Rust ne démarre plus Discord, les
> providers, les lectures Nexus ou la recherche d'illustrations sans leur
> add-on installé et activé. La liste des add-ons activés est synchronisée au
> natif à chaque changement — zéro service tournant sans son add-on.

### Added

- `AddonGate` natif (Rust) : état géré de la liste des add-ons activés, poussé
  par le frontend via `set_enabled_addons` au démarrage et à chaque changement
  de la liste (App.tsx).
- Garde `addon_gate_enabled` + erreur explicite sur les commandes natives :
  `set_discord_activity_for`, `test_discord_connection`, `provider_connection_statuses`
  (filtre les providers sans add-on), `test_provider_connection`,
  `nexus_catalog_games`, `nexus_catalog_mods`, `nexus_mod_gallery`,
  `search_game_artwork`, `test_artwork_provider`.
- Test natif `addon_gate_filters_enabled_ids`.

### Changed

- Apparence du jeu : le bouton « Rechercher automatiquement » et les sources
  SteamGridDB/IGDB n'apparaissent que si l'add-on Artwork+ est installé
  (artwork minimal local/Steam sinon — spec §25).

## [1.72.0] - 2026-08-11

> Migration réelle vers l'architecture Add-ons : Discord, Frosty, ReShade et les
> sources Explorer n'existent plus sans leur add-on installé et activé. Fonds
> multimédia retirés de Paramètres > Apparence et déplacés vers l'Accueil
> (contrôle audio par jeu dans le Hero + lien YouTube collable). Paramètres
> compacts au redémarrage, cartes Add-ons allégées.

### Added

- Registre de capacités add-ons (`src/lib/addonGating.ts`) : une fonctionnalité
  n'existe que si son add-on est installé ET activé — règle absolue (§10-24, §74).
- Contrôle audio du Hero (Accueil) : icône 🔇/🔊 + slider discret, persisté par
  jeu (mutedOverride/volumeOverride) — jamais un réglage global.
- Bloc « Fond de l'Accueil » dans Apparence du jeu (depuis le Hero) : type de
  fond par jeu + lien YouTube collable directement (watch, youtu.be, shorts).
- État « Aucune source installée » dans Explorer : sans add-on de provider,
  aucune requête distante, boutons d'ajout vers la page Add-ons.
- Carte « Module disponible » dans Configuration pour Frosty/ReShade éligibles
  sans add-on — « Ajouter à ZAILON » en un clic.
- Badge 🔐 avec popover de permissions sur les cartes Add-ons (permissions au
  clic, jamais sur la carte).

### Changed

- Paramètres > Apparence : bloc « Fonds multimédia de l'Accueil » supprimé — les
  contrôles du fond vivent désormais sur l'Accueil du jeu.
- Sections Discord, Fournisseurs de mods, Illustrations et NXM : affichées
  uniquement avec les add-ons correspondants (les clés stockées restent et
  réapparaissent à la réinstallation).
- Configuration jeu : blocs Frosty/ReShade gatés par add-on — sans add-on, ni
  bouton, ni diagnostic, ni presets (§12-15).
- Explorer : onglets Nexus/GameBanana/CurseForge filtrés par add-ons installés.
- Paramètres : accordéons compacts au redémarrage (état mémorisé par session,
  sessionStorage — §49).
- Cartes Add-ons : texte « installation atomique » répété supprimé (détails dans
  ⓘ Sécurité), description courte + bulle, bouton Documentation remplacé par une
  icône 📄 avec infobulle.

### Removed

- Options globales Fond vidéo / Audio / Volume / Pause des fonds hors de
  Paramètres > Apparence.

## [1.10.0] - 2026-08-08

> Release du lot Refonte UX Phase 1 + Phase 2 partielle : clavier par jeu, fusion
> Configuration, centre de santé + diagnostic, barre de profil, palette Ctrl+K,
> points de restauration, centre Tâches et Activité, et système de Release Notes.

### Added

- Palette de commandes globale Ctrl+K : recherche de jeux, profils, mods et actions
  avec navigation clavier (flèches, Entrée, Échap).
- Points de restauration par jeu : chronologie avec Créer / Comparer / Restaurer /
  Supprimer, création automatique avant lancement (activée par défaut) et
  sauvegarde des profils, touches et apparence sans dupliquer les paquets.
- Timeline « Activité récente » dans l’Aperçu de chaque jeu (5 derniers événements).
- Barre « Santé » en tête de chaque jeu (verdict, frameworks, mods actifs, erreurs,
  avertissements, dernier lancement) avec accès direct à la vérification.
- Nouvel onglet « Diagnostic » par jeu : Résumé, Mods, Frameworks, Déploiement
  (audit réel intégré), Entrées, Performances et Logs réunis en un seul endroit.
- Nouvel onglet « Commandes » par jeu : disposition virtuelle du clavier (QWERTY /
  AZERTY / QWERTZ / Personnalisée) sans ajouter ni modifier aucune langue Windows.
- Profils d'entrée par jeu ou par profil de mods avec presets AZERTY ↔ QWERTY,
  éditeur visuel de traductions de touches, import / export / duplication.
- Feuille de route durable de la refonte UX : `docs/ux-refonte-architecture.md`.

### Changed

- « Téléchargements » devient le centre Tâches et Activité : onglets Tous / En
  cours / En attente / Terminés / Erreurs avec compteurs, filtre par type et
  recherche conservés.
- En-tête de jeu : le profil actif est toujours visible avec ses badges (Stable,
  mods actifs, mises à jour) et un sélecteur rapide en popover (changer, créer un
  profil vide, gérer) sans quitter la page.
- Fusion des onglets par jeu : Apparence, Sauvegardes, Commandes et Paramètres sont
  regroupés dans un nouvel onglet « Configuration » avec cartes pliables
  (Lancement / Apparence / Commandes / Sauvegardes / Compatibilité / Performances),
  état des sections mémorisé et résumé des valeurs effectives en tête.

### Fixed

### Performance

### Security

### Compatibility

### Experimental

### Removed

### Known Issues

### Data

### Technical

## [1.11.0] - 2026-08-08

> Release du lot « UI compacte, nettoyage automatique et remapping par jeu » :
> suppression totale de Liquid Glass, toasts courts, rétention des tâches,
> fusion État & Diagnostic, dossier Bypass/Loader, bulles ⓘ, presets de touches
> et Accueil allégé.

### Added

- « Installer dans… » dans Explorer : choix explicite du jeu et du profil de mods
  cibles avant l’installation d’un mod, indépendamment du jeu sélectionné.
- Historique d’installations par profil : chaque installation depuis Explorer est
  enregistrée et visible dans l’onglet Profils (nom, date, action).
- Filtres Favoris / Récents / Tous dans la Bibliothèque : les favoris passent en
  premier, les récents sont triés par dernière session.
- Bulle d’information réutilisable « ⓘ » (ouverture au survol après ~180 ms,
  Échap / clic extérieur, accessible au clavier) utilisée pour les détails
  techniques au lieu des longs textes.
- Dossier « Bypass / Loader » par jeu (Configuration > Lancement) avec choix du
  dossier et bulle d’aide, pour les jeux qui exigent un loader ou un bypass de
  signature.
- « Chemins additionnels » par jeu : liste nom + chemin + type (Loader, Signature
  bypass, Plugin folder, Script folder, Custom) ajoutable et supprimable.
- Presets de touches groupés « Déplacement uniquement » (Z→W, Q→A, W→Z, A→Q —
  recommandé pour le gameplay) et « Clavier complet » (AZERTY ↔ QWERTY, QWERTZ).
- Dialogue « Tester le remapping » : aperçu de la traduction touche physique →
  touche envoyée, clairement marqué comme aperçu (interception réelle en Phase 2).
- Raccourcis configurables du futur backend de remapping : « Suspendre »
  (Ctrl+Alt+K) et « Tout désactiver / kill switch » (Ctrl+Alt+Backspace).
- Badges contextuels sur l’Accueil (mods actifs, disposition clavier, profil
  visuel) affichés uniquement lorsqu’ils sont réellement actifs.
- Réglages de rétention : « Nombre maximum d’événements » (Activité, défaut 250) et
  « Nettoyage des téléchargements » (à chaque démarrage / 1 jour / 7 jours / jamais).
- Bouton « Tout supprimer » dans Téléchargements : efface l’historique terminé et
  les erreurs, jamais une tâche active ni les mods installés.

### Changed

- Barre d’état : le nom du jeu actif est affiché à gauche avec le profil et le
  nombre de mods actifs, tâches en cours à droite.
- Toasts plus courts : succès et information ~2 s, avertissement ~5 s, erreur ~8 s
  (minuteur suspendu au survol) ; les événements importants restent dans l’historique.
- Nettoyage automatique au lancement : les anciennes tâches terminées sont retirées
  selon la rétention choisie, sans jamais toucher aux tâches en cours ni en attente.
- « État & Diagnostic » fusionne les anciens onglets « Diagnostic », « Vue ZAILON »
  et « Conflits » : sous-sections Résumé / Fichiers / Mods / Frameworks / Conflits /
  Déploiement / Entrées / Performances / Logs. La barre d’onglets du jeu passe de
  10 à 8 entrées.
- Paramètres > Illustrations : le bloc devient un contrôle compact « Images Steam »
  avec bulle ⓘ (les sources non configurées ne sont plus affichées en permanence).
- Accueil : le voile de lisibilité est réduit (la couverture reste nettement
  visible) et les badges d’état sont ajoutés sous le profil.
- Commandes : la « Méthode d’application » affiche l’ordre des backends
  (bindings natifs → layout → remapping limité à la fenêtre → Steam Input → aucune).
- Note spécifique pour Neverness to Everness : Anti-Cheat Expert interdit tout
  hook, injection ou driver ; seule une traduction externe limitée à la fenêtre du
  jeu sera utilisée (à valider sur la vraie version Steam).

### Fixed

### Performance

### Security

### Compatibility

### Experimental

### Removed

- Liquid Glass supprimé totalement (réglage, backend, aperçu, diagnostics, texte
  d’aide et styles CSS associés). ZAILON conserve un thème sombre propre sans
  prétendre offrir une vraie transparence derrière la fenêtre.

### Known Issues

### Data

- Migration : les anciens réglages Liquid Glass encore présents dans le stockage
  local sont ignorés (aucun effet, aucune erreur).

### Technical

- `BackgroundCleanupService` frontend : rétention des tâches appliquée au
  démarrage ; actions `cleanupBackgroundTasks` / `clearBackgroundTasks`.
- Nouveaux champs `Game` : `bypassPath` et `runtimePaths` (chemins additionnels).
- `InfoBubble` (`src/components/UI/InfoBubble.tsx`) réutilisable et accessible.
- Spec durable du nettoyage UI + remapping NTE : `docs/ui-cleanup-and-input-remap.md`.
- Backends d’application du remapping (interception réelle limitée à la fenêtre du
  jeu) : Phase 2, non implémentés — nécessitent des tests sur un vrai jeu.

## [1.12.0] - 2026-08-08

> Release du lot « Densité UI, session en jeu et suivi du stockage » : préférence
> « Réduire les explications », centre Stockage, écran de session, badges runtime,
> effacement de l’historique de notifications et audit de densité automatique.

### Added

- Préférence « Réduire les explications » (Paramètres > Préférences et lisibilité) :
  masque les descriptions secondaires, le détail passe dans les bulles ⓘ.
- Centre « Stockage » dans Paramètres : tailles réelles (paquets de mods, tâches
  conservées, points de restauration), nettoyage de l’historique des tâches avec
  confirmation — jamais un fichier utilisé par un profil, un rollback ou une Collection.
- Écran « Session en cours » sur l’Accueil quand un jeu tourne : profil, disposition
  clavier effective, temps écoulé, état En jeu, et rappel que la restauration est
  automatique à la fermeture du jeu.
- Badges runtime sur l’Accueil : « Bypass / Loader » et « N chemins runtime »
  affichés uniquement quand ils sont réellement configurés.
- « Tout supprimer » dans le centre de notifications (efface l’historique de la
  session, jamais les mods, profils ni points de restauration).

### Changed

### Fixed

### Performance

### Security

### Compatibility

### Experimental

### Removed

### Known Issues

### Data

### Technical

- `npm run audit:ui` : audit automatique de densité UI (blocs > 160 caractères) qui
  produit `docs/settings-density-audit.md` (16 blocs détectés, plan MoveToTooltip / Shorten).
- Rapports du lot consignés : `docs/ui-cleanup-and-input-remap-report.md`,
  `docs/nte-keyboard-remap-test.md` (protocole de validation NTE, Phase 2),
  `docs/history-retention-policy.md`.
- Action store `clearNotificationHistory` pour l’effacement complet de la session de
  notifications.

## [1.13.0] - 2026-08-08

> Release du lot « Phase 3 — Performances » : cache par jeu (compteurs + santé),
> badges d’état instantanés dans la Bibliothèque et sur l’Accueil, et chargement
> par tranches de l’onglet Mods.

### Added

### Changed

### Fixed

### Performance

- GameWorkspaceCache : compteurs de mods par profil et résumé santé mis en cache
  par jeu (localStorage, empreinte + TTL 60 s), rafraîchis en arrière-plan.
  Le sélecteur de profils s’ouvre instantanément même avec de grandes bibliothèques.
- Les cartes de la Bibliothèque et les jeux récents de l’Accueil affichent
  directement l’état (pastille santé et mods actifs) depuis le cache, sans
  calcul au rendu.
- L’onglet Mods charge la liste par tranches (120 mods, puis chargement au
  défilement) : l’ouverture reste instantanée même avec plusieurs centaines de
  mods, et la sélection multiple en shift conserve les indices réels.

### Security

### Compatibility

### Experimental

### Removed

### Known Issues

### Data

### Technical

- Nouveau module `src/lib/workspaceCache.ts` : `getWorkspaceCache`,
  `buildWorkspaceSummary` et le hook `useWorkspaceCache` (calcul lourd hors rendu,
  repli sur le calcul réel si le cache est absent ou expiré).

## [1.14.0] - 2026-08-08

> Release de la Phase 5 « Expérience avancée » : modes Simple/Avancé, recherche de
> réglages, presets de jeu complets et environnement de test de déploiement.

### Added

- Mode avancé (Paramètres > Préférences et lisibilité) : les réglages techniques des
  pages du jeu (dossier Bypass / Loader, chemins additionnels) sont repliés dans une
  section « Avancé » fermée par défaut, et toujours visibles en mode avancé.
- Recherche de réglages dans Paramètres : index des réglages globaux et par jeu
  (ex. « clavier » → Bibliothèque > Jeu > Configuration > Commandes), avec liens
  directs et défilement vers la section concernée.
- Presets de jeu (Configuration > Presets) : un preset regroupe profil de mods +
  disposition clavier + profil visuel. Créer depuis l’état actuel, appliquer en un
  clic, dupliquer ou supprimer — sans dupliquer les fichiers.
- Environnement de test par jeu (Diagnostic > Test) : audit du déploiement en
  lecture seule (aucun fichier modifié, rien à restaurer) + intégrité de l’état sur
  disque, prérequis de configuration, historique des 10 derniers tests avec verdict
  et bouton « Effacer l’historique ».

## [1.15.0] - 2026-08-08

> Release de la Phase 6 — architecture des entrées et lancement multi-étapes :
> ZAILON possède une session de jeu, plus un simple PID.

### Added

- Architecture GameInputBackend (Phase 6, fondation TS) : registre des backends
  (bindings natifs → layout Windows → remapping limité à la fenêtre → Steam Input →
  aucune), plan par jeu avec disponibilité et raisons, sonde Anti-Cheat en lecture
  seule. La chaîne de méthode est affichée dans Configuration > Commandes et le
  diagnostic d’entrée complet (ACE, injection, driver, langue Windows) dans
  Diagnostic > Entrées.
- Conception Rust complète des backends (`docs/input-backends-rust-design.md`) :
  module `input_backends` prêt à poser (registre, plan, sonde NTE) avec tests
  unitaires, et boucle de validation documentée (PR → `verify-native.yml` ou
  machine avec VS Build Tools).
- Système de lancement multi-étapes (`GameSession`) : ZAILON possède une session,
  plus un PID. La fermeture du processus initial (launcher officiel, UAC,
  redirection) ne termine plus la session : elle passe en « En attente du jeu »
  pendant la fenêtre de rattachement, le déploiement reste actif, et le jeu peut
  être rattaché (manuel ou événement natif `game-process-detected`). Adaptateurs
  de lancement par jeu (NTE = Steam + launcher, Cyberpunk = direct, FiveM =
  externe) avec launcher, candidats, fenêtre de rattachement et délai de grâce.
- Accueil : états de session (Launcher ouvert / En attente du jeu avec compte à
  rebours / Jeu non détecté avec « Continuer à attendre » et « Terminer la
  session ») ; Diagnostic > Lancement : méthode, session active, processus final,
  confiance, QWERTY/mods, timeline et sessions récentes ; actions « Attacher au
  jeu en cours » et « Préparer et attendre le jeu ».

### Changed

### Fixed

### Performance

### Security

### Compatibility

### Experimental

### Removed

### Known Issues

### Data

### Technical

- Suivi de progression en 6 phases consigné dans `docs/ux-refonte-architecture.md`
  (Phases 1-4 livrées, Phase 5 en cours, Phase 6 backends Rust NTE).

## [1.16.0] - 2026-08-08

> Release du lancement multi-étapes — UX complète : test de chaîne, banner de
> session, menu Jouer et état UAC, avec le contrat natif consigné.

### Added

- Configuration > Lancement : « Chaîne de lancement » avec test en lecture seule
  (méthode, launcher, candidats du jeu final, cohérence de l’exécutable, verdict
  de compatibilité) — aucun processus lancé, aucun fichier modifié.
- Banner « Launcher en cours / Jeu non détecté » sur la page du jeu avec actions
  Attacher au jeu en cours / Continuer à attendre / Terminer la session.
- Préférence « Attacher automatiquement si détecté » par jeu (Diagnostic >
  Lancement), utilisée par le rattachement natif Phase 6.
- Menu déroulant à côté de « Jouer » sur l'Accueil : Jouer, « Préparer et
  attendre le jeu » (lancement manuel puis attachement) et « Lancer sans mods »
  (profil vide pour diagnostiquer).
- État `WaitingForElevation` (UAC) : quand le launcher demande une élévation, la
  session affiche « Acceptez la fenêtre UAC pour continuer » (Accueil + page du
  jeu) — ZAILON ne contourne jamais l'UAC.
- Contrat natif détaillé dans `docs/multi-stage-launch-system.md` : événements
  (`game-process-detected`, `elevation-requested`, `game-session-ended`), score
  de correspondance (chemin, installation, signature, fenêtre) et signatures
  NTE à mémoriser.

## [1.17.0] - 2026-08-08

> Release du scanner natif de présence : module Rust des backends d'entrée
> (`input_backends`) et détection du processus final pendant la fenêtre de
> rattachement (score de correspondance, énumération Windows), validés par la
> PR #1 sur Windows + Linux.

### Added

- Module Rust `input_backends` dans `src-tauri` (registre, plan par jeu, sonde
  NTE, 5 tests unitaires) — validé par le workflow `verify-native.yml` sur la
  PR #1 (Windows + Linux).
- Tests unitaires frontend `npm run test:input-backends` (8 tests, `node:test`
  sans dépendance) : ordre de priorité, registre, plan NTE/ACE, diagnostic,
  adaptateurs de lancement et repli.
- GamePresenceScanner natif (`process_scanner`) : détection du processus final
  pendant la fenêtre de rattachement — score de correspondance (installation
  +40, candidat +25, launcher +15, contexte +20, seuil auto ≥ 80) avec 6 tests
  unitaires, énumération Windows (Toolhelp + chemin complet) via `windows-sys`,
  commande `scan_game_presence` appelée par l'Accueil pendant l'attente du jeu.

## [1.18.0] - 2026-08-08

> Release du correctif critique du bouton Jouer : SmartPlayButton (un seul CTA),
> suppression des actions manuelles Attacher / Continuer à attendre / Terminer la
> session, GameSessionV2 (la session appartient au jeu, pas au PID),
> GamePresenceEngine avec rattachement automatique des jeux lancés hors ZAILON
> et preuve Steam native (registre RunningAppID, AppID NTE 4508340) — validés
> par la PR #1 sur Windows + Linux.

### Added

- **GameSessionV2 + GamePresenceEngine** : la session appartient au jeu, plus au
  PID. Un jeu configuré lancé hors ZAILON (Steam, launcher externe, redémarrage)
  est rattaché automatiquement (source `external`, mods pré-lancement affichés
  honnêtement comme non préparés) — plus aucun bouton « Attacher ».
- **SmartPlayButton** : un seul CTA par jeu piloté par l'état de session
  (Jouer → Préparation… → Lancement… → Recherche du jeu… → En cours → Réessayer).
  Les actions manuelles « Attacher / Continuer à attendre / Terminer la
  session » sont supprimées de l'interface standard (Accueil + page du jeu) ;
  cliquer sur « En cours » ouvre la confirmation de sortie (Retour au jeu /
  Quitter le jeu, avec confirmation de perte de progression) — jamais une
  seconde instance.
- **Preuve Steam native** (`steam_presence.rs`, validé par la PR #1) : lecture
  seule du registre `HKCU\Software\Valve\Steam\RunningAppID` (AppID NTE
  4508340) — si Steam indique que le jeu tourne alors que ZAILON a perdu le
  processus, ZAILON cherche le processus final au lieu de terminer la session
  (watchdog à attente prolongée).
- **RunningGamesWatcher** : scan périodique léger des jeux configurés sans
  session (autoAttach ou preuve Steam) → rattachement automatique, notification
  « Jeu détecté — session ZAILON récupérée automatiquement ».
- Tests unitaires `npm run test:game-presence` (9 tests, `node:test` sans
  dépendance) : AppID NTE, seuil auto, gating du scan externe, requêtes de
  présence, preuve Steam.
- Docs de conception : `docs/game-session-v2.md`, `docs/smart-play-button.md`,
  `docs/game-presence-engine.md`, `docs/quick-game-panel.md` (conception —
  fenêtre native, pas d'injection), `docs/nte-steam-presence-fix.md`.

### Changed

- `docs/ux-refonte-architecture.md` : roadmap Phase 6 — jalon GameSessionV2 +
  GamePresenceEngine livré (1.18.0).

### Fixed

### Performance

### Security

### Compatibility

### Experimental

### Removed

### Known Issues

## [1.19.0] - 2026-08-08

> Release du watcher de fenêtres natif : la fenêtre principale du jeu est
> désormais une preuve de présence à part entière (visible / premier plan,
> survit aux launchers, aux UAC et aux relances) — validée par la PR #1 sur
> Windows + Linux.

### Added

- **Watcher de fenêtres natif** (`window_watcher.rs`, validé par la PR #1) :
  la fenêtre principale du jeu (EnumWindows, titre, classe, visibilité,
  premier plan) est une preuve de présence indépendante de l'arbre des
  processus — elle survit aux launchers, aux élévations UAC et aux relances
  internes. Scannée en parallèle des processus par le RunningGamesWatcher, elle
  fait passer la session en `GameRunning` dès que la fenêtre est visible
  (score ≥ 80 : installation +40, exécutable +25, visible +10, premier plan
  +5, motif de titre appris +10). Les motifs de titre NTE ne sont jamais
  devinés : `windowTitlePatterns` s'ajoute à l'adaptateur après observation
  réelle.
- Tests : 5 tests unitaires Rust (score de fenêtre, hors-installation ignoré,
  launcher ≠ jeu, motif de titre optionnel) + 2 tests frontend
  `test:game-presence` (requête fenêtre, motifs transmis tels quels).

### Changed

- `docs/game-presence-engine.md` : source de preuve « fenêtre principale »
  implémentée ; `docs/ux-refonte-architecture.md` : roadmap Phase 6 — watcher
  de fenêtres livré (1.19.0).

### Fixed

### Performance

### Security

### Compatibility

### Experimental

### Removed

### Known Issues

### Data

### Technical

> Pendant le développement, chaque changement visible par l'utilisateur est ajouté
> ci-dessous dans la catégorie appropriée (voir `AGENTS.md`). Au moment d'une release,
> cette section est renommée `## [X.Y.Z] - AAAA-MM-JJ` puis une nouvelle section
> `[Unreleased]` vide est recréée. Le workflow GitHub génère automatiquement les
> Release Notes à partir de cette section et refuse de publier si elle est vide.

## [1.20.0] - 2026-08-08

> Release du Quick Game Panel : fenêtre native ZAILON (jamais une injection)
> pour régler visuel et clavier pendant le jeu — validée par la PR #1 sur
> Windows + Linux.

### Added

- **Quick Game Panel** (fenêtre native ZAILON, jamais une injection) :
  `quick_panel.rs` crée à la demande une fenêtre `quick-panel` compacte
  (visuel : activer/désactiver, profils préc./suiv., restaurer ; clavier :
  disposition ZAILON on/off ; ouvrir ZAILON ; fermer), toujours au-dessus,
  sans barre de titre, fermée automatiquement à la perte de focus. Raccourci
  Ctrl+Alt+Z configurable (Réglages > Panneau rapide en jeu, désactivé par
  défaut) ; actions relayées à la fenêtre principale par événements
  (`toggle-keyboard` / `focus-main`). Plein écran exclusif : non pris en
  charge (message à implémenter) — jamais d'overlay injecté.

### Changed

### Fixed

### Performance

### Security

### Compatibility

### Experimental

### Removed

### Known Issues

### Data

### Technical

> Pendant le développement, chaque changement visible par l'utilisateur est ajouté
> ci-dessous dans la catégorie appropriée (voir `AGENTS.md`). Au moment d'une release,
> cette section est renommée `## [X.Y.Z] - AAAA-MM-JJ` puis une nouvelle section
> `[Unreleased]` vide est recréée. Le workflow GitHub génère automatiquement les
> Release Notes à partir de cette section et refuse de publier si elle est vide.

## [1.20.1] - 2026-08-08

> Release du correctif urgent de la fenêtre « Nouveautés de la mise à jour » :
> modale 3 zones (header/body/footer fixes) qui ne déborde plus jamais de
> l'écran, résumé + « Voir tous les changements », toast pour les patchs.

### Added

- Composant réutilisable `ScrollableModal` (3 zones : header/body/footer fixes, max-h responsive, Échap/×/backdrop, verrou du scroll arrière) pour toutes les grandes modales.
- Parser Markdown sûr sans dépendance (`safeMarkdown`) : HTML échappé, liens http(s) uniquement, images bornées — 9 tests unitaires.
- Fenêtre Nouveautés : résumé (~8 changements) + « Voir tous les changements », option « Ne plus afficher automatiquement », failsafe si le contenu échoue, et toast pour les mises à jour mineures (patch) au lieu de la grosse modale.

### Changed

### Fixed

- Fenêtre « Nouveautés de la mise à jour » : la modale ne déborde plus de l'écran ni ne bloque le bouton Fermer avec un long changelog (header et footer toujours visibles, seul le contenu central défile).

### Performance

### Security

### Compatibility

### Experimental

### Removed

### Known Issues

### Data

### Technical

> Pendant le développement, chaque changement visible par l'utilisateur est ajouté
> ci-dessous dans la catégorie appropriée (voir `AGENTS.md`). Au moment d'une release,
> cette section est renommée `## [X.Y.Z] - AAAA-MM-JJ` puis une nouvelle section
> `[Unreleased]` vide est recréée. Le workflow GitHub génère automatiquement les
> Release Notes à partir de cette section et refuse de publier si elle est vide.

## [1.21.0] - 2026-08-08

> Release du Mode jeu ZAILON + détection du plein écran exclusif : activité
> réduite pendant le jeu, auto-minimisation, et message « Utiliser Borderless »
> au lieu d'un panneau rapide qui ne pourrait pas s'afficher — validée par la
> PR #1 sur Windows + Linux.

### Added

- Détection du plein écran exclusif (`exclusive_fullscreen_active`) : au raccourci du panneau rapide, ZAILON affiche « Le panneau rapide n'est pas disponible en plein écran exclusif » avec [Utiliser Borderless] [Fermer] au lieu d'ouvrir une fenêtre qui ne pourrait pas s'afficher (aucune injection).
- Section « Mode jeu » dans les réglages : réduire l'activité ZAILON pendant le jeu (watcher ralenti, animations décoratives suspendues), réduire ZAILON lorsque le jeu démarre, restaurer ZAILON après le jeu — actives par défaut.

### Changed

### Fixed

### Performance

### Security

### Compatibility

### Experimental

### Removed

### Known Issues

### Data

### Technical

> Pendant le développement, chaque changement visible par l'utilisateur est ajouté
> ci-dessous dans la catégorie appropriée (voir `AGENTS.md`). Au moment d'une release,
> cette section est renommée `## [X.Y.Z] - AAAA-MM-JJ` puis une nouvelle section
> `[Unreleased]` vide est recréée. Le workflow GitHub génère automatiquement les
> Release Notes à partir de cette section et refuse de publier si elle est vide.

## [1.21.1] - 2026-08-08

> Release de correctifs : bug bloquant de durée (29770249211h), bouton Jouer
> unique (plus de menu secondaire), et chaîne NTE tolérante à
> `ntegloballauncher.exe` — validée par la PR #1 sur Windows + Linux.

### Added

- `ntegloballauncher.exe` reconnu comme stage launcher valide de la chaîne NTE (jamais le processus final) : +15 au score natif, et la chaîne ne bloque plus un exécutable inconnu situé dans l'installation.

### Changed

- Bouton Jouer simplifié : suppression du menu déroulant secondaire « Préparer et attendre » / « Lancer sans mods » de la page principale — un seul bouton qui gère toute la chaîne en arrière-plan (outils avancés dans Configuration > Lancement et Diagnostic).
- Message « Jeu non détecté » remplacé par « Le jeu n'a pas démarré » avec accès au diagnostic, affiché seulement après épuisement des preuves.

### Fixed

- Bug bloquant de durée : `formatTime` recevait des timestamps epoch (ms) au lieu de minutes → « 29770249211h 15m ». Nouveaux formateurs typés `formatClock` (heure) et `formatElapsedDuration` (durée) avec garde-fous (NaN/Infinity/négatif/absurde → rien d'affiché), 4 tests dédiés.

### Performance

### Security

### Compatibility

### Experimental

### Removed

### Known Issues

### Data

### Technical

> Pendant le développement, chaque changement visible par l'utilisateur est ajouté
> ci-dessous dans la catégorie appropriée (voir `AGENTS.md`). Au moment d'une release,
> cette section est renommée `## [X.Y.Z] - AAAA-MM-JJ` puis une nouvelle section
> `[Unreleased]` vide est recréée. Le workflow GitHub génère automatiquement les
> Release Notes à partir de cette section et refuse de publier si elle est vide.

## [1.22.0] - 2026-08-08

> Release du bloc Cyberpunk RED4ext : déploiement lié à la session (plus au
> PID du launcher), verrou pré-lancement des frameworks, et compteur de mods
> fiable (source de vérité unique) — validée par la PR #1 sur Windows + Linux.

### Added

- Validateur de frameworks pré-lancement (`frameworkValidator`) : Cyberpunk ne se lance plus avec un framework incomplet (plugins RED4ext sans le core red4ext/red4ext.dll, r6/scripts sans redscript, r6/tweaks sans TweakXL, .xl sans ArchiveXL) — lancement bloqué avec un message clair.
- `ProfileStateRepository` (`profileState.ts`) : union des catalogues installé/profil + réconciliation des ids ré-importés — le compteur de mods ne peut plus afficher 0 alors que le déploiement contient des mods.

### Changed

- Déploiement lié à la session, plus au PID : pour un jeu lancé via un launcher intermédiaire, la fermeture du launcher ne démonte plus jamais les mods — restauration à la fin réelle de la session (`restore_deployment_session`) et au GameLost.

### Fixed

### Performance

### Security

### Compatibility

### Experimental

### Removed

### Known Issues

### Data

### Technical

> Pendant le développement, chaque changement visible par l'utilisateur est ajouté
> ci-dessous dans la catégorie appropriée (voir `AGENTS.md`). Au moment d'une release,
> cette section est renommée `## [X.Y.Z] - AAAA-MM-JJ` puis une nouvelle section
> `[Unreleased]` vide est recréée. Le workflow GitHub génère automatiquement les
> Release Notes à partir de cette section et refuse de publier si elle est vide.

## [1.23.0] - 2026-08-08

> Release du bloc X de session + multi-apps actives : session prioritaire,
> indicateur « N en cours » dans le header, confirmation avant quitter/arrêter,
> et un seul mapping clavier actif à la fois — validée par Verify ZAILON.

### Added

- Multi-sessions actives : session prioritaire (épinglée ou automatique = la plus récente), indicateur « N en cours » dans le header avec mini-liste (état, durée, étoile prioritaire, X).
- Bouton X sur chaque session (header + Accueil) avec confirmation : quitter le jeu (jamais brutalement au premier clic) ou arrêter la recherche (le launcher externe reste ouvert).
- Arbitrage des mappings clavier : un seul mapping de fenêtre actif à la fois (la session prioritaire) — `inputProfileActive` recalé automatiquement à chaque transition.

### Changed

- Le Quick Panel (Ctrl+Alt+Z) cible la session prioritaire au lieu de la première session trouvée.

### Fixed

### Performance

### Security

### Compatibility

### Experimental

### Removed

### Known Issues

### Data

### Technical

> Pendant le développement, chaque changement visible par l'utilisateur est ajouté
> ci-dessous dans la catégorie appropriée (voir `AGENTS.md`). Au moment d'une release,
> cette section est renommée `## [X.Y.Z] - AAAA-MM-JJ` puis une nouvelle section
> `[Unreleased]` vide est recréée. Le workflow GitHub génère automatiquement les
> Release Notes à partir de cette section et refuse de publier si elle est vide.

## [1.24.0] - 2026-08-08

### Added

- Priorité de session par premier plan (Alt+Tab réel) : la session dont la fenêtre a le focus devient prioritaire automatiquement, alimentée par le watcher de fenêtres natif (`foreground` dans `GameWindowMatch`).

### Changed

### Fixed

### Performance

### Security

### Compatibility

### Experimental

### Removed

### Known Issues

### Data

### Technical

> Pendant le développement, chaque changement visible par l'utilisateur est ajouté
> ci-dessous dans la catégorie appropriée (voir `AGENTS.md`). Au moment d'une release,
> cette section est renommée `## [X.Y.Z] - AAAA-MM-JJ` puis une nouvelle section
> `[Unreleased]` vide est recréée. Le workflow GitHub génère automatiquement les
> Release Notes à partir de cette section et refuse de publier si elle est vide.

## [1.25.0] - 2026-08-08

### Added

- Favoris Accueil : la section « Bibliothèque récente » est remplacée par « Favoris » (6 jeux max, étoile ★, message d'aide si vide, accès direct à la Bibliothèque) — les favoris se gèrent via le clic droit sur un jeu (Ajouter/Retirer).
- Favoris en tête des résultats de la palette Ctrl+K (étoile ★ dans le libellé).
- Badge « RED4ext ⚠ » honnête sur l'Accueil : affiché quand le loader est actif dans le profil, jamais « ✓ » sans confirmation runtime post-lancement ; badges limités à 3 avec indicateur « +N » (tooltips détaillés).
- Quick Panel adaptatif : la fenêtre rapide affiche la session prioritaire (jeu, profil, mods actifs, clavier, bypass, RED4ext ⚠) — contenu transmis par la fenêtre principale à l'ouverture, adapté à chaque jeu.

### Changed

### Fixed

### Performance

### Security

### Compatibility

### Experimental

### Removed

### Known Issues

### Data

### Technical

## [1.26.0] - 2026-08-08

### Added

- Notification « jeu en cours » (haut à droite, 2,5 s) quand le PROCESSUS FINAL est détecté — jamais au lancement d'un launcher intermédiaire. Trois états : « En cours via ZAILON » (lancé par ZAILON), « Jeu détecté par ZAILON » (récupéré hors ZAILON), « Session récupérée » (jeu déjà lancé quand ZAILON redémarre, fenêtre de 20 s).

### Changed

### Fixed

### Performance

### Security

### Compatibility

### Experimental

### Removed

### Known Issues

### Data

### Technical

## [1.27.0] - 2026-08-08

### Added

- Last Known Good des frameworks : l'empreinte des frameworks actifs (RED4ext, redscript, ArchiveXL, TweakXL) est enregistrée à chaque détection du processus final. Si la configuration change avant un lancement, ZAILON avertit — et bloque si le profil est « Verrouiller les frameworks » (anti-remplacement silencieux).
- État & Diagnostic > Frameworks : carte Last Known Good (différences détaillées, versions, bouton « Enregistrer comme référence », verrou par profil).

### Changed

### Fixed

### Performance

### Security

### Compatibility

### Experimental

### Removed

### Known Issues

### Data

### Technical

## [1.28.0] - 2026-08-08

### Added

- Rich Presence Discord recalculée vers la session prioritaire (multi-sessions §14) : une seule activité publiée à la fois, qui suit l'épinglage, l'Alt+Tab et la fermeture de session — nouvelles commandes natives `set_discord_activity_for` / `clear_discord_activity_for`.

### Changed

### Fixed

### Performance

### Security

### Compatibility

### Experimental

### Removed

### Known Issues

### Data

### Technical

## [1.29.0] - 2026-08-08

### Added

- Visual Profiles multi-apps (spec §9) : UN seul profil visuel au premier plan — appliqué pour la session prioritaire en cours (association jeu/profil), restauré quand elle change sans association ou quand plus aucune session n'est active ; indicateurs `visualProfileActive` recalculés par l'arbitrage (plus jamais deux profils contradictoires).

### Changed

### Fixed

### Performance

### Security

### Compatibility

### Experimental

### Removed

### Known Issues

### Data

### Technical

## [1.30.0] - 2026-08-08

### Added

- Bouton « Réparer RED4ext » (État & Diagnostic > Frameworks) : snapshot automatique, audit complet (paquet, core, plugins, table virtuelle, références) et verdict structuré avec actions — jamais de téléchargement automatique ; renvoi vers la réparation MO2 si les références sont cassées.

### Changed

### Fixed

### Performance

### Security

### Compatibility

### Experimental

### Removed

### Known Issues

### Data

### Technical

## [1.31.0] - 2026-08-08

### Added

- Signatures de processus apprises par installation (spec NTE §7 / #36) : le processus final confirmé (confiance ≥ 80) devient la référence de détection — au lancement suivant, même exécutable renommé par une mise à jour du jeu, la détection est instantanée (bonus +25 nom appris, +15 chemin relatif).

### Changed

### Fixed

### Performance

### Security

### Compatibility

### Experimental

### Removed

### Known Issues

### Data

### Technical

## [1.32.0] — 2026-08-09

### Added

- **Bibliothèque façon vitrine Steam** : la sidebar gauche est supprimée ; la Bibliothèque est une grille plein écran avec recherche instantanée (Ctrl+L), filtres (Tous / Jeux / Applications / Favoris / Installés récemment), densité (Petit / Normal / Grand), filtre « Sans couverture », étoile de favori sur chaque carte, badge « En cours » + « ★ Prioritaire » (une seule session prioritaire), et menu contextuel (favori, ouvrir).
- **Page du jeu** : cliquer une carte ouvre la page du jeu avec hero background (bannière/illustration en fond, dégradé léger), bouton « ← Bibliothèque » qui revient à la grille en conservant recherche, filtre et scroll, et bouton **Jouer** dans le hero (même machine d’états que l’Accueil : Jouer → Préparation → Recherche du jeu… → En cours).
- **État RED4ext détaillé** (État & Diagnostic > Frameworks) : cinq lignes Installé / Manifest / Déployé / Runtime visible / **Chargé** — « Chargé » affiche toujours « Non vérifié » (jamais ✓ sans le log du jeu) ; les autres lignes tirent leur statut du profil, de la table virtuelle et de l’audit.

### Changed

- Le bouton Jouer de l’Accueil n’est plus coupé : `min-width` stable (168 px), `padding-inline`, `white-space: nowrap`, `flex-shrink: 0` — la largeur ne bouge plus entre « Jouer », « Lancement… », « Recherche du jeu… » et « En cours » (FR/EN/DE/PT/ES).

### Removed

- Suppression de la colonne latérale « Bibliothèque » (liste des jeux) dans GamesView — remplacée par la vitrine plein écran.

## 1.33.0 — Moteur d'illustrations unifié

### Added

- **Moteur d'illustrations unifié** (`artworkRegistry.ts`) : registre unique des six fournisseurs (Steam officiel, SteamGridDB, IGDB, Nexus, GameBanana, CurseForge) avec priorité, capacités par type d'image et **état honnête** — jamais de fournisseur affiché comme fonctionnel sans connecteur réel.
- **Recherche d'illustrations multi-source** : « Source de recherche » (Automatique / Toutes les sources) dans l'éditeur d'apparence ; en automatique, Steam officiel est essayé d'abord puis SteamGridDB en secours ; les résultats des sources sont **fusionnés en une seule grille** (l'utilisateur choisit une image, pas un fournisseur) et **dédupliqués** (URL normalisée, paramètres de cache CDN ignorés).
- **Connecteur SteamGridDB natif** : `search_game_artwork` accepte des clés API (`api_keys`) et interroge SteamGridDB (grids / heroes / logos / icons) quand une clé est enregistrée ; nouvelle commande `test_artwork_provider` pour vérifier une clé.
- **Paramètres > Illustrations** : liste compacte de l'état des six sources (✓ disponible / Non configuré / Connecteur non disponible avec bulle ⓘ), clé SteamGridDB (Enregistrer / Remplacer / Tester la connexion / Supprimer, stockée localement, transmise uniquement à SteamGridDB) et mode de source.
- **« Changer l'apparence… » activé** dans le menu contextuel de la Bibliothèque : ouvre directement l'éditeur d'apparence avec la recherche automatique.
- **Auto-artwork** : la recherche automatique pour les nouveaux jeux passe aussi la clé SteamGridDB si elle est enregistrée.

### Changed

- Le mode de recherche d'illustrations choisit désormais la source par jeu (Steam officiel d'abord), au lieu d'une seule section « Images Steam » fixe dans les Paramètres.

### Fixed

- Le menu contextuel de la Bibliothèque proposait « Changer l'apparence… » désactivé : il ouvre maintenant l'éditeur d'apparence directement.

### Performance

### Security

### Compatibility

### Experimental

### Removed

### Known Issues

- Les connecteurs IGDB, Nexus, GameBanana et CurseForge restent honnêtement marqués « connecteur non disponible » (aucun résultat fictif) ; le branchement réel est hors périmètre de cette version.
- La recherche et le test SteamGridDB réels nécessitent une clé API valide (validation réseau non couverte par la CI locale).

### Data

### Technical

## 1.34.0 — Connecteurs IGDB et GameBanana

### Added

- **Connecteurs IGDB et GameBanana** dans le moteur d'illustrations : IGDB (covers / artworks / screenshots via une application Twitch gratuite, échange Client Credentials) couvre les jeux absents de Steam ; GameBanana fonctionne **sans aucune clé** (API publique, couvertures et images de jeux).
- **Priorités réordonnées** selon la recommandation d'intégration : SteamGridDB n°1, Steam officiel n°2, IGDB n°3, GameBanana n°4 — Nexus et CurseForge restent honnêtement « connecteur non disponible » (pas d'API de jaquettes de jeux par nom).
- **Paramètres > Illustrations** : rangée IGDB (Client ID + Client Secret, Enregistrer / Remplacer / Tester la connexion / Supprimer) et bouton « Tester GameBanana (public) » ; l'état des sources reflète la configuration réelle.
- L'auto-artwork des nouveaux jeux privilégie toujours l'art officiel Steam, puis complète avec les sources configurées.

### Changed

- Ordre des résultats d'une recherche « Toutes les sources » : SteamGridDB en tête (recommandation n°1 pour les personnalisations), puis Steam officiel, IGDB, GameBanana.

### Fixed

### Performance

### Security

### Compatibility

### Experimental

### Removed

### Known Issues

- Les connecteurs réseau (SteamGridDB, IGDB, GameBanana) ne sont pas couverts par la CI locale : la validation réelle nécessite une clé valide ou une machine avec le jeu.
- Le format des champs `screenshots` de GameBanana est tolérant mais non garanti : en cas de changement, le connecteur renvoie zéro image (jamais d'erreur ni de résultat fictif).

## 1.35.0 — Correctif NTE après UAC

### Added

- **Récupération de présence immédiate quand Steam passe « En cours »** (spec UAC §5, §16) : dès que le registre RunningAppID confirme l'AppID d'une session en attente, ZAILON rescanne immédiatement processus + fenêtres — sans attendre le tick suivant, sans aucune confirmation UAC.
- **Seuil Steam-backé** (60 au lieu de 80) : quand Steam confirme le jeu en cours, un processus final élevé qui refuse son chemin est rattaché via nom + contexte + Steam (65 ≥ 60) — fin du blocage « attente de confirmation Windows ».
- **Scoring natif renforcé** : +20 si Steam Running (preuve indépendante du chemin), +50 si le processus est sous un emplacement profond connu (`Client\WindowsNoEditor\HT\Binaries\Win64` pour NTE — le nom de l'EXE n'est plus obligatoire), -50 si le processus est hors installation avec chemin accessible (processus élevé : aucune conclusion négative).

### Changed

- L'élévation UAC n'est plus un état bloquant : `WaitingForElevation` est un sous-état informatif, la machine continue `Lancement… → Recherche du jeu… → En cours` ; le bouton affiche « Lancement… » et le bandeau « Élévation Windows en cours » (fini « Autorisation requise… » / « Acceptez la fenêtre UAC »).
- `ntegloballauncher.exe` reste un stage launcher valide : la session continue sans attendre qu'il reste vivant (il peut démarrer, s'élever, se fermer et être remplacé).

### Fixed

- ZAILON restait bloqué sur « attente de confirmation Windows » alors que le vrai jeu tournait déjà après l'UAC : la réconciliation est désormais pilotée par les preuves (Steam Running, processus final, fenêtre), jamais par une confirmation API inexistante.

### Performance

### Security

### Compatibility

### Experimental

### Removed

### Known Issues

- Les tests NTE Steam/UAC réels (spec §18, §52) exigent la machine avec le jeu : non couverts par la CI. Les deux cas (UAC accepté → En cours ; UAC refusé → « Le lancement a été annulé ») restent à valider matériellement.

## 1.36.0 — Raccourcis bureau avec icône réelle

### Added

- **Vrais raccourcis bureau Windows `.lnk`** (format binaire MS-OSH, sans dépendance) : `TargetPath` = ZAILON, `Arguments` = URI `zailon://` (profil, mods, session, clavier, visuel conservés), `WorkingDirectory`, `IconLocation` et `Description` explicites — fini l'icône blanche des anciens `.url`.
- **Résolution d'icône en cascade** (spec §20) : icône personnalisée/Apparence (`.ico`/`.exe`/`.dll` utilisés tels quels, `.png` enveloppée automatiquement dans un conteneur `.ico` Vista+ dans `resources/games/<id>/shortcut.ico`) → **icône native extraite par Windows de l'exécutable du jeu** → icône générique ZAILON en dernier recours. Jamais de raccourci sans `IconLocation` valide.
- **Linux `.desktop`** : `Icon=` pointe désormais vers l'image locale résolue.

### Changed

- `createDesktopShortcut` reçoit `iconPath` et `execPath` séparément : l'exécutable du jeu n'est plus confondu avec l'icône personnalisée dans la résolution.

### Fixed

- Le raccourci bureau affichait une icône de fichier blanc : les `.url` sont remplacés par de vrais `.lnk` avec `IconLocation` résolue et exploitable par Windows.

### Performance

### Security

### Compatibility

### Experimental

### Removed

### Known Issues

- La conversion multi-taille (16→256 px) d'un PNG en `.ico` nécessiterait un décodeur d'images : la version actuelle enveloppe le PNG tel quel (256×256, format PNG accepté par Windows Vista+) — suffisant pour éliminer l'icône blanche.

## [1.37.0] — 2026-08-09

### Added

- **Échelle de z-index centralisée** (`src/lib/zIndex.ts`) : couches nommées content/sticky/dropdown/popover/modal/toast — fini les valeurs arbitraires.
- **ProfileSwitcherPopover en portal** : le sélecteur de profil est rendu dans `document.body` (plus aucun `overflow-hidden` ni stacking context de page ne peut le couper) ; position calculée sur le bouton déclencheur, ouverture vers le haut si l'espace manque en bas, repositionné au scroll/resize, fermeture par Échap.

### Changed

- **Sélecteur de profil Bibliothèque** : liste compacte (max ~6 profils visibles puis scroll interne), recherche de profil dès 8 profils, badge « Jeu en cours », pas de changement de mods à chaud — un profil non actif est marqué « Disponible après fermeture du jeu » tant qu'une session tourne.

### Fixed

- **Popover de profil plus jamais coupé** par le hero (`overflow-hidden`) de la page du jeu : le menu s'affiche au-dessus de toute l'interface et reste entièrement visible même avec un long changelog ou une petite fenêtre.

### Performance

### Security

### Compatibility

### Experimental

### Removed

## [1.38.0] — 2026-08-09

### Added

- **Paramètres > À propos > « Historique des versions »** : ouvre le journal local des mises à jour (ex-fonction Outils, spec §39).
- **Onglet Profils** : bouton « Importer depuis Mod Organizer 2… » (ex-fonction Outils, spec §42).
- **Configuration > Général** : icônes dossier à côté de l’Exécutable, du Dossier Mods et du Dossier Bypass pour ouvrir dans l’Explorateur (spec §43).

### Changed

- **Section Outils supprimée** : la navigation principale et la page du jeu n’ont plus d’entrée « Outils ». Chaque fonction a été redistribuée (voir `docs/tools-page-removal-map.md`) — Détection locale et Ajout manuel restent dans la Bibliothèque, l’audit et la réparation MO2 dans État & Diagnostic, l’import MO2 dans Profils, le journal dans Paramètres > À propos.
- **Palette Ctrl+K** : « Détecter des jeux » ouvre la Bibliothèque (fini l’ancienne page Outils) ; l’entrée « Ouvrir Outils » est retirée.

### Fixed

### Performance

### Security

### Compatibility

### Experimental

### Removed

- **Page et onglet « Outils » supprimés** (`ToolsView.tsx`, onglet de la page jeu, entrées de navigation, types `ViewType`/`GameTab`). Aucune fonction utile perdue — chaque action a une destination documentée dans la carte de redistribution.

## [1.39.0] — 2026-08-09

### Added

- **Fin de session réelle (Runtime Session V3)** : `sessionPresenceReport` + période **PossibleExit** (5 s) — quand le processus final et la fenêtre du jeu disparaissent sans relaunch, la session se termine (déploiement restauré, timer arrêté, remapping rétabli). Un launcher encore ouvert ne maintient jamais « En cours » (drapeau natif `isLauncherProcess`).
- **Badges runtime vérifiés** sur l’Accueil pendant une session : QWERTY / Visuel / ZAILON en **✓ / ⚠** selon l’état réel d’activation de la session (spec §48), plus la configuration.
- **Toast « Session terminée »** avec durée (spec §52) et ligne de détail sur les toasts de session (spec §51).
- **Paramètres > Panneau rapide en jeu > « Tester le panneau »** : ouvre la vraie fenêtre native même sans jeu (spec Quick Panel §21).
- **État & Diagnostic > Fichiers > « Comparer avec la racine attendue »** (spec §45) : pour chaque framework (RED4ext, redscript, TweakXL, ArchiveXL…), fichiers physiques vs fichiers projetés + racines exposées — un framework mal exposé n’est plus présenté comme « absent ».

### Changed

- **Détection de fin de session** : le watcher scanne aussi la présence du **processus final** des sessions en cours (pas seulement fenêtres) ; la cadence repasse à 3 s pendant une PossibleExit pour terminer vite. Steam compte comme preuve, mais la session ne reste jamais zombie sans processus ni fenêtre.
- **Ré-attachement** : les preuves d’une session déjà « En cours » alimentent la fin de session, plus jamais un ré-attachement (fini le toast/timeline répétés à chaque scan).

### Fixed

- **Session bloquée « En cours » après fermeture du jeu** (NTE et autres launchers) : la disparition du processus final n’était jamais détectée (seul le PID lancé par ZAILON — le launcher — était surveillé). Désormais le jeu fermé met fin à la session sous ~6-11 s.

### Performance

### Security

### Compatibility

### Experimental

### Removed

### Known Issues

## [1.40.0] — 2026-08-09

### Added

- **Quick Panel — état réel (spec RuntimeSessionV3 §49)** : le panneau affiche désormais les statuts RÉELS de la session (Connexion ZAILON / Clavier / Visuel / Runtime en ✓/⚠) transmis par la fenêtre principale — plus jamais un état local optimiste ; l'interrupteur clavier se synchronise sur l'activation réelle.
- **Diagnostic fenêtre du Quick Panel (spec §22, §50)** : nouvelle commande native `quick_panel_status` (créée, visible, focus, always-on-top, taille, position) ; carte « Quick Panel — diagnostic fenêtre » dans État & Diagnostic > Lancement (mode avancé) avec session cible, jeu au premier plan et état du rendu — jamais de fausse activation.

### Changed

- **`quick-panel-state` enrichi** : la fenêtre principale transmet `connected`, `inputActive`, `visualActive`, `runtimeActive` en plus du résumé adaptatif (jeu, profil, mods, layout, bypass, RED4ext).

### Fixed

### Performance

### Security

### Compatibility

### Experimental

### Removed

## [1.41.0] — 2026-08-09

### Added

- **Import Cyberpunk — résolution de racines par fichier** (spec §23-27) : chaque fichier d'un dossier importé est mappé à sa racine de jeu la plus spécifique via `cyberpunk_map_file` (contient l'élimination des conteneurs inutiles) — un framework multi-racines comme TweakXL (`r6/tweaks` **et** `red4ext/plugins`) n'est plus empilé sous une seule destination.

### Changed

- **Staging Cyberpunk** : la branche « structure ambiguë » de `stage_content` reconstruit désormais les racines **fichier par fichier** (`CyberpunkMappedByFile`) au lieu d'une destination globale unique ; les fichiers sans racine déterministe suivent l'extension (.archive → `archive/pc/mod`, .reds → `r6/scripts`) puis le fallback `mods/<nom>`. Le nom du dossier n'est jamais une partie du chemin jeu (spec §27).

### Fixed

- **« TweakXL requis » / « ArchiveXL requis » alors que les fichiers existent** : la cause était une destination unique par paquet — le contenu restant (ex. `red4ext/plugins/…`) était empilé sous la première racine détectée (ex. `r6/tweaks/…`) ou sous `mods/`. Le mapping par fichier projette chaque fichier à la bonne racine.

### Performance

### Security

### Compatibility

### Experimental

### Removed

## 1.42.0 — Réparer les racines des imports existants

### Added

- **« Réparer les racines des imports »** (onglet Mods) : re-stage chaque paquet importé depuis sa source enregistrée (`sourcePath`) avec la résolution de racine par fichier — les imports créés avant la 1.41.0 (racines empilées, frameworks mal exposés) sont corrigés sans réimporter. Backup automatique du contenu précédent dans chaque paquet, restauration en cas d'échec, comptage fichiers avant/après et détail des échecs (source absente / manifeste illisible).

## 1.43.0 — Graphe de capabilities frameworks Cyberpunk

### Added

- **Graphe de capabilities frameworks Cyberpunk** (spec §28-31) : un framework est reconnu par dossier canonique **ou** signature de fichier (`tweakxl.dll`/`archivexl.dll`/`codeware.dll`), jamais par le nom du dossier — un paquet « core_01 » mal nommé fournit quand même `cyberpunk.tweakxl`.
- **Correctif du faux « TweakXL requis »** : la vérification pré-lancement comparait un chemin de dossier par égalité exacte de fichier → échouait toujours, même avec TweakXL correctement stagé sous `red4ext/plugins/TweakXL/…`. Les besoins sont désormais satisfaits par des capacités (dossier canonique OU signature), agrégées sur l'ensemble des mods actifs (graphe global).
- **TweakXL, ArchiveXL et Codeware ajoutés aux fournisseurs détectés** (audit + manifeste + « Comparer avec la racine attendue ») : les 6 frameworks (RED4ext, redscript, TweakXL, ArchiveXL, Codeware, CET) apparaissent désormais dans le comparateur.

## 1.44.0 — Diagnostic hiérarchique des frameworks Cyberpunk

### Added

- **Diagnostic hiérarchique des frameworks Cyberpunk** (spec §36-43) : ordre de vérification RED4ext → redscript → ArchiveXL → TweakXL → Codeware → CET. RED4ext est la cause primaire — quand il échoue, TweakXL/ArchiveXL/Codeware s'affichent en **conséquences**, jamais en erreurs indépendantes.
- **États distingués** (spec §40) : prêt / manquant / **non requis** (absent mais rien n'en dépend — jamais un blocage) / **mal placé** (fourni par signature mais hors emplacement canonique) / **non exposé** (dans le profil mais absent de la table virtuelle) / **compatibilité** (empreinte changée depuis le Last Known Good).
- **Carte « Diagnostic hiérarchique · frameworks »** dans État & Diagnostic > Frameworks : les 6 frameworks dans l'ordre, cause primaire en bannière rouge, conséquences grisées, avertissements Last Known Good.
- **Verrou pré-lancement hiérarchique** : le lancement bloqué affiche la cause primaire puis ses conséquences (« Framework principal non chargé : RED4ext — … Conséquences : TweakXL, ArchiveXL ») au lieu de messages indépendants.

## 1.45.0 — Library Polish : fallback automatique + parallaxe subtil

### Added

- **« Sans couverture » supprimé définitivement** (spec §1) : le filtre et la case à cocher disparaissent — chaque jeu/app possède désormais une représentation visuelle.
- **Couverture automatique `FallbackArtwork`** (spec §2-3) : sans artwork, ZAILON génère une carte propre — teinte déterministe du nom (accent), dégradé léger, icône centrée, titre — jamais un rectangle gris. Appliqué à la Bibliothèque ET aux cartes rapides de l'Accueil.
- **Parallaxe 3D subtil des couvertures** (spec §4-9, §48, §58-59) : la souris incline la carte (max 4°, scale 1.012 — pas un zoom), `perspective: 900px`, retour au repos 220 ms, `will-change` uniquement au survol, mouvement appliqué directement au style (zéro rerender React par déplacement — un hover ne re-rend jamais la grille).
- **Réglages Apparence** (spec §11-12) : mode « Animations » (Automatique / Activées / Réduites, défaut Automatique — suit « Réduire les animations » du système) + ligne compacte « Effet 3D des couvertures » avec bulle d'aide.
- **Parallaxe respectueux des contraintes** (spec §10, §13) : désactivé sur écrans tactiles, quand les animations sont réduites ou que le toggle est éteint ; aucun calcul hors survol.

## 1.46.0 — Diagnostic Visual Profiles compact + historique complet

### Added

- **Diagnostic Visual Profiles compact** (spec §1-3) : grille d'états immédiatement lisibles (Backend, HDR, ICC, Restauration ⚠, Historique, Profil actif) + boutons Tester / Restaurer — la documentation technique (limitations Microsoft, comportement pilote, HDR, multi-écran, absence d'injection, ICC, DDC/CI) est déplacée dans une **bulle ⓘ** (hover + clic + clavier, contenu déroulant si long).
- **Historique cliquable** (spec §4) : « N version(s) » ouvre une fenêtre avec toutes les versions — actions **Restaurer / Comparer / Supprimer** (corbeille ZAILON). Le comparateur affiche les 12 réglages version vs actuel, différences surlignées.
- **Historique plafonné à 50 versions** côté natif (spec §4) : les plus anciennes partent en corbeille — plus jamais des milliers de copies.
- **Nouvelles commandes natives** : `read_visual_profile_version` (lecture seule pour comparer) et `delete_visual_profile_version`.

## 1.47.0 — Profils Performance par jeu

### Added

- **Profils Performance par jeu** (spec §5-10, §23-24, §27, §40) : Bibliothèque > Jeu > Configuration > Performances — modes **Automatique / Équilibré / Performance / Qualité / Personnalisé**, avec la distinction claire **Performance ZAILON** (téléchargements, scans, animations, Quick Panel, priorité ZAILON) vs **Performance du jeu** (priorité du processus — jamais « Temps réel » ; contrôle FPS natif à venir).
- **Presets conformes spec §24** : Performance = pause téléchargements/scans + animations coupées + Quick Panel minimal + priorité ZAILON basse ; Équilibré = limité/réduit ; Qualité = pause mais animations normales. Mode Personnalisé = 5 politiques éditables.
- **Résolution effective multi-session** (spec §37-39) : une session active qui demande la pause → pause globale ; à la fermeture du jeu prioritaire, le niveau se recalcule automatiquement — aucune optimisation ne reste bloquée (spec §36).
- **Parallaxe coupé pendant le jeu** (spec §14) : les profils Équilibré/Performance réduisent les animations → les couvertures restent statiques.
- **Bannière « En pause — jeu actif »** dans Téléchargements (spec §11) quand un jeu actif impose la pause.
- **Paramètres globaux minimaux** (spec §40) : « Mode Performance par défaut » (Automatique) + « Sur batterie » (Économie).

## 1.48.0 — Game Mode : suspension automatique des tâches de fond pendant le jeu

### Added

- **GameModeTaskScheduler côté runtime** (spec §13) : les politiques effectives des profils Performance (téléchargements / scans) sont désormais **dérivées des sessions vivantes** (`runtimeActivity` dans le store) et recalculées à chaque changement de session ou de profil — `reconcileRuntimeActivity()` — sans rien persister : à la fermeture du jeu, tout revient automatiquement à « normal » (spec §36).
- **Watcher de présence ralenti en mode jeu** : la cadence du GamePresenceEngine passe de 3 s à 6 s quand un jeu tourne **ou** que la politique effective impose la pause — la présence Steam/runtime reste suivie sans activité lourde (spec §8).
- **Artwork automatique suspendu** (spec §12) : quand un jeu actif met les scans en pause, la recherche d'illustrations automatique est suspendue (reprise au prochain ajout de jeu — aucune file orpheline).
- **Gating des actions lourdes** (spec §8, §12) : les boutons **Analyser** (onglet Mods) et **Détecter** (Bibliothèque) sont désactivés pendant le jeu avec une infobulle « En pause — jeu actif (profil Performance). Reprenez après la fermeture du jeu. »

## 1.49.0 — Fiabilité des profils : correction du bug « 0 mods »

### Fixed

- **Bug critique « 0 mods »** (spec Fiabilité profils §1-11, §56-60) : un profil pouvait afficher `0 mods actifs` au démarrage alors que ses paquets staged existaient — un cache UI vide persisté (`installedMods`) était traité comme la vérité jusqu'au clic « Analyser ». Le catalogue installé de chaque jeu est désormais **réconcilié avec le store staged réel au démarrage** (`refreshStagedCatalogs`, lecture des manifest.json uniquement — léger).
- **Invariant anti-« clear silencieux »** (spec §8) : toute transaction de profil qui ferait passer un profil de > 0 à 0 actifs SANS être une désactivation massive explicite ou une suppression explicite est **rejetée avant toute écriture** — « Une modification anormale du profil a été détectée et annulée. » Les opérations légitimes (Désactiver toute la sélection, Retirer tous les mods, transfert, annulation groupée) passent explicitement le garde.
- **Restauration automatique** (spec §5-6) : si des références de profil sont absentes du catalogue, un toast « Profil restauré automatiquement » signale la réconciliation (rapport de réparation : références + actifs restaurés).

### Added

- **`src/lib/profileConsistency.ts`** (logique pure, 12 tests) : compteur canonique depuis les modStates (`enabledCountFromState`, spec §2/§10 — jamais une liste rendue), détection du clear silencieux (`isSilentClear`), détection du besoin de re-scan (`needsStagedRefresh`, spec §9), rapport de réparation (`repairReport`, spec §57).

## 1.50.0 — Persistance UI : Explorer mémorise son état + réglages debouncés

### Added

- **`exploreSearch` persisté** (spec §16) : la recherche de l'Explorer survit au redémarrage, comme le mode grille, le nombre de colonnes, le tri, la plateforme, le jeu sélectionné, la page et le filtre NSFW — le bloc `ExplorerPreferences` (spec §14) est désormais intégralement persisté.
- **Sauvegarde debounced des réglages continus** (spec §17) : le color picker d'accent n'écrit plus sur disque à chaque pixel — coalescence **250 ms** via `src/lib/persistDebounce.ts` (helper pur, 6 tests : coalescence, fenêtre, flush, cancel), avec **flush forcé à la fermeture** (`flushPendingSettings` sur `beforeunload`) — aucune valeur récente perdue.

### Removed

- **Bloc « Gratuit en permanence » supprimé** de Visual Profiles (spec §35, critère bloquant §71) : texte permanent inutile, n'apportait rien à l'utilisation courante.

## 1.51.0 — Tutoriel de première visite (visite guidée)

### Added

- **Visite guidée au premier lancement** (spec §18-21) : petite fenêtre flottante **non bloquante** (l'application reste utilisable derrière), 6 étapes — Bibliothèque, Jeu, Profils, Explorer, Jouer, Quick Panel — avec navigation **automatique vers la bonne page** à chaque étape (spec §21). Boutons Suivant / Précédent / Passer / Terminer, indicateur d'étape.
- **État persisté** (spec §54) : « Passer » est respecté et ne réapparaît jamais ; `OnboardingState` (`tourCompleted`, `tourSkipped`, `tourVersion`, `tourCompletedSteps`, `hintsSeen`) persisté.
- **Revoir la visite guidée** depuis Paramètres > À propos (spec §22) : bouton « Revoir la visite guidée » (relance le tour) + « Réinitialiser les conseils » (remet tout à zéro, avec confirmation).
- **Étapes versionnées** (spec §23) : `CURRENT_TOUR_VERSION` centralisé dans `src/lib/tourSteps.ts` (module pur, 7 tests) — une refonte majeure pourra proposer « Découvrir la nouvelle interface » sans relancer le tour complet.

## 1.52.0 — Runtime Toast : preuve de connexion réelle

### Added

- **Runtime Toast contextuel** (spec Quick Panel §1-7, §19) : la bulle « En cours via ZAILON » affiche désormais les **fonctions runtime réellement actives** (QWERTY ✓ · Visuel ✓ · Mods ✓ · Déploiement ✓) — alimentées par l'état RÉEL de la session (`inputProfileActive`, `visualProfileActive`, `runtimeToolsActive`), jamais par la configuration : une fonction configurée mais non active n'affiche jamais ✓ (spec §19).
- **Connexion partielle honnête** (spec §5) : si une partie des fonctions runtime a échoué, la bulle passe en ton ambre avec « connexion partielle » — pas de gros popup d'erreur.
- **Rappel du raccourci limité** (spec §42, §63) : « Ctrl+Alt+Z · Panneau rapide » s'affiche sous la bulle **seulement les 3 premières sessions** puis plus jamais (`shortcutHintCount` persisté).
- **Notifications activables** (spec §62) : Paramètres > Tâches et notifications — toggles « En cours via ZAILON » et « Session terminée ».
- **`src/lib/runtimeToast.ts`** (logique pure, 10 tests) : `buildRuntimeToastContent`, `runtimeBadges`, `isPartialConnection`, `SHORTCUT_HINT_LIMIT`.

### Fixed

- Le toast « En cours via ZAILON » reste déclenché au **premier vrai `sessionGameDetected`** (processus final détecté, jamais au clic Jouer / Steam / launcher / UAC — spec §4), confirmé par audit du code.

## 1.53.0 — Quick Panel : contenu contextuel enrichi

### Added

- **Section Performance dans le panneau** (spec Quick Panel §24) : mode rapide (Automatique / Équilibré / Performance / Qualité — Personnalisé reste dans Configuration) appliqué à la session prioritaire et répercuté dans la fenêtre principale, avec badges « Téléchargements : en pause » / « Scans : en pause » issus de la politique effective réelle.
- **« Mods ⚠ Non préparés »** (spec §69) : si la session a été détectée après coup (Steam, launcher externe, UAC) ou sans déploiement actif, le panneau le dit honnêtement avec la bulle « Le jeu a été lancé avant la préparation du profil » — jamais un faux ✓.
- **Payload `quick-panel-state` enrichi** : `modsPrepared`, `performanceMode`, `downloadsPaused`, `scansPaused` — calculés par la logique pure `src/lib/quickPanelState.ts` (6 tests) et rafraîchis après changement de Performance (`quick-panel-refresh`).
- Le contenu reste compact : profil, connexion, statuts réels, visuel, clavier, performance — pas de mini-launcher (spec §16).

## 1.54.0 — Quick Panel : multi-session (sélecteur + épinglage)

### Added

- **Sélecteur de session en en-tête** (spec Quick Panel §14-15, §48) : quand plusieurs sessions sont actives (Cyberpunk + NTE + Photoshop…), l'en-tête affiche la session courante avec ▼ — la liste montre toutes les sessions actives (★ = prioritaire, étoile dorée = épinglée), et changer de cible **ne ferme pas le panneau**.
- **Épinglage ★** (spec §50) : bouton dans l'en-tête pour épingler la session courante — le raccourci continue d'ouvrir celle-ci ; le pin est **retiré automatiquement à la fermeture du jeu** (déjà géré par le store).
- **Priorité respectée** (spec §49) : la cible par défaut est la session prioritaire (pin > premier plan > plus récente, `pickPrioritySession`) ; après un changement manuel, la cible choisie est mémorisée pour la session du panneau et les actions (clavier, performance) s'y appliquent.
- **`activeSessionsForQuickPanel`** dans `src/lib/quickPanelState.ts` (logique pure, 3 tests multi-session) : liste des sessions non terminales triées priorité d'abord.
- Nouveaux événements : `quick-panel-sessions` (liste) et actions `set-target` / `pin-target`.

## 1.55.0 — Quick Panel : fermeture ciblée et bascule de session

### Added

- **Fermeture ciblée** (spec Quick Panel §47, §84) : quand la session affichée par le panneau se termine, le panneau **bascule automatiquement vers la session suivante** (la prioritaire parmi celles restantes) au lieu de se fermer — il ne se ferme que si plus aucune session n'est en cours.
- **Pin disparu ne bloque pas** (spec §84) : si la session épinglée ★ se termine, la priorité est recalculée sur les sessions vivantes et le panneau bascule normalement (le pin est retiré par le store).
- **`nextSessionAfterCurrent`** dans `src/lib/quickPanelState.ts` (logique pure, 4 tests : bascule vers la prioritaire restante, fermeture si rien, pin disparu, pin d'une autre session respecté) : exclut la cible disparue et les sessions terminales, applique `pickPrioritySession` sur le reste.

### Fixed

- Le panneau ne restait plus ouvert avec une session terminée affichée (spec §47 : « Ne pas afficher les anciennes données ») — il bascule ou se ferme proprement.

## 1.71.0 — SDK d'extensions : interfaces publiques, permissions à l'appel, événements lazy, slots UI, cycle de vie isolé

### Added

- **SDK d'extensions** (`src/lib/addonSdk.ts`, 8 tests, spec §19, §24-28, §69-71) :
  - **Interfaces publiques versionnées** (Addon API v1, §24-25) : `GameService`, `ProfileService`, `ModService`, `LaunchService`, `SettingsService`, `ProviderService`, `UIExtensionService` — les add-ons n'accèdent jamais aux composants internes privés ;
  - **Gate de permissions à l'appel** : `assertServicePermission` (launch → `game.launch`, provider → `provider`, ui → `ui.extend`…) — un add-on aux permissions minimales ne s'active que s'il utilise réellement un service non couvert (§11-13) ;
  - **Bus d'événements isolé** (`createAddonEventBus`) : un handler fautif (sync ou async) ne bloque ni les autres ni le Core (§21) ; `assertLazyEvents` restreint `OnZailonStarted` (§69) ;
  - **Slots UI définis** (`UiExtensionRegistry`, §26-27) : emplacements fixes (`GameSettings.ModBackend`, `GameSettings.Visual`, `GameDiagnostics`, `ProfileTools`, `QuickPanel.Visual`, `Explorer`, `ContextMenu`), un par add-on, libérés à la désactivation ;
  - **Cycle de vie lazy** (`AddonLifecycle`, §19, §21) : idle → loaded (à la demande) → active au premier usage ; erreur d'activation → **crash guard (2 échecs → désactivé)** ; deactivate libère les extensions, données intactes (§16-17) ;
  - **Contribution au démarrage** (`StartupContributionMonitor`, §68) : rapport core vs add-ons — le lazy loading doit tendre vers zéro ;
  - `createAddonApi` : construit l'API publique versionnée avec gate, stockage séparé (données ≠ code, §16) et journalisation.
- **AddonsView** : les cartes installées affichent désormais API version, nombre d'événements déclarés et badge « lazy ✓ » (chargé à la demande, jamais au démarrage).

### Changed

- Les contrats d'extensions sont maintenant documentés et testables sans exécuter de code add-on — la base du mécanisme d'extensibilité universelle (§51-53).

## 1.70.0 — Add-ons : pipeline d'installation réel (HTTPS → SHA-256 → échange atomique → santé)

### Added

- **Pipeline d'installation natif** (spec §14-15, §65) — 4 commandes Tauri :
  - `addon_download` : téléchargement HTTPS uniquement (jamais de mirror, §9), taille plafonnée, écriture dans le cache add-ons ;
  - `addon_verify_sha256` : vérification SHA-256 avant toute installation (§14) ;
  - `addon_install_staged` : extraction ZIP en staging avec garde anti-traversal et anti-symlink (réutilise `enclosed_name` + `validate_archive_relative`), manifest.json obligatoire, puis **échange atomique** : ancien répertoire → backup, staging → install, backup supprimé seulement après succès, **restauré en cas d'échec (rollback)** ;
  - `addon_install_dir` : `addons/installed` (code) — les données utilisateur restent séparées (`addon-data`, spec §16).
- **Orchestrateur** (`src/lib/addonsInstall.ts`, 7 tests) : machine à états pure (download → verify → staging → swap → health → done / failed / rolled_back), `fetchAddonCatalog` (cache localStorage d'abord, réseau validé ensuite, **fallback hors ligne** — jamais d'échec bloquant, §6), `mergeCatalogs` (le distant prime, le fallback complète), `isOfficialCatalogUrl` (source officielle uniquement, §5/§9), `isSafeDownloadUrl` (HTTPS sans identifiants), rapport de stockage (§72).
- **AddonsView câblée au pipeline réel** : bouton « Catalogue » (synchronisation distante avec indicateur source : à jour / en cache / hors ligne), dialogue d'installation avec **progression par phase** (barre + badges download/verify/staging/swap/health), échec affiché avec possibilité de fermer, vérification de santé post-install (compatibilité + dépendances), ligne de stockage total installé.

### Changed

- Le SHA-256 est vérifié quand le catalogue fournit le hash réel ; le catalogue de référence hors ligne utilise un placeholder honnête (aucune vérification inventée).
- L'installation des add-ons est désormais réelle (fichiers dans `addons/installed`) et jamais destructive : rollback automatique en cas d'échec.

## 1.69.0 — Architecture Add-ons : Core léger + fonctionnalités installables à la demande

### Added

- **Add-on Manager v1** — nouvelle vue « Add-ons » dans la navigation principale (recherche, filtres Tous/Installés/Jeux/Modding/Visuel/Apparence/Sources/Utilitaires, grille de cartes compacte avec état installé/activé, taille téléchargement + estimée installée, badge Officiel ✓/Local, bouton Documentation).
- **Logique pure Add-ons** (`src/lib/addons.ts`, 17 tests, spec §1-83) :
  - Manifest `.zailon-addon` (schéma 1), **IDs immuables** segmentés (§10), permissions déclarées avec labels français (§11), `checkAddonCompatibility` (ZAILON min/max, version d'API séparée §24, plateforme, dépendances — §23, §64) ;
  - `parseAddonCatalog` (validation schema 1, entrées invalides rejetées, doublons détectés), `verifyAddonHash` (SHA-256), `validateAddonManifest` pour l'import ;
  - `resolveAddonDependencies` (dépendances du catalogue installées ensemble, manquantes signalées, cycle détecté — §31-33), `planAddonUninstall` (jamais de suppression silencieuse si dépendants — §33) ;
  - **AddonCrashGuard** (2 crashs → module désactivé avec message au prochain démarrage — §21) et **Safe Mode** (seuil de crashs au boot — §22) ;
  - `validateAddonEvents` (événements lazy §69-71 : OnGameSelected/Launched/Started/Stopped, OnExplorerOpened, OnProfileChanged, OnDemand — OnZailonStarted restreint), `planAddonInstall` (phases atomiques download→verify→staging→swap→health→cleanup avec rollback — §15, §65), `estimateInstalledSize` (~2,5× — §73).
- **Catalogue officiel de référence** (15 add-ons Phase 1-3, §79) en cache hors ligne (§6) : Frosty Support, ReShade Manager, Discord Presence, Nexus/GameBanana/CurseForge Providers, Cyberpunk Advanced, NTE Support, FiveM Profiles, MO2/Vortex/Frosty Importers, Steam Advanced, Artwork+, Theme Packs, Performance+ — avec tailles, permissions et dépendances déclarées. Aucun téléchargement automatique (§76).
- **Dialogue d'installation** : liste des permissions demandées, dépendances (« Installer aussi » / manquantes), compatibilité, taille — installation atomique annoncée. **Désinstallation sûre** : bloquée si des add-ons en dépendent, données utilisateur conservées (§17). **Import communautaire** : manifest JSON collé → validation → permissions → installation locale, sans compte ni marketplace (§7-8, §59).
- **Store** : slice `addons` persisté (installé/enabled/source) + actions `installAddon` (remplace proprement une version existante en conservant l'état), `uninstallAddon` (retourne les dépendants), `setAddonEnabled`, `importAddonManifest` (validation complète avant installation).

### Changed

- ZAILON est désormais structuré « Core + Add-ons » : les add-ons ne sont jamais chargés au démarrage (lazy) et un add-on défectueux ne bloque plus le launcher. Frosty/ReShade restent dans le Core cette version ; leur migration en add-ons officiels (`official.zailon.frosty`, `official.zailon.reshade`) suit.

## 1.68.0 — Intégration ReShade : détection, presets, dépendances et compatibilité

### Added

- **Logique ReShade complète** (`src/lib/reshade.ts`, 17 tests, spec §1-115) :
  - `resolveReShadeTarget` — le vrai exécutable de rendu plutôt que le launcher (confiance plafonnée sur un launcher, §3-4) ; `detectGraphicsApi` avec adaptateurs connus (NFS16.exe → DirectX, Cyberpunk, RDR2 → Vulkan, Unreal/Unity en heuristique) et fallback manuel (§5-6).
  - `classifyReShadeInstallation` — NotInstalled / Installed / UpdateAvailable / Broken (§2, §23) et `versionCompare` sémantique.
  - `inspectReShadePreset` — scoring pondéré (seuil 25) : un simple `.ini` n'est jamais classé ReShade sans indices ; ENB est explicitement exclu (§26). `resolveShaderDependencies` + registre des packs (qUINT, SweetFX, prod80, AstrayFX, standard) avec sources officielles (§30-32) et `referenceCountFor` / `unusedShaderPacks` (pack partagé jamais supprimé, §47-48).
  - `classifyReShadeCompatibility` — EAC / BattlEye / ACE / Vanguard / nProtect détectés → jamais d'installation automatique ; NTE classé Restricted/Experimental (§58-61) ; jeux solo connus → installation proposée (§62).
  - `resolveReShadeSessionStrategy` (Vanilla et « Démarrer sans ReShade » → Disabled, §38, §106-107), `findProxyDllConflicts` (dxgi/d3d11 jamais écrasés, §91-92), fingerprint de déploiement pour le fast check (§78), `planReShadeUpdate` (verrou de version bloqué, jeu en cours → différé, §13-14, §20).
- **Bloc ReShade en Configuration > Apparence** (modèle du bloc Frosty) : état (non installé / téléchargement lancé / installé adopté), exécutable cible + API + confiance, compatibilité avec avertissement anti-cheat (NTE en rouge), boutons « Installer depuis reshade.me » (source officielle uniquement, §9) / Mettre à jour / Désinstaller / Vérifier, **mises à jour automatiques**, **verrou de version 🔒** et **Démarrer sans ReShade** (diagnostic) persistés par jeu, activation ReShade **par profil** (persistée dans le store).
- **Explorer** : badge « ReShade Preset » + nombre de dépendances sur les cartes, bloc « ReShade Preset détecté » avec dépendances shaders dans l'aperçu (§25-28) — l'installation vérifiera la présence de ReShade et les sources officielles.
- `ReShadeProfileState` dans les types + défaut par profil (désactivé, Vanilla reste le profil de référence, §35) + action store `setProfileReshade` persistée.

### Changed

- Aucun pipeline de téléchargement natif cette version : le bloc guide vers le setup officiel (le setup gère DirectX/OpenGL et le layer Vulkan, §7) — le téléchargement automatisé, les mises à jour groupées et le Quick Panel ReShade arrivent dans une prochaine mise à jour.

## 1.67.0 — Lazy loading réel : squelettes de chargement + cache santé providers

### Added

- **Cache de santé des providers** (`src/lib/lazyPages.ts`, 5 tests, spec Startup §20) : un seul état par processus partagé entre Explorer et Intégrations avec TTL 5 minutes — ouvrir les deux pages n'appelle plus le getter natif qu'une fois, et aucun test d'API n'a lieu au démarrage. Invalidation possible (refresh manuel).
- **Squelettes de chargement réutilisables** (`src/components/UI/Skeleton.tsx`) : `Skeleton`, `SkeletonCard`, `SkeletonGrid`, `SkeletonRows`, `SkeletonIndicators`, `PageSkeleton` — blocs pulsés aux dimensions du contenu final, conformes à la règle « afficher le shell immédiatement, charger ensuite » (§5).
- **Visual Profiles** : la page affiche désormais un squelette complet (en-tête + indicateurs + panneaux) pendant le premier chargement du backend au lieu d'un contenu vide avec un simple texte d'état — la page n'est montée qu'à l'ouverture (§16).
- `scheduleAfterIdle` : exécution d'initialisations non critiques après le premier paint (requestIdleCallback avec repli setTimeout, annulable).

### Changed

- Explorer et Paramètres > Intégrations utilisent le cache santé partagé — plus d'appel IPC redondant à chaque ouverture d'onglet.

## 1.66.0 — Démarrage optimisé (StartupCoordinator) + backend Frosty générique (NFS 2015)

### Added

- **StartupCoordinator** (`src/lib/startup.ts`, 7 tests) : pipeline de démarrage en phases — Bootstrap → Shell → État local → Sessions → Services → Maintenance différée. Priorités Critical/Interactive/Normal/Background/Idle, délais croissants, jamais de réseau avant l’interactif (spec Startup §1-25).
- **Câblage App** : la réconciliation du catalogue staged et les listeners d’arrière-plan (tâches, demandes d’installation externes) sont désormais **différés hors du chemin critique** — le shell s’affiche depuis le cache, la récupération de session reste prioritaire, et le réseau ne conditionne plus jamais Time To Interactive.
- **UIWatchdog** : en développement, tout bloc de l’event loop > 250 ms est signalé (`Long UI task detected · durée ms`) — outil de chasse aux freezes (zéro coût en prod). **StartupProfiler** : mesures timeToWindow / Shell / Interactif, visibles en mode dev.
- **LibraryStartupCache** : résumé léger (id, titre, miniature, favori, running, temps de jeu, profil actif) — jamais les listes de mods.
- **Backend Frosty générique** (`src/lib/frosty.ts`, 12 tests) : registre d’adaptateurs registry-driven (§75), **FrostyRuntimeVersionManager** (1.0.6.3 préférée pour NFS 2015, 1.0.7 bloquée — jamais « latest » imposé, §29-30), **FrostyPackageInspector** (.fbmod moderne / structure legacy / non supporté — jamais traité comme archive générique, §33), ordre de chargement (haut/bas/top/bottom + hints « place at bottom », §42-43, §88), **FrostyPlatformCompatibility** (EA App natif, Steam/Epic → DatapathFix, conflit DatapathFix + LaunchPlatformPlugin détecté, §47-52), détection de conflits d’overhauls (Evolution vs Remastered, §87), fingerprint de déploiement (staging mis en cache, §78-80).
- **IModBackend** (`src/lib/modBackends.ts`, 7 tests) : 4 backends derrière la même UI — Cyberpunk VFS / Frosty / NTE PAK / Dossier générique — et **détection automatique par exécutable** (NFS16.exe → Frosty, Cyberpunk2077.exe → VFS, §59-60). Le backend Frosty n’est **jamais initialisé au démarrage** (lazy-only, §96).
- **Bloc Frosty en Configuration** (jeu Frosty détecté) : runtime recommandé, stratégie plateforme, alerte de version bloquée, conflit plugins avec bouton « Corriger », alerte overhauls, bouton « Tester le profil ».
- `src/vite-env.d.ts` ajouté (types Vite client pour les gates DEV).

### Changed

- Boot allégé : les opérations secondaires ne sont plus lancées simultanément avec la récupération de session — l’UI devient interactive sans attendre les services distants.

## 1.65.0 — Partage de profils v2 : code léger copiable + dialogue export/import avec reproductibilité

### Added

- **Code de profil `ZAILON-PROFILE-V1:`** (`src/lib/profileShareCode.ts`, 10 tests) : manifeste léger encodé en base64url compact, validé strictement au décodage (format manifeste uniquement, aucune exécution), taille plafonnée — les profils lourds passent par l’export fichier. Copiable depuis l’export, collable dans l’import : **aucun serveur ni compte** (spec §51-53).
- **Dialogue « Partager le profil »** (Bibliothèque > Jeu > Configuration > Sauvegardes) : onglets Exporter / Importer, **sans `window.confirm`**.
  - Export : mode **Léger** (configuration, mods, versions, sources, ordre, réglages — mods retéléchargés à l’import) ou **Hors ligne** (paquets locaux inclus), **taille estimée**, **reproductibilité %** (spec §57), avertissement mods locaux sans source (§33), boutons « Copier un code » (léger) / « Exporter un fichier .zailon-profile ».
  - Import : fichier `.zailon-profile` (aperçu natif validé : chemins sûrs, pas de symlink, limite de taille) **ou code collé**, aperçu complet avant création (jeu source, mods, frameworks, fichiers intégrés, avertissements), **création systématique d’un nouveau profil sans écrasement** — nom sans collision « Default (2) » (§37), alerte si le profil vient d’un autre jeu (§38), extraction optionnelle des fichiers intégrés dans le dossier Mods.
- **Chemins portables** (spec §45-46) : l’export neutralise tous les chemins absolus utilisateur (`C:\Users\…`) en jetons `GAME_ROOT` / `PROFILE_STORE` ; l’import supprime les chemins machine (bypass, clonedFrom, template).
- **Réglages jeu transportables** (spec §44) : disposition clavier (QWERTY virtuel), chaîne de lancement (`launchAdapter`) et fond multimédia inclus dans le manifeste — jamais de clés API, jetons ou données personnelles.
- `APP_VERSION` du store resynchronisé (la valeur embarquée datait de 1.62.0).

### Changed

- `importProfileManifest` crée toujours un profil nommé sans collision et sélectionné, avec nettoyage des chemins machine.
- La section Sauvegardes de Configuration affiche deux actions claires (Exporter / Importer) au lieu de trois boutons disparates ; le dialogue gère les deux modes d’export et les deux entrées d’import.

## 1.64.0 — Accueil multimédia : fonds vidéo locaux + YouTube sans clé API + audio discret

### Added

- **Fond de l’Accueil par jeu** (Bibliothèque > Jeu > Configuration > Apparence) : type Automatique / Image / Vidéo locale / YouTube, avec miniature, aperçu muet (le Hero se met en pause pendant l’aperçu — un seul lecteur actif) et réglages audio globaux.
- **YouTube sans Data API** (`src/lib/youtubeUrl.ts`) : aucun téléchargement ni clé — l’URL est validée (domaines whitelistés : watch, youtu.be, shorts, embed, live), l’identifiant est extrait puis seul cet identifiant entre dans l’URL du lecteur `youtube-nocookie.com`. La vidéo reste diffusée par YouTube, timestamps `t=`/`#t=` conservés.
- **Lecteur `BackgroundMediaLayer`** : démarre **toujours muet** (politique d’autoplay), 🔇 → 🔊 au clic, volume ambiant **7 % par défaut** (0-20 % réglable, persistant), image affichée d’abord puis fondu quand la vidéo est prête, fallback silencieux vers le Hero/Cover hors connexion ou vidéo indisponible.
- **Pause/destruction automatique** : hors focus (blur/minimisé — aucun décodage en arrière-plan), dès le clic sur **Jouer** (duck avant lancement), pendant toute la session, et reprise muette à la fin. ZAILON en arrière-plan ou un jeu qui démarre = plus aucun fond vidéo.
- **MediaPlaybackArbiter** : maximum un lecteur de fond actif ; le contenu distant est isolé (whitelist stricte, messages API vérifiés par origine, aucun privilège natif).
- Réglages globaux persistés dans Paramètres > Apparence > Fonds multimédia (fond vidéo, audio, toujours muet, pause hors premier plan, volume).

### Changed

- L’Accueil utilise désormais le système multimédia complet : image du jeu affichée instantanément, puis vidéo en fondu si configurée et disponible.

## 1.63.0 — État Installer/Désinstaller synchronisé dans Explorer (spec §15-23)

### Added

- État d'installation distant canonique dérivé des mods locaux (`src/lib/remoteInstallState.ts` — identité distante, classification Install / Installed / UpdateAvailable / Installing / Removing / Error) : Explorer ne devine plus l'état depuis la carte locale, il le dérive de la vérité (packages installés + référence distante attachée).
- Bouton **Désinstaller** (danger rouge) après installation — y compris GameBanana — sans refresh manuel (spec §18) : la carte change immédiatement.
- Dialogue multi-profils lors de la désinstallation (spec §20) : si le mod est utilisé par plusieurs profils, choix « Retirer du profil actuel » / « Désinstaller complètement » / « Annuler ».
- Boutons désactivés + état « Installation… » pendant le téléchargement (spec §22) — pas de double clic.
- Clé transitoire `installingRemote` / `removingRemote` dans le store (état pendant opération).

### Changed

- `installMod` attache désormais la référence distante (`externalReference`) au package installé : l'état « Installé » survit au redémarrage et au changement de profil.
- `uninstallRemoteMod(provider, remoteModId, fileId, mode)` supprime/détache les packages du profil (mode `current`) ou de tous les profils (mode `all`), puis émet l'événement de synchronisation.
- Même logique pour tous les providers (Nexus, GameBanana, CurseForge) — pas de recodage par page (spec §23).

## 1.62.0 — Persistance de l'accent corrigée + Theme Bootstrap + DesignTokenService

### Fixed

- **LE bug de persistance de la couleur d'accent** (spec §1, §6) : la couleur choisie dans Apparence était appliquée en session mais **absente de `partialize`** (zustand persist) — au redémarrage, la migration retombait sur le blanc par défaut. `accentColor` est maintenant persisté, et `flushPendingSettings` est aussi déclenché sur `pagehide` (fermeture du webview Tauri), en plus de `beforeunload` (spec §4).

### Added

- **DesignTokenService** (`src/lib/designTokens.ts`, 8 tests) : `applyAccentTokens` injecte les 8 tokens dérivés (`--zailon-accent-hover/active/muted/border/text/contrast`, `--zailon-focus-ring`), `applyDangerTokens` la palette danger **indépendante de l'accent** (`--zailon-danger*`, spec §14, §70-71 — un accent rouge n'absorbe jamais le Danger), `bootstrapTheme` applique les tokens persistés **avant le premier rendu** (spec §7 : plus aucun flash du thème blanc par défaut). Clé de persistance `zailon-v1` centralisée.
- **`--zailon-danger` / `--zailon-danger-hover` / `--zailon-danger-muted` / `--zailon-accent-border` / `--zailon-accent-contrast`** dans `index.css`.
- **AccentTokenAudit** (spec §68) : test CI qui échoue si un composant hardcode une couleur d'action (fonds d'accent prédéfinis, textes de contraste sombres) au lieu des tokens.

### Changed

- **Migration de toutes les couleurs d'action hardcodées → tokens** (spec §9-13) : le bouton **Jouer** (Accueil + Bibliothèque), **Ajouter**, **Installer**, **Détails**, le **sidebar actif**, les boutons **Retour au jeu / Fermer / Créer / Réparer / Enregistrer**, le Quick Panel — `bg-[#dbe8e5]` → `var(--zailon-accent)`, textes de contraste → `var(--zailon-accent-text)`, hover → `var(--zailon-accent-hover)` (44 occurrences au total). Le thème suit maintenant la couleur choisie partout, y compris après redémarrage.
- App.tsx utilise désormais le DesignTokenService (logique de tokens dédupliquée).

## 1.61.0 — Bulles d'aide uniformes : ZailonInfoPopover (ⓘ / ⚠ / technique)

### Added

- **ZailonInfoPopover** (`src/components/UI/ZailonInfoPopover.tsx`) — la bulle d'information UNIFORME de ZAILON (spec §40-42) : variantes **info (ⓘ)**, **warning (⚠ ambre)** et **technique** — jamais « ! » pour une simple documentation (§40) ; ouverture au survol après ~200 ms (§42), **clic = verrouille la bulle** (la souris peut entrer dans la bulle), clic ailleurs ou Échap referment et déverrouillent ; contenu court dans la bulle, **« En savoir plus »** ouvrant une petite modale scrollable pour les textes longs (§41).
- **`popoverHasMore` / `popoverShortText`** dans `src/lib/infoPopover.ts` (logique pure, 6 tests) : les textes de plus de 220 caractères sont tronqués dans la bulle et gagnent automatiquement le bouton « En savoir plus ».

### Changed

- **12 bulles migrées** vers le composant unique (spec §40 « Usage global ») : Configuration du jeu (Bypass, chemins additionnels, performance, priorité, FPS), Paramètres (couvertures, illustrations, sources, fournisseurs), Visual Profiles (Diagnostic).
- **Ancien `InfoBubble` supprimé** — un seul système de bulles reste dans ZAILON.

## 1.60.0 — Paramètres : sections repliables (accordion) + mémoire + recherche

### Added

- **AccordionSection** (`src/components/UI/AccordionSection.tsx`) — section repliable (spec §31-36) : en-tête compact icône + titre + sous-titre court + chevron (§35), **repliée par défaut** (§31), animation 180 ms annulée sous Reduce Motion (§36).
- **15 sections Paramètres converties en accordions** (spec §52 — réduire le scroll) : Préférences, Apparence, Tâches, Illustrations, Discord, Mode jeu, Panneau rapide, Contenu, Fournisseurs, NXM, Mises à jour des mods, Application updates, Library statistics, Stockage, À propos.
- **Mémoire de l'état** (spec §33) : la dernière section ouverte est mémorisée (`localStorage`) et restaurée au prochain lancement ; les nouvelles installations partent tout replié.
- **Recherche et liens internes ouvrent la section** (spec §53-54) : `goToSetting` et l'événement `open-settings-section` (Quick Panel → Configurer) déploient automatiquement l'accordion cible avant de défiler (map `SETTINGS_SECTION_BY_LABEL`).
- **Point ambre d'alerte** (spec §39) : « Application updates » affiche un point dans l'en-tête quand une mise à jour est disponible ou qu'une erreur est présente — les informations critiques ne sont jamais totalement cachées par un accordion.

### Changed

- En-têtes de sections uniformisés (même hauteur, sous-titre très court) — la densité visuelle des Paramètres est nettement réduite.

## 1.59.0 — Design System : ZailonSwitch global + parallaxe carte entière

### Added

- **ZailonSwitch** (`src/components/UI/ZailonSwitch.tsx`) — le composant UNIQUE des préférences ON/OFF (spec « Refonte globale des toggles » §1-13) : piste arrondie, rond à gauche = OFF / à droite = ON, **ON = couleur d'accent `--zailon-accent`** (jamais de couleur hardcodée, §2-3), animation courte 140 ms (thumb + piste, pas de bounce, §9), focus clavier visible (§10), disabled (§11), loading facultatif (§12), `role="switch"` + `aria-checked` (§58), `size="compact"` pour les lignes denses (§45). Réduire les animations = transition annulée (`prefers-reduced-motion`, §9).
- **ZailonSelectionCheckbox** (`src/components/UI/ZailonSelectionCheckbox.tsx`) — la checkbox de SÉLECTION multiple, distincte du switch (§6-7) : sélectionner 20 mods reste une checkbox, activer une fonction reste un switch. Règle du design system : **préférence binaire = switch, sélection = checkbox, action = bouton**.
- **`accentContrastText`** dans `src/lib/designSystem.ts` (logique pure, 7 tests) : contraste automatique du texte sur l'accent (§47-48) — utilisé par App pour `--zailon-accent-text` (dédupliqué).

### Changed

- **Migration complète des cases à cocher booléennes → ZailonSwitch** (spec §5, §44, §61 — mêmes valeurs, seule la présentation change) : Paramètres (Préférences, Tâches et notifications, Illustrations, Discord, Mode jeu, Panneau rapide, Explorer, Mises à jour des mods, Application updates, À propos — 24 contrôles), Update Provider (« Ne plus afficher les nouveautés »), Import intelligent (« Activer pour le prochain lancement »), ancien `Toggle` supprimé (ModCard, Configuration, Diagnostic, Clavier — §60). La checkbox `accent-gold` ne subsiste que pour les vraies sélections multiples (sélection de mods, dossiers d'import, « Tout visible » à état intermédiaire).
- **Parallaxe sur la CARTE ENTIÈRE** (spec §16-28, §64-66) : `GameLibraryCard` tout entier (conteneur, couverture, titre, badges, favori) s'incline comme une seule jaquette — plus jamais uniquement l'image. Rotation max 4°, scale max 1.012 (pas un zoom), seul le survol anime (aucun loop global), retour au neutre 220 ms, **clic droit = retour au neutre avant l'ouverture du menu contextuel** (§65). Zones de clic préservées (§21).
- **« Réduire les explications » ON par défaut** pour les nouvelles installations (spec §37) ; les installations existantes conservent leur choix (`?? true` seulement si la préférence n'existe pas).

### Fixed

- **Doublon « Réduire les explications »** dans Paramètres : deux étiquettes identiques s'affichaient côte à côte — supprimé.

## 1.58.0 — Quick Panel : toggle Présence Discord + lien Configurer

### Added

- **État Discord honnête dans le panneau** (spec §38) : section « Discord » — ✓ « Présence active · <jeu> » **seulement si** le réglage est activé ET la présence réellement publiée (connexion IPC + session publiée, `lastDiscordPublished`) ; « En attente de Discord » quand le client est fermé (spec §33) ; « Désactivé » sinon. Jamais de faux ✓.
- **Bascule rapide** (spec §38) : clic sur « Présence Discord » depuis le panneau → `set-discord` → le store persiste le réglage et re-synchronise la présence (ClearPresence si désactivée, spec §34), l'état est re-émis.
- **Lien « Configurer »** (spec §38) : ouvre ZAILON > Paramètres > section **Discord Rich Presence** (nouvel événement `open-settings-section`, défilement jusqu'à la section) et ramène la fenêtre principale au premier plan.
- **`quickPanelDiscordState`** dans `src/lib/quickPanelState.ts` (logique pure, 4 tests) : `published = enabled && connected && publishedGameName` — la source de vérité reste la session publiée, pas la configuration.

## 1.57.0 — Discord Rich Presence : assets par jeu + diagnostic + timestamp préservé

### Added

- **Assets Discord par jeu** (spec §17-21, §49-50) : `discord-assets` (`src/lib/discordAssets.ts`) — mapping static des jeux connus (Cyberpunk → `cyberpunk2077`, NTE → `nte`, Photoshop, Blender) + chaîne de résolution **asset jeu → clé globale → générique du type (`generic-game` / `generic-app`) → logo ZAILON**. Jamais d'upload d'images locales (spec §18).
- **Timestamp préservé après recovery** (spec §14, §95) : `startTimestampOverride` (natif) — après un redémarrage de ZAILON pendant un jeu, le timer Discord part du **vrai début de session** (`session.startedAt`) au lieu de repartir de zéro.
- **Diagnostic Discord compact** dans Paramètres (spec §40) : Application ID, Discord détecté, RPC connecté, session publiée, asset utilisé, dernière mise à jour — alimenté par la trace `lastDiscordPublished` du store.

### Changed

- La grande image utilise désormais le résolveur par jeu (`resolveDiscordAsset`) au lieu de la seule clé globale.

## 1.56.0 — Discord Rich Presence : Application ID centralisé + présence honnête

### Added

- **Application ID ZAILON centralisé** (spec Discord §5) : `1509971526987022497` défini une seule fois dans `src/lib/discordPresence.ts` — le champ Paramètres est **prérempli**, aucun OAuth, bot ou clé n'est demandé pour la présence locale (spec §6).
- **Présence honnête construite depuis la session** (spec §2, §8, §28) : `buildDiscordActivity` génère `details`/`state` depuis la session prioritaire réelle — variantes de wording (spec §25), apps non-jeux « Session créative » (spec §9-11, §48), mode minimal « Via ZAILON » (spec §36), **jamais l'exemple recopié** (pas de party/joinSecret factices, spec §27-28).
- **Anti-« 0 mods » incertain** (spec §23, §60) : si le profil référence des mods mais que le compteur n'en résout aucun (cache vide, recovery en attente), la présence affiche « Profil X » au lieu de mentir avec « 0 mod(s) actif(s) ».
- **Anti-flap Alt+Tab** (spec §15) : un simple changement de premier plan ne remplace plus l'activité toutes les 2 secondes — bascule différée 3,5 s (annulée si la priorité revient) ; la session publiée terminée bascule immédiatement (spec §13).
- **Fallback asset `zailon`** (spec §50) : sans clé d'asset spécifique, la grande image retombe sur le logo ZAILON — la présence ne rate jamais à cause d'une image.
- **Toggle « Mode minimal »** dans Paramètres > Discord (spec §35-36).

### Fixed

- **La présence ne démarre plus au lancement** (spec §9, critère bloquant §63) : le chemin natif `launch_game → set_discord_activity` est supprimé — la présence n'est publiée qu'au vrai `GameRunning` via `syncDiscordPresence` (session prioritaire). Pour NTE, plus aucune activité pendant le launcher / l'UAC ; le timer Discord commence au vrai jeu (spec §12).

## [Unreleased]

### Added

### Changed

### Fixed

### Performance

### Security

### Compatibility

### Experimental

### Removed

## 1.9.0 — Profils immuables et diagnostic transparent

- Références exactes `packageId`/`versionId`/`contentHash` par profil.
- Empreintes SHA-256 complètes : les contenus renommés sont reconnus, les versions différentes restent isolées.
- Nouvelle vue « Vue ZAILON » des fichiers gagnants, remplacés et visibles au runtime.
- Diagnostic « Pourquoi ce mod ne fonctionne pas ? » avec preuves et niveau de confiance.
- Conflits expliqués en langage naturel avec choix explicite du gagnant.
- Contrôle automatique jeux/profils/mods après une mise à jour ZAILON.
- Profil stable protégé avec point de restauration avant déverrouillage.

## 1.7.3 — Lancement fluide et récupération après interruption

- Déplace l’analyse, le hachage, la sauvegarde et la copie des mods sur une tâche
  bloquante dédiée afin que la fenêtre Windows reste réactive pendant la préparation.
- Affiche la phase, le nombre de fichiers et la progression réelle directement sur
  le bouton Jouer, tout en empêchant les doubles lancements.
- Écrit un état de session atomique et un journal durable avant chaque remplacement
  de fichier pour pouvoir restaurer une préparation interrompue au lancement suivant.
- Détecte une session de jeu encore active avant toute récupération afin de ne jamais
  retirer ses fichiers pendant que son processus fonctionne.
- Conserve désormais les sauvegardes lorsqu’une restauration échoue et marque la
  session pour récupération, au lieu de supprimer les seules copies originales.
- Ajoute des tests de restauration après interruption et de conservation des
  sauvegardes en cas d’erreur de nettoyage.

## 1.7.2 — Auto-réparation des frameworks déjà dédupliqués

- Corrige la réutilisation d’un paquet déjà présent : redscript, RED4ext et CET sont
  désormais réparés depuis la source sélectionnée au lieu de conserver les runtimes
  mis en quarantaine par un ancien import.
- Ajoute une migration automatique au prochain audit ou lancement : les runtimes
  historiques sont restaurés depuis la quarantaine uniquement après validation du
  chemin, du SHA-256 et de toutes les signatures physiques du fournisseur.
- Met immédiatement à jour le manifeste, les décisions de sécurité et l’inventaire
  de contenu après récupération, sans exécuter le moindre fichier.
- Ajoute des tests dédiés au paquet redscript dédupliqué et à la récupération
  sécurisée d’un ancien paquet depuis la quarantaine.

## 1.7.1 — Réparation du déploiement Cyberpunk importé depuis MO2

- Ajoute un manifeste physique normalisé par paquet et une carte virtuelle de profil
  construite avant le diagnostic des dépendances.
- Distingue un vrai fournisseur redscript, RED4ext ou Cyber Engine Tweaks d’un simple
  mod ou plugin grâce à plusieurs signatures de fichiers concordantes.
- Autorise uniquement les runtimes centraux exacts d’un fournisseur confirmé, sans
  exécuter de fichier pendant l’import ou la réparation.
- Corrige les conteneurs MO2 `root/` même lorsqu’un dossier de licences ressemble déjà
  à une racine du jeu.
- Ajoute dans Outils un audit du déploiement réel et une réparation transactionnelle
  des imports MO2 existants avec snapshot, rollback et rapport local.
- Bloque tout faux succès lorsqu’un profil actif produit zéro fichier ou lorsque le
  nombre de fichiers planifiés diffère du nombre réellement copié.
- Clarifie que l’export crée une archive de partage ; seul le bouton Jouer prépare et
  déploie temporairement les fichiers dans la racine du jeu.

## 1.7.0 — Migration sécurisée depuis Mod Organizer 2

- Ajoute dans Outils un assistant « Importer depuis Mod Organizer 2 » avec analyse
  en lecture seule, aperçu des profils et confirmation explicite avant copie.
- Recrée des profils ZAILON séparés avec activation, désactivation, priorité inversée
  correctement, séparateurs et règles `.mohidden`.
- Copie chaque mod une seule fois vers le store ZAILON, réutilise les empreintes
  existantes et conserve les métadonnées MO2 par liste blanche.
- Isole l’Overwrite global dans le profil MO2 actif et laisse les téléchargements
  ainsi que les exécutables décochés par défaut.
- Filtre les `.meta` de téléchargements en JSON sans URL temporaire, jeton ni
  `userData`, et ne lance jamais un exécutable importé.
- Produit un snapshot SHA-256 avant/après et un rapport local de migration, sans
  modifier l’instance MO2 source.
- Documente l’audit local, USVFS, les plugins, les licences et les décisions de
  réutilisation ; aucun binaire, plugin, thème, icône ou traduction MO2 n’est inclus.

## 1.6.1 — Explorer unifié et import sécurisé des exécutables

- Simplifie la barre de titre en « ZAILON · version » sans le sous-titre Universal Mod Launcher.
- Unifie Nexus et GameBanana autour des contrôles Grille/Liste, tri, filtres, pagination et résultats partagés.
- Remplace le sélecteur de colonnes par un bouton accessible qui cycle directement entre 2 et 3 colonnes avec repli responsive.
- Sépare la validation des chemins d’archive de l’évaluation des fichiers sensibles : `tools/scc.exe` n’annule plus automatiquement tout l’import.
- Ajoute une classification par extension, signature magique, destination, adaptateur de jeu et SHA-256, sans jamais exécuter le fichier.
- Ajoute les décisions exclusion, quarantaine ou stockage inactif, un staging transactionnel et le statut « terminé avec avertissements ».
- Conserve les évaluations dans la quarantaine, le manifeste du mod et l’historique persistant des tâches.

## 1.6.0 — Profils isolés, opérations groupées et adaptateur FiveM client

- Corrige la création de profil : un profil neuf est toujours vide ; seule la duplication explicite reprend états, ordre et réglages.
- Matérialise chaque profil dans une arborescence native distincte avec manifestes, ordre, réglages, overwrite, generated, deployment et cache.
- Ajoute les opérations groupées transactionnelles (activation, transfert, copie, retrait, étiquettes) avec sélection clavier, journal et annulation.
- Déplace les nouveaux paquets vers un store immuable tout en gardant la compatibilité de lecture avec l’ancien staging.
- Ajoute la détection du client FiveM, une base neutre par signatures et un mapping de plugins qui refuse explicitement les ressources serveur.
- Active les matériaux natifs Tauri (Mica/Acrylic ou Vibrancy) avec diagnostic honnête et repli CSS/compositeur, sans injection.
- Ajoute la couleur d’accent centrale, les colonnes Explorer persistantes, la visionneuse plein format et un historique de notifications temporisées.
- Documente l’analyse des références et le rapport de validation dans `docs/ui-reference-analysis.md` et `docs/bulk-profile-fivem-ui-report.md`.

## 1.5.0 — Déploiement vérifiable, Explorer réparé et interface enrichie

- Ajoute le backend de déploiement `TemporaryCopy` : préparation par profil, résolution des conflits, sauvegarde des fichiers du jeu, validation octet par octet, blocage du lancement en cas d’échec, capture des modifications et restauration après fermeture.
- Détecte les structures de mods Cyberpunk 2077 et diagnostique les prérequis CET, RED4ext, redscript, ArchiveXL, TweakXL, Codeware et REDmod sans prétendre qu’un mod a été chargé par le moteur du jeu.
- Répare GameBanana avec une recherche de jeux annulable utilisant les identifiants réels, un parseur tolérant au schéma, un cache et une galerie de captures progressive en parallaxe 3D.
- Unifie les couvertures dans les vues Grille, Liste illustrée et Compacte de la bibliothèque, avec recherche et filtre des illustrations manquantes.
- Centralise les tâches natives dans un historique persistant filtrable, avec cartes temporaires non bloquantes et réduction automatique de la boîte d’import après le vrai démarrage.
- Ajoute les effets Liquid Glass désactivés par défaut, leurs préréglages, l’aperçu en direct et un mode économie d’énergie, sans intégrer ni injecter DWMBlurGlass.
- Ajoute la fenêtre « Me soutenir » et ses liens HTTPS autorisés vers Ko-fi, PayPal et Haunt, sans télémétrie de paiement.
- Documente les contrats des fournisseurs, les états de déploiement et les limites honnêtes de cette architecture intermédiaire, qui n’est pas un VFS de type MO2.

## 1.4.0 — Nexus sécurisé, import asynchrone et intégration native

- Déplace l’authentification Nexus entièrement dans le backend Rust, conserve la clé dans le coffre du système, masque tout secret et expose uniquement l’état du compte et les quotas.
- Rend Explorer réellement multi-source avec les flux Nexus disponibles, le catalogue GameBanana, une fiche mod agrandie, galerie, clavier, zoom et filtres NSFW.
- Ajoute une recherche d’illustrations officielles Steam, une prévisualisation et un cache local validé avant utilisation.
- Porte la taille minimale visible à 14 px et ajoute les tailles Normal, Grand et Très grand ainsi que les densités Compacte et Confortable.
- Remplace l’import bloquant par des tâches natives en arrière-plan, annulables et persistantes, sans plafond arbitraire de 100 mods.
- Ajoute un staging par mod avec manifeste, empreinte, profil, inventaire de fichiers et déploiement Direct Copy sans écrasement.
- Ajoute les raccourcis bureau `zailon://`, le suivi du processus lancé et la présence Discord IPC locale configurable.
- Documente les limites réelles : pas de VFS dans cette version, téléchargement Nexus direct soumis à l’enregistrement public de l’application, fonctions de fichiers/processus limitées sur iOS.

## 1.2.3 — Explorer réel et lisibilité renforcée

- Rétablit Explorer avec les nouveautés réelles de GameBanana, une recherche locale sur les pages récentes, le choix du jeu et les affichages grille/liste.
- Corrige les identifiants de catalogue GameBanana et adapte l’intégration aux paramètres actuels de `List/New` et `Item/Data`.
- Ajoute le téléchargement et l’installation vers le dossier Mods du jeu sélectionné, la sélection du fichier le plus sûr et récent, et l’ouverture sécurisée de la page source.
- Masque les résultats adultes tant que l’option NSFW n’est pas activée et indique clairement les sources nécessitant une clé API.
- Porte tous les textes visibles de l’application à 11 px minimum et vérifie l’absence de débordement horizontal sur chaque vue principale.

## 1.2.2 — Accueil cinématique compact

- Recompose l’accueil comme une scène unique centrée sur le jeu : grand visuel, titre massif, bouton Jouer clair, commandes circulaires et informations de session en surimpression.
- Remplace la navigation textuelle par un rail fixe de boutons ronds et adopte une palette noire, blanche et vert-gris très claire inspirée de la référence fournie.
- Intègre en bas trois panneaux compacts alimentés par les vraies données ZAILON : activité des profils, mods/temps de jeu et bibliothèque récente.
- Conserve les contrôles Windows natifs et la barre d’état tout en les réduisant pour respecter la nouvelle hiérarchie visuelle.

## 1.2.1 — Correctif de publication macOS Intel

- Remplace le runner GitHub Actions retiré `macos-13` par le runner Intel standard `macos-15-intel`, afin que les quatre builds desktop se terminent et débloquent la publication automatique des sommes SHA-256.

## 1.2.0 — Refonte native et détection locale multi-sources

- Refonte complète de l’accueil autour du jeu sélectionné, avec héros visuel, métriques réelles, rail latéral adaptatif et barre d’état persistante.
- Correction des contrôles natifs réduire/agrandir/fermer grâce aux permissions Tauri explicites, au glisser natif et à une fermeture qui ne peut plus être bloquée par la sauvegarde d’état.
- Déplacement du menu clic droit des jeux dans un portail global pour éviter son découpage par les conteneurs; ajout d’un accès direct à l’apparence.
- Nouvel éditeur d’apparence transactionnel partagé entre l’accueil et les paramètres : jaquette, bannière, fond, logo, icône, vidéo, SVG, position, zoom, remplissage, aperçu, restauration, Enregistrer et Annuler.
- Nouvelle détection rapide/complète avec résultats sélectionnables, diagnostics, recherche et filtres pour Steam, Epic Games et les applications Windows déclarées.
- Archivage temporaire d’Explorer et retrait du catalogue trompeur tant que les connecteurs et téléchargements ne sont pas fiables.
- Audit statique documenté des cinq managers fournis, avec décisions de réutilisation et risques de licence/signature.

## 1.1.1 — Native test compatibility

- Enabled Tauri's asset protocol feature explicitly so native unit tests validate the same local-resource configuration as packaged builds.

## 1.1.0 — Steam library discovery and game management

- Replaced the directory-only Steam scan with platform Steam discovery, `libraryfolders.vdf` parsing and `appmanifest_*.acf` metadata.
- Added a review screen with progress, diagnostics, duplicate prevention and executable selection before games are added.
- Added right-click and ellipsis actions for games: play, manage mods, open game/mod folders, favorites, hide and safe library removal.
- Added persistent local game resources (cover, logo, icon, background, banner and video) with file copying and drag-and-drop import.
- Added profile rename/removal, per-profile mod priorities, notes and file-level conflict indicators.
- Clarified that direct-folder deployments do not yet provide a virtual filesystem or a guaranteed game-engine load order.

## 1.0.1 — Native window and signed updater

- Fixed the desktop content surface so it fills the real native window at every size.
- Added working native minimize, maximize/restore, close and title-bar drag behavior.
- Added restoration of a valid last window size, position and maximized state.
- Added signed in-app updates with Stable/Beta channels, real progress, retry and local update logs.
- Added a local pre-update snapshot that preserves existing games, mod profiles, settings, statistics and resources.
- Updated GitHub release automation to publish updater metadata, signatures and SHA-256 checksums.
