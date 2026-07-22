# Déploiement des mods ZAILON

## Contrat d’état

ZAILON distingue explicitement `imported`, `stored`, `validated`, `enabled`, `deployed`, `runtime-visible`, `loaded-by-game`, `failed` et `unknown`. Une copie dans le stockage ZAILON ne signifie jamais « chargé par le jeu ». La version actuelle sait prouver `runtime-visible` par comparaison du contenu écrit dans la vraie racine du jeu. Elle ne prétend pas prouver `loaded-by-game` sans journal ou API fourni par le jeu ou son framework.

## Backends

- `ModStorageBackend` : stockage persistant sous les données locales ZAILON, avec manifeste et arbre `content`.
- `DeploymentBackend` : résolution des fichiers gagnants et projection vers le jeu.
- `TemporaryCopy` : backend actuellement implémenté. Il ne s’agit ni de MO2 ni d’usvfs.
- `ConflictResolver` : dernière priorité gagnante, sauf règle explicite du profil.
- `OverwriteCapture` : les fichiers modifiés pendant l’exécution sont copiés vers `profiles/<profil>/overwrite`.
- `ProcessLauncher` : ne lance le processus qu’après vérification de chaque fichier projeté.

## Transaction de lancement

1. Canoniser l’exécutable et la racine du jeu, puis vérifier que l’exécutable appartient à cette racine.
2. Charger uniquement les mods stockés et activés par le profil.
3. Construire la table des propriétaires par chemin relatif et résoudre les conflits.
4. Contrôler les dépendances Cyberpunk déductibles (CET, RED4ext, redscript, TweakXL).
5. Sauvegarder les fichiers originaux, copier les gagnants et comparer leur signature de contenu.
6. En cas d’échec, restaurer immédiatement et ne pas lancer le jeu.
7. Après la fermeture du processus, capturer les changements dans l’overwrite puis restaurer la racine du jeu.

## Layout Cyberpunk 2077

Les racines reconnues et conservées comprennent `archive/pc/mod`, `r6/scripts`, `r6/tweaks`, `red4ext/plugins`, `bin/x64/plugins`, `bin/x64/plugins/cyber_engine_tweaks/mods`, `mods`, `tools` et `engine`. Un paquet qui en contient plusieurs reste un seul mod composite. Les dossiers enveloppes à enfant unique sont déroulés jusqu’à quatre niveaux.

Un fichier `.archive` isolé est mappé vers `archive/pc/mod`; un fichier `.reds` isolé vers `r6/scripts`. Une structure inconnue est mappée sous `mods/<nom>` et reçoit un diagnostic demandant une vérification manuelle.

## Référence MO2/usvfs

Aucun code source MO2 ou usvfs n’était présent dans `G:\2_Logiciel\CLAUDE CODE\exemple managers` lors de l’analyse. ZAILON n’intègre donc aucune injection, aucun hook de processus et aucun pilote venant de ces projets. Une intégration usvfs future devra faire l’objet d’une étude séparée de licence, d’architecture, de signature des binaires, de compatibilité anti-triche et de récupération après crash.

## Limites honnêtes

- Le backend actuel écrit temporairement dans la vraie racine du jeu : les permissions du dossier restent nécessaires.
- La preuve `runtime-visible` ne garantit pas qu’un framework acceptera ou chargera le fichier.
- Les frameworks ne sont bloqués que quand la dépendance est déductible du chemin; les dépendances déclarées uniquement dans un README restent un diagnostic à confirmer.
- Le test automatisé utilise des arbres de jeu factices. Aucun jeu réel n’est fourni dans le dépôt ou lancé par la CI.
