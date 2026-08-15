# Identité de jeu + configuration par jeu

## 1. Game Identity Resolver (spec §2-4)

`src/lib/gameIdentity.ts` — identité stable **multi-signaux**, jamais le seul
nom d'exécutable :

| Signal | Confiance | Clé |
|---|---|---|
| fournisseur + AppID | **haute** | `steam:1091500` |
| exécutable + chemin d'installation | moyenne | `fivem-exe@c-games-fivem` |
| éditeur + nom | moyenne | `cd-projekt-red:cyberpunk-2077` |
| exécutable seul | faible | `exec:fivem-exe` |
| nom seul | faible | `name:photoshop` |

- `kind` : `game` / `software` / `launcher` / `unknown` — un `launcher.exe` ou
  `ntegloballauncher.exe` est classé `launcher` (jamais confondu avec un jeu).
- `sameGameIdentity` : fusionne deux entrées uniquement si la clé est
  identique **ou** exécutable + chemin normalisés identiques — jamais sur le
  seul nom.
- Intégration : `makeGame` stocke `Game.identityKey` ;
  `importDetectedGames` l'utilise en plus du dédoublonnage existant
  (AppID / chemin / exécutable) — un jeu re-détecté sous un autre nom n'est
  plus dupliqué, mais deux installations au même exécutable dans des dossiers
  différents restent distinctes (FiveM multi-installations).

## 2. Configuration par jeu — état réel (audit)

ZAILON sépare déjà l'essentiel de la configuration au niveau jeu/profil :

| Niveau | Exemples |
|---|---|
| 🌐 Global | apparence/accent, langue, notifications, add-ons, canaux, raccourcis globaux, mode performance global |
| 🎮 Jeu | profils, mods, `installedMods`, installations physiques, ReShade par profil, disposition clavier (`keyboardLayout`, `keyboardProfiles`), presets, chemins runtime, fond multimédia, adapter de lancement |
| 👤 Profil | `modStates` (ordre/activation/notes), `conflictRules`, `installationId`, `reshade`, playtime, historique d'installations |

Le changement de jeu bascule donc déjà **automatiquement** profils, mods,
ReShade, touches et chemins — aucune donnée FiveM n'est réutilisée pour
Cyberpunk. Le nouveau `identityKey` renforce cette séparation en évitant les
doublons à la détection.

## 3. Démarrage (déjà en place)

Le boot est déjà différé (`startupCoordinator`, `startupProfiler`) : le shell
est cliquable avant la réconciliation des catalogues staged, la récupération
de session et les scans — les add-ons sont lazy, les providers jamais
initialisés sans besoin. Les scans lourds passent par les tâches d'arrière-plan
(`runtimeActivity`), jamais sur le thread UI.
