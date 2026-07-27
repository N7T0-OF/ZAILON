# Correctif import MO2 et déploiement runtime Cyberpunk

## Symptôme

Un profil Cyberpunk importé directement ou depuis Mod Organizer 2 pouvait afficher
tous ses mods dans ZAILON, puis rester bloqué au lancement avec :

> Préparation bloquée : dépendance(s) manquante(s) : redscript est requis…
> RED4ext est requis…

L’export d’un profil n’était pas en cause. Un export produit une archive de partage ;
il ne copie volontairement aucun fichier dans le jeu. Le déploiement réel appartient
au bouton **Jouer**.

## Audit local avant correction

L’audit a été effectué en lecture seule sur le stockage ZAILON du jeu concerné et sur
l’instance MO2 fournie. Le nom du profil et ses identifiants personnels ne sont pas
repris dans ce document.

- 143 paquets référencés et activés dans le profil ;
- 143 dossiers physiques accessibles dans le store ;
- 1 588 fichiers physiques, représentant 1 449 chemins relatifs distincts ;
- 0 `package-manifest.json` ;
- les fichiers de contenu ordinaires étaient présents ;
- `engine/tools/scc.exe` et `engine/tools/scc_lib.dll` avaient été mis en quarantaine ;
- `red4ext/RED4ext.dll` et `bin/x64/winmm.dll` avaient été mis en quarantaine ;
- les runtimes RED4ext et CET provenant de MO2 conservaient en plus un préfixe
  artificiel `root/`.

ZAILON confondait donc trois états différents :

1. le mod est visible dans l’interface ;
2. le paquet physique existe dans le store ;
3. les fichiers gagnants sont normalisés, déployables et visibles à la racine du jeu.

Seul le premier état était garanti.

## Cause racine

Le filtre de fichiers sensibles autorisait les plugins sous `red4ext/plugins/`, mais
pas les binaires centraux de redscript, RED4ext et Cyber Engine Tweaks. Ces fichiers
étaient traités comme des exécutables génériques même lorsque le paquet complet
fournissait plusieurs signatures cohérentes.

La détection de racine s’arrêtait également trop tôt lorsqu’un paquet contenait un
dossier de licences nommé `red4ext` à côté de son véritable dossier `root`. Le
conteneur MO2 devenait alors une partie du chemin de jeu.

Enfin, le lancement rescannait les contenus sans manifeste normalisé persistant. Il
pouvait construire une préparation vide ou tester les dépendances avant de disposer
de la carte virtuelle finale.

## Nouveau pipeline

Chaque import construit désormais un `package-manifest.json` version 2. Pour chaque
fichier, il conserve :

- `sourcePhysicalPath` : emplacement réel dans le store ZAILON ;
- `packageRelativePath` : chemin tel qu’il existe dans le paquet ;
- `gameRelativePath` : chemin normalisé sous la racine du jeu ;
- SHA-256, taille et état déployable.

La préparation d’un profil :

1. résout chaque référence du profil vers son paquet physique ;
2. reconstruit les manifestes manquants ;
3. applique les règles `.mohidden` ;
4. résout les conflits suivant l’ordre du profil et les gagnants explicites ;
5. construit une table virtuelle unique ;
6. détecte les fournisseurs complets dans cette table ;
7. vérifie les dépendances après cette résolution ;
8. déploie chaque gagnant avec `TemporaryCopy` ;
9. vérifie chaque copie avant de lancer le jeu ;
10. restaure les originaux à la fermeture.

Le lancement échoue explicitement si un profil non vide produit zéro fichier, si une
référence physique est cassée, ou si le nombre de fichiers planifiés et copiés
diffère.

## Détection des fournisseurs

Un nom de dossier ou de mod ne suffit jamais.

redscript est considéré fourni seulement si le même paquet contient :

- `engine/tools/scc.exe` ;
- `engine/tools/scc_lib.dll` ;
- `engine/config/base/scripts.ini` ;
- `r6/config/cybercmd/scc.toml`.

RED4ext est considéré fourni seulement si le même paquet contient :

- `red4ext/RED4ext.dll` ;
- `bin/x64/winmm.dll`.

Cyber Engine Tweaks est considéré fourni seulement si le même paquet contient :

- `bin/x64/plugins/cyber_engine_tweaks.asi` ;
- `bin/x64/version.dll` ou `bin/x64/winmm.dll`.

Seuls les runtimes exacts d’un fournisseur ainsi confirmé peuvent sortir de la
quarantaine pendant le restaging. Aucun fichier n’est exécuté par l’importeur.

## Réparation des imports existants

Dans **Jeux > Outils** :

- **Auditer le déploiement réel** affiche les paquets accessibles, références
  cassées, fichiers manifestés, conflits, carte virtuelle et fournisseurs complets ;
- **Réparer l’import MO2 et le déploiement** relit l’instance MO2 en lecture seule,
  crée un snapshot, restage uniquement les fournisseurs incomplets ou mal
  normalisés, reconstruit tous les manifestes et recalcule la carte virtuelle.

La réparation est transactionnelle. En cas d’erreur, les paquets modifiés et le
profil sont restaurés depuis le snapshot. Un `repair-report.json` et son chemin sont
affichés à la fin.

## Limites de validation

Les fixtures automatisées couvrent les conteneurs `root`, la distinction entre un
plugin RED4ext et le fournisseur RED4ext, l’admission du runtime redscript par
signatures multiples et la normalisation des manifestes existants.

Le test final `LoadedByGame` ne peut être affirmé qu’après un lancement réel du jeu.
ZAILON garantit ici les états `Normalized`, `Deployable` et `RuntimeVisible`; il ne
prétend pas qu’un plugin a été chargé par le moteur sans preuve runtime.
