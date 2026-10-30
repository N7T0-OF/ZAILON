# Plan de copie MO2 vers ZAILON

## Copie dans le dépôt source

| Source MO2 | Destination | Taille | Licence | Décision |
|---|---|---:|---|---|
| binaires/DLL USVFS | aucune | 4,9 Mo | GPL-3.0+ exception FOSS | refusé dans cette phase |
| code MO2/plugins | aucune | variable | GPL-3.0 ou MIT selon composant | réimplémentation indépendante |
| thèmes/icônes/traductions | aucune | 76,5 Mo | non prouvée par asset | refusé |
| mods/téléchargements | aucune | 7,1 Go | auteurs tiers/données utilisateur | interdit |
| profils/config/cache/logs | aucune | variable | données utilisateur | interdit |

Résultat : aucun fichier local MO2 ne doit être copié dans Git.

## Copie à l’exécution par l’assistant

Après aperçu et confirmation de l’utilisateur :

- chaque dossier de mod sélectionné est copié vers le store ZAILON ;
- le hash source et le manifeste du paquet sont enregistrés ;
- les profils sont créés séparément ;
- `modlist.txt` est converti sans inverser silencieusement l’ordre ;
- l’Overwrite est copié vers le profil MO2 actif uniquement ;
- les téléchargements restent décochés par défaut ; si l’utilisateur les active,
  les archives sont copiées mais les `.meta` deviennent des JSON à liste blanche,
  sans URL temporaire, jeton ni `userData` ;
- les exécutables ne sont importés que si leur chemin existe et passe la validation.

Toujours exclus : `webcache`, cookies, clés API, jetons, sessions, mots de passe, logs,
dumps, thèmes, plugins binaires, fichiers du jeu et sauvegardes.

## Risques et contrôles

- Espace disque : prévisualiser la taille finale et conserver la source.
- Interruption : paquets déjà staged récupérables, rapport d’opération.
- Doublons : réutilisation par empreinte puis nettoyage SHA-256 disponible.
- Ordre : première ligne MO2 convertie en priorité ZAILON la plus haute.
- Fichiers sensibles : analyse et quarantaine existantes de ZAILON.
- Confidentialité : aucune valeur sensible de `ModOrganizer.ini` n’est exposée.

Ce document approuve le développement de l’assistant, pas la copie de binaires ou
assets MO2. Toute future proposition de composant distribué exige une validation
explicite distincte.
