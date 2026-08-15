# Backend Frosty générique (spec Frosty Partie B §26-103)

Livré en 1.66.0 — logique pure + bloc Configuration. Le lancement réel et l'import
`.fbmod` complet arrivent dans une suite (le lancement nécessite un runtime Frosty
détecté/installé et des tests réels, §99-100).

## Architecture

```
ZAILON
  └─ IModBackend (src/lib/modBackends.ts)
       ├─ CyberpunkVirtualBackend   (Cyberpunk2077.exe → VFS MO2-like)
       ├─ FrostyBackend             (NFS16.exe → .fbmod, resource patch pipeline)
       ├─ NTEPakBackend             (Neverness → .pak/.utoc)
       └─ GenericFolderBackend      (défaut)
```

La même UX (profils, Installer, Désinstaller, activer, partager, Jouer) reste
identique — seul le moteur de modding change, choisi automatiquement par
`detectModBackend({ execPath, gameName })` (spec §59-60).

**Règle §96 : le backend Frosty n'est jamais initialisé au démarrage global de ZAILON.**
Il n'est instancié qu'à l'ouverture d'un jeu Frosty, à l'import d'un `.fbmod` ou au
lancement.

## FrostyGameRegistry (spec §75)

Registry-driven : chaque jeu déclare exécutables, versions de runtime, stratégies
plateforme, statut testé et domaine Nexus.

| Jeu                     | Exe        | Domaine Nexus         | Runtime préféré | Bloqué | Statut       |
| ----------------------- | ---------- | --------------------- | --------------- | ------ | ------------ |
| Need for Speed (2015)   | NFS16.exe  | needforspeed2016      | 1.0.6.3         | 1.0.7.x | experimental |

**Jamais « dernière version » imposée** (§29, §77) : chaque jeu/profil possède son
runtime (`preferred` / `minimum` / `blocked`). NFS 2015 Evolution exige 1.0.6.3 et
déconseille 1.0.7 pour ce mod → `resolveFrostyVersion` retourne toujours 1.0.6.3 même si
le profil demande une version bloquée, et `frostyVersionCompatibilityAlert` signale
toute version hors plage.

## FrostyPackageInspector (spec §33, §72-73)

- `modern-fbmod` : fichier `.fbmod` ;
- `legacy-structure` : archive ZIP/RAR/7z (anciennes structures) ;
- `unsupported` : `.pak`/`.utoc`/`.ucas` (pas du Frosty) ;
- `not-frosty` : autre chose.

Un `.fbmod` n'est **jamais** traité comme une archive générique (spec §58) : le backend
Frosty reste séparé du VFS Cyberpunk.

## FrostyProfileStaging (spec §36, §78-80)

`buildFrostyStaging` construit l'ordre réel (packageRefs + loadOrder) avec la version de
runtime résolue. `FrostyDeploymentFingerprint` (profileRevision + runtimeVersion +
gameVersion + loadOrderSignature + pluginSignature) permet de **réutiliser un staging
validé** au lancement suivant au lieu de tout reconstruire.

## FrostyPlatformCompatibility (spec §47-52)

`frostyPlatformStrategy(platform, adapter, plugins)` :

- **EA App direct** → `native`, DatapathFix non recommandé (§48 : souvent inutile) ;
- **Steam / Epic** → `datapath-fix` si l'adaptateur le permet ;
- **conflit détecté** : DatapathFix + LaunchPlatformPlugin actifs ensemble → warning +
  bouton « Corriger » (§52).

## FrostyConflictDetector (spec §41, §87)

`frostyOverhaulConflict(modNames)` : « Evolution » + « Remastered » dans le même profil
→ alerte de conflit de ressources, recommandation de profils dédiés. Aucune
compatibilité inventée — uniquement des avertissements.

## Bloc Configuration (jeu Frosty détecté)

Bibliothèque > Jeu > Configuration > **Frosty** :

- Backend (runtime recommandé) ;
- Compatibilité plateforme + stratégie ;
- alerte version bloquée / minimum ;
- conflit plugins avec « Corriger » ;
- alerte overhauls concurrents ;
- switches DatapathFix / LaunchPlatformPlugin (détection du conflit) ;
- « Tester le profil » (contrôles purs, sans lancer le jeu) ;
- rappel : jamais initialisé au démarrage.

## Suivi de chaîne de lancement (spec « Fix Frosty — suivi de chaîne »)

Un jeu Frosty est **launcher-based** : la chaîne réelle est
`FrostyModManager → DatapathFix / Launch Platform Plugin → exécutable du jeu`.
`frostyLaunchAdapter(execPath)` (`src/lib/launchAdapters.ts`) construit
l'adaptateur à partir du registre Frosty (`NFS16.exe`, etc.) :

- `launchBehavior: ExternalLauncher` — la sortie de Frosty (ou d'un plugin)
  ne termine **jamais** la session ;
- `gameExecutableCandidates` = candidats du registre (le processus FINAL,
  jamais Frosty) ;
- `launchChainStages: ['Frosty', 'Plugin', 'Game']` ;
- fenêtre de rattachement 180 s (Frosty + plugins peuvent être lents).

Résultat : ZAILON passe à « En cours » dès que `NFS16.exe` est détecté, même si
FrostyModManager reste ouvert ; il termine la session quand le jeu ferme — pas
quand Frosty ferme.

## Sécurité (spec §85)

- Aucun téléchargement de binaires Frosty depuis un miroir inconnu ;
- sources officielles uniquement, vérification de hash/signature si disponible ;
- DatapathFix / FrostyFix jamais activés aveuglément (stratégie par jeu/version).

## Statut honnête

Le statut NFS 2015 est **experimental** jusqu'à des tests réels de lancement
(spec §99-100 : mods réellement visibles in-game, EA App + Steam suivis, GameSession V2).
Le bloc actuel valide la configuration et les conflits ; le lancement via Frosty
(runtime détecté/installé) et l'import `.fbmod` complet sont la suite logique.
