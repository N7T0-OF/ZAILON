# Changelog

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
