# Analyse des managers de référence

Date de l’audit : 18 juillet 2026
Source analysée : `G:\2_Logiciel\CLAUDE CODE\exemple managers`

## Méthode et limites

L’inventaire couvre les cinq dossiers fournis, soit 2 056 fichiers utiles et environ 404,6 Mio après exclusion des caches WebView2, caches GPU, `node_modules` et sorties Rust. Les fichiers texte, manifestes, ressources, métadonnées PE, signatures Authenticode et, lorsqu’il était présent, le code source ont été inspectés. Les exécutables tiers non signés n’ont pas été lancés et aucun binaire n’a été désassemblé.

Cette distinction est importante : `sts2-mod-manager` contient un dépôt source auditable; les quatre autres dossiers sont des distributions installées. Leur architecture peut être déduite de leurs dépendances et ressources, mais leur comportement interne ne peut pas être garanti sans source.

## Résumé décisionnel

| Référence | Forme observée | Points à retenir | Points rejetés / risques | Licence exploitable |
| --- | --- | --- | --- | --- |
| Aurora | Application Qt/QML empaquetée, plugins ASI/DLL et ressources Unreal | Distribution compacte, prise en charge de chargeurs spécialisés | Injection par DLL proxy, binaire opaque et non signé, forte spécialisation | Aucune licence trouvée |
| Caffeine | Qt 6/QML, aria2, DuckDB, FFmpeg, 7-Zip, Qt Installer Framework | File de téléchargements dédiée, cache structuré, cartes par communauté | 226 Mio, chaîne TLS/update en erreur dans le journal, binaire non signé | Aucune licence trouvée |
| NTEMM | Application Tauri probable avec chargeur ASI/DLL et ressources intégrées | Séparation application/chargeur/ressources, installation simple | Chargeur injecté, code absent, icônes de personnages potentiellement protégées | Aucune licence trouvée |
| STS2 Mod Manager | Tauri 2 + React/TypeScript + Rust, dépôt complet | Transactions, sauvegardes, provenance, dérive, tests et QA native | Très spécialisé STS2, complexité et coût de maintenance élevés | MIT, attribution requise en cas de copie |
| ZZZ Mod Manager | Flutter Windows + WebView2 et plugins desktop | Onboarding, glisser-déposer, symlinks, tags automatiques, menu contextuel | Marketplace WebView fragile, envoi automatique de F10, ressources de jeu protégées | Aucune licence trouvée |

## Aurora

### Inventaire et architecture

- 20 fichiers, environ 58,3 Mio.
- `Aurora.exe` pèse environ 45,9 Mio et n’est pas signé.
- Le dossier `Bin` contient 7-Zip, des proxys `ddraw.dll`, `dsound.dll` et `version.dll`, trois modules ASI et des triplets Unreal `.pak/.ucas/.utoc`.
- Les chaînes intégrées indiquent une interface Qt 6/QML; le code source et les manifestes de licence ne sont pas présents.

### Forces

- Empaquetage réduit et lisible pour un outil spécialisé.
- Séparation claire entre l’interface principale, les outils d’archive et les composants de chargement.
- Prise en charge explicite de formats Unreal et ASI.

### Faiblesses et décision

Les DLL portant le nom de bibliothèques système correspondent au schéma classique de chargement par proxy. Ce modèle peut être nécessaire pour certains jeux, mais il augmente fortement le risque d’antivirus, de conflit de versions et de restauration incomplète. ZAILON ne reprend ni ces binaires ni cette stratégie globalement. Un futur adaptateur de chargeur devra être isolé par jeu, afficher les fichiers qu’il modifie et créer une sauvegarde transactionnelle.

## Caffeine

### Inventaire et architecture

- 1 447 fichiers, environ 226,4 Mio.
- `Caffeine.exe` annonce « Caffeine - Game Mod Manager », société ModuliCorvus, version de fichier `0.0.1`; il n’est pas signé.
- Qt 6/QML fournit l’interface; aria2 gère vraisemblablement les transferts; DuckDB fournit un stockage analytique/local; FFmpeg couvre les médias; 7-Zip et `archive.dll` couvrent les archives.
- Les ressources contiennent des communautés Genshin Impact, Honkai: Star Rail, Wuthering Waves et Zenless Zone Zero, ainsi qu’une plateforme GameBanana et une boucle vidéo.
- Le manifeste Qt Installer Framework sépare application, runtime Qt, ressources, dépendances système et bibliothèques tierces.

### Observation d’exécution déjà présente dans les fichiers

Le journal `broad_20260718.log` montre trois défauts réels : un composant de barre d’onglets sans titre, une connexion WebSocket aria2 avec certificat auto-signé non approuvé et un contrôle de mise à jour qui ne retrouve pas le XML attendu. Ces erreurs expliquent pourquoi une architecture riche ne suffit pas sans diagnostics lisibles ni tests de la chaîne de mise à jour.

### Forces

- Bonne séparation conceptuelle des transferts, du cache, des médias et de l’interface.
- Ressources organisées par communauté et plateforme.
- aria2 est une référence pertinente pour pause, reprise et progression réelle.

### Faiblesses et décision

Le coût de distribution est très élevé, le runtime est largement dupliqué et la chaîne TLS/update observée n’est pas fiable. ZAILON retient l’idée d’une file de téléchargements persistante et d’un cache indexé, mais pas les binaires, certificats, ressources visuelles ni le runtime Qt de Caffeine.

## NTEMM

### Inventaire et architecture

