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

## [Unreleased]

> Pendant le développement, chaque changement visible par l'utilisateur est ajouté
> ci-dessous dans la catégorie appropriée (voir `AGENTS.md`). Au moment d'une release,
> cette section est renommée `## [X.Y.Z] - AAAA-MM-JJ` puis une nouvelle section
> `[Unreleased]` vide est recréée. Le workflow GitHub génère automatiquement les
> Release Notes à partir de cette section et refuse de publier si elle est vide.

### Added

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
