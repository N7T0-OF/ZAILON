# Cyberpunk — Analyse et correctif de la régression RED4ext

> Spec : « Correctif critique Cyberpunk RED4ext + vrai statut runtime ».
> Livré dans la **1.22.0** (frontend + natif, validé PR #1).

## 1. Cause racine identifiée

Le symptôme « RED4ext could not be loaded » a **deux causes racines distinctes**,
les deux corrigées :

### a) Déploiement démonté quand un launcher intermédiaire ferme (natif)

`launch_game` liait la fin du déploiement (`finish_temporary_copy`) à la
**sortie du processus enfant**. Or pour tout jeu lancé via un launcher
intermédiaire (NTE SteamLauncher, mais aussi Cyberpunk via un loader/launcher),
le processus enfant **est le launcher**, pas le jeu :

```
child (launcher) quitte → finish_temporary_copy → mods DÉMONTÉS
                      → le vrai jeu démarre → RED4ext introuvable
```

C'est la cause structurelle : le déploiement doit vivre avec la **session**,
pas avec le PID du launcher.

**Correctif** : `launch_game(launcher_based: bool)` — si le jeu passe par un
launcher, la sortie du processus enfant ne démonte plus rien : la session reste
`prepared` (récupérable) et le déploiement reste actif. La restauration se fait
à la **fin réelle de la session** via la nouvelle commande native
`restore_deployment_session` (appelée par le frontend dans `endSession` et à la
transition `GameLost`), et au plus tard par la récupération du lancement suivant.

### b) RED4ext core absent du déploiement (plugins sans loader)

Un mod peut activer des fichiers sous `red4ext/plugins/` sans fournir le core
`red4ext/red4ext.dll` (ex. le mod du framework désactivé, ou non déployé car
hors du catalogue du profil). Le jeu démarre alors sans RED4ext.

**Correctif** : validateur pré-lancement pur (`src/lib/frameworkValidator.ts`,
miroir des diagnostics natifs) — règles :

| Usage détecté | Core requis |
|---|---|
| `red4ext/plugins/*` | `red4ext/red4ext.dll` |
| `r6/scripts/*` | `engine/tools/scc.exe` (redscript) |
| `r6/tweaks/*` | `red4ext/plugins/TweakXL` |
| `*.xl` | `red4ext/plugins/ArchiveXL` |

**Verrou de lancement** (spec §5) : `launchSelectedGame` refuse de lancer
Cyberpunk si un blocker est présent — message clair
« Activez le mod du framework manquant, ou utilisez Lancer sans mods depuis le
diagnostic ». Le core déjà présent dans le jeu peut être reconnu via `onDisk`.

## 2. Ne jamais déclarer « RED4ext chargé » par simple nom

Le validateur émet un **avertissement** (jamais un badge ✓) quand seul le core
est présent : le chargement réel se confirme au runtime après lancement
(diagnostic natif existant `dependency_diagnostics`).

## 3. Tests

- `test-framework-validator.ts` : 8 tests — plugins sans core → blocage (cause
  racine), core fourni par mod actif → valide, `onDisk` → valide, redscript /
  TweakXL / ArchiveXL, mods désactivés non fournisseurs, union de catalogues,
  réconciliation des ids.
- `test-duration-format.ts` (lot précédent) : 4 tests.

## 4. Fichiers

| Fichier | Changement |
|---|---|
| `src/lib/frameworkValidator.ts` | Validateur pur pré-lancement |
| `src/store/useStore.ts` | Verrou de lancement (Cyberpunk) + `launcherBased` + restauration fin de session |
| `src/lib/native.ts` | `launchGame(…, launcherBased)` + `restoreDeploymentSession` |
| `src-tauri/src/lib.rs` | `launch_game(launcher_based)` : pas de démontage à la sortie du launcher ; commande `restore_deployment_session` |

## 5. Limites restantes

- La confirmation réelle « RED4ext chargé » (log runtime) se fait sur machine
  avec le jeu — non exécutable dans cet environnement.
- Le bouton « Réparer RED4ext » (reconstruction manifeste/VirtualFileMap) et le
  « Last Known Good » des frameworks restent à implémenter (dépendent des
  vérifications réelles sur la machine).