- 29 fichiers, environ 69,4 Mio.
- `NTEMM.exe` version `1.3.1`, société `ntemm`, non signé; les chaînes du binaire indiquent Tauri.
- Ressources séparées en `binaries`, `icons`, `loader` et `mods`.
- Le chargeur regroupe `loader.asi`, `loader.dll`, `subloader.dll`; 7-Zip est embarqué; deux mods sont livrés avec l’application.

### Forces

- Arborescence très simple à comprendre.
- Séparation nette entre interface, outils d’archive, chargeur et contenu.
- Ressources immédiatement disponibles hors réseau.

### Faiblesses et décision

Le code et la licence sont absents, les composants de chargeur sont non signés et les icônes de personnages peuvent être protégées. ZAILON retient la séparation par adaptateur de chargeur, mais ne copie aucun fichier, icône ou composant NTEMM.

## STS2 Mod Manager

### Inventaire et architecture

- 490 fichiers, environ 11,7 Mio hors dépendances et builds.
- Tauri 2, React, TypeScript et Rust; version inspectée `1.8.6`.
- Licence MIT explicite, copyright Mohamed Serhan (2026).
- 45 fichiers/modules Rust couvrent notamment sauvegardes, sécurité du système de fichiers, téléchargements, watcher du dossier Téléchargements, provenance des mods, versions, Nexus, profils, dérive, Workshop, partage GitHub, mise à jour et diagnostics de lancement.
- Le frontend est séparé en composants, contextes, affichage, hooks, traductions, thème et vues.

### Qualité et tests

L’inventaire relève 562 fonctions de test Rust, 96 fichiers de tests frontend, 46 fichiers QA et 7 workflows GitHub. La QA inclut un vrai pilote WebDriver Tauri sur Windows et Linux, des cassettes réseau déterministes et des captures en cas d’échec. C’est la référence la plus solide du lot en matière d’ingénierie.

### Forces

- Sauvegarde avant lancement et restauration.
- Installation/actualisation transactionnelle avec conservation des configurations.
- Provenance explicite : GitHub, Nexus, Steam Workshop ou archive manuelle ne sont pas confondus.
- Profils partageables, détection de dérive et réparation.
- Défense contre traversée de chemins, hôtes non autorisés et archives dangereuses.
- Pas de télémétrie et secrets stockés via le trousseau système.

### Faiblesses et décision

L’application est volontairement spécifique à Slay the Spire 2; ses modèles, formats et réparations ne peuvent pas devenir « universels » sans couche d’adaptateurs. Les intégrations réseau augmentent aussi le coût de QA et la dépendance aux quotas/identifiants.

ZAILON retient les principes de transaction, provenance, sauvegarde, dérive, tests avec cassettes et QA native. Aucun code STS2 n’a été copié dans la présente refonte. Si du code MIT est repris plus tard, le copyright et la licence devront être inclus.

## ZZZ Mod Manager

### Inventaire et architecture

- 70 fichiers utiles, environ 38,8 Mio hors cache WebView2.
- Flutter Windows avec plugins de glisser-déposer, WebView intégré, presse-papiers, récupération d’écran, ouverture d’URL et gestion de fenêtre.
- Le catalogue de traductions révèle : onboarding, activation par liens symboliques, import par dépôt/presse-papiers, tags automatiques par personnage, favoris, images par mod, marketplace GameBanana et envoi automatique de F10 à 3DMigoto/XXMI.
- L’exécutable annonce encore l’identifiant générique `com.example`; l’installeur mentionne une société différente. Tous deux sont non signés.

### Forces

- Onboarding clair des chemins nécessaires.
- Activation par symlinks qui évite de recopier tous les mods.
- Actions de carte et menu contextuel utiles.
- Import par glisser-déposer et classement automatique immédiatement compréhensibles.

### Faiblesses et décision

La marketplace dépend d’une WebView et d’une surveillance de téléchargement externe, donc des changements du site peuvent casser le flux sans contrat API. L’envoi automatique de F10 dépend du focus, de la plateforme et d’outils système. Les images de personnages ne sont pas réutilisables sans autorisation.

ZAILON retient l’onboarding, le dépôt de fichiers, les tags et la notion de déploiement par lien comme futur adaptateur. La WebView GameBanana, les images et l’automatisation clavier ne sont pas reprises.

## Décisions appliquées à ZAILON

1. **Shell natif compact** : barre de titre dédiée, navigation latérale adaptative et barre d’état persistante.
2. **Accueil centré sur le jeu** : grand héros, action Jouer, métriques réelles et bibliothèque secondaire, inspirés de la hiérarchie fournie sans reprendre de visuel tiers.
3. **Apparence transactionnelle** : ressources copiées localement, aperçu, position, zoom, remplissage, Enregistrer/Annuler et restauration.
4. **Détection par fournisseurs** : Steam, Epic Games et applications Windows utilisent des index locaux connus, avec diagnostic, confiance et sélection avant import.
5. **Explorer archivé** : aucun catalogue simulé tant que les adaptateurs API et la file de téléchargements ne sont pas fiables.
6. **Prochaine priorité backend** : moteur de déploiement transactionnel par type de loader, sauvegarde/rollback, file de téléchargements persistante et tests natifs WebDriver.

## Règles de propriété intellectuelle

- Aucun exécutable, DLL, ASI, archive, image de personnage, logo de jeu ou ressource vidéo des références n’est copié dans ZAILON.
- « Absence de licence » signifie que les droits restent réservés; l’accès local ne donne pas un droit de redistribution.
- Le dépôt STS2 est MIT, mais toute copie substantielle exigerait la conservation de sa notice.
- Les noms Steam, Epic Games, GOG, Ubisoft, EA, Battle.net, Xbox, Riot, Rockstar, itch.io, GameBanana et Nexus Mods restent les marques de leurs propriétaires.
