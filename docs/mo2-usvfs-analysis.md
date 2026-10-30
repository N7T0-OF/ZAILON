# Analyse MO2 / USVFS

## Composants locaux observés

- `usvfs_x64.dll` et `usvfs_x86.dll`, version 0.5.6.1 ;
- `usvfs_proxy_x64.exe` et `usvfs_proxy_x86.exe` ;
- journaux `logs/usvfs-*.log` ;
- processus auxiliaire MO2.

Les journaux n’ont pas été copiés ni inclus dans ce dépôt.

## Fonctionnement

USVFS crée une vue de fichiers visible seulement par les processus ciblés. Il utilise
des hooks d’API pour rediriger les accès, superposer plusieurs dossiers sur une même
destination, masquer virtuellement des fichiers et propager la vue aux processus
enfants lancés sous son contrôle.

Le backend impose un coût CPU/mémoire, peut être détecté par les antivirus comme une
technique d’injection, n’agit qu’une fois le processus initialisé et peut produire des
erreurs difficiles à diagnostiquer. La vue disparaît à la fin de la session.

Les priorités déterminent la source gagnante d’un chemin virtuel. Les écritures qui ne
correspondent pas à un fichier source sont dirigées vers Overwrite ; les sorties
doivent ensuite être attribuées ou nettoyées.

## Licence et décision

USVFS est GPL-3.0-or-later avec permissions additionnelles pour lier et distribuer des
binaires non modifiés avec un projet FOSS, sous réserve de notices visibles, de la
licence et d’un lien vers le dépôt. ZAILON ne copie ni ne charge les DLL locales dans
cette phase.

Le backend réellement livré reste `TemporaryCopy`. Il :

1. résout les gagnants ;
2. sauvegarde les originaux ;
3. copie les fichiers vers le jeu ;
4. suit le processus lancé ;
5. capture les écritures modifiées ;
6. restaure les originaux.

Il ne doit jamais être présenté comme un VFS.

## Abstraction cible

```text
VirtualFileSystemBackend
  capabilities()
  prepare(profile, game)
  mount(mapping)
  launch(process)
  trackChildren()
  captureWrites()
  unmount()
  diagnose()
```

Backends prévus : `UsvfsBackend` (Windows, non livré), `TemporaryCopyBackend`,
`LinkDeploymentBackend`, `FuseOverlayBackend`, `MacOSOverlayBackend` et
`UnsupportedBackend`.

Une intégration USVFS ultérieure devra être construite depuis le dépôt officiel,
publier le source correspondant, tester x86/x64, l’antivirus, les anti-cheats, les
processus enfants et la récupération après crash.

