# Changelog

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

## [Unreleased]

### Added

- **« Sans couverture » supprimé définitivement** (spec §1) : le filtre et la case à cocher disparaissent — chaque jeu/app possède désormais une représentation visuelle.
- **Couverture automatique `FallbackArtwork`** (spec §2-3) : sans artwork, ZAILON génère une carte propre — teinte déterministe du nom (accent), dégradé léger, icône centrée, titre — jamais un rectangle gris. Appliqué à la Bibliothèque ET aux cartes rapides de l'Accueil.
- **Parallaxe 3D subtil des couvertures** (spec §4-9, §48, §58-59) : la souris incline la carte (max 4°, scale 1.012 — pas un zoom), `perspective: 900px`, retour au repos 220 ms, `will-change` uniquement au survol, mouvement appliqué directement au style (zéro rerender React par déplacement — un hover ne re-rend jamais la grille).
- **Réglages Apparence** (spec §11-12) : mode « Animations » (Automatique / Activées / Réduites, défaut Automatique — suit « Réduire les animations » du système) + ligne compacte « Effet 3D des couvertures » avec bulle d'aide.
- **Parallaxe respectueux des contraintes** (spec §10, §13) : désactivé sur écrans tactiles, quand les animations sont réduites ou que le toggle est éteint ; aucun calcul hors survol.

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
