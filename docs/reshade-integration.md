# Intégration ReShade

Spécification : « ZAILON — Intégration ReShade complète » (§1-115).

## Principe

ReShade est un **composant installable par jeu** : ZAILON gère l'installation,
la version, les presets, les dépendances et la compatibilité — mais ne
contient jamais ReShade. Le téléchargement provient **uniquement de la source
officielle** (reshade.me) et aucune clé API n'est demandée (§9-10).

## Architecture (logique pure, testable)

`src/lib/reshade.ts` — 17 tests, aucun import natif.

| Élément | Rôle | Spec |
| --- | --- | --- |
| `resolveReShadeTarget` | Vrai exécutable de rendu, jamais le launcher ; confiance 0..1 | §3-4 |
| `detectGraphicsApi` | Adaptateurs connus (NFS16 → DirectX, RDR2 → Vulkan), Unreal/Unity en heuristique, fallback manuel | §5-6 |
| `classifyReShadeInstallation` | NotInstalled / Installed / UpdateAvailable / Broken | §2, §23 |
| `inspectReShadePreset` | Scoring pondéré (seuil 25) ; ENB exclu ; un `.ini` seul n'est jamais un preset | §26 |
| `resolveShaderDependencies` + `RESHADE_SHADER_PACKS` | qUINT, SweetFX, prod80, AstrayFX, standard — sources officielles | §30-32 |
| `referenceCountFor` / `unusedShaderPacks` | Pack partagé jamais supprimé avec un seul preset | §47-48 |
| `classifyReShadeCompatibility` | EAC/BattlEye/ACE/Vanguard → jamais automatique ; NTE Restricted ; solo connu → sûr | §58-63 |
| `resolveReShadeSessionStrategy` | Vanilla / safe mode → Disabled | §38, §106-107 |
| `findProxyDllConflicts` | dxgi/d3d9/d3d11/opengl32 jamais écrasés sans contrôle | §91-92 |
| `planReShadeUpdate` | Verrou bloqué, jeu en cours → différé, auto-update | §13-14, §20 |

## Règles bloquantes (jamais)

- Télécharger ReShade depuis un mirror tiers (§9).
- Demander une clé API (§10).
- Traiter Vulkan comme un simple `dxgi.dll` — le setup officiel configure le
  layer Vulkan (§7).
- Cibler le launcher au lieu du vrai exécutable (§3-4).
- Mettre à jour pendant qu'un jeu tourne (§14).
- Classer tous les `.ini` comme presets ReShade (§26).
- Désinstaller un preset qui supprime ReShade utilisé ailleurs (§46-47).
- Écraser une DLL existante aveuglément (§90-92).
- Présenter ReShade comme garanti compatible avec les anti-cheats (§58-61).
- Mélanger Frosty et ReShade comme un seul backend (§67).

## Interface

- **Configuration > Apparence** : bloc ReShade — état, exécutable cible + API
  + confiance, compatibilité (alerte anti-cheat), Installer depuis
  reshade.me / Mettre à jour / Désinstaller / Vérifier, mises à jour
  automatiques, verrou de version 🔒, « Démarrer sans ReShade » (diagnostic).
- **Profil** : `ReShadeProfileState { enabled, presetId?, shaderDependencies[],
  versionLock? }` — le runtime est partagé par installation de jeu, l'état est
  propre au profil (§35-36). Action store `setProfileReshade` persistée.
- **Explorer** : badge « ReShade Preset » + dépendances sur les cartes ; bloc
  détection avec dépendances dans l'aperçu (§25-28).

## État actuel / limites

- Le bloc Configuration guide vers le **setup officiel** (workflow assisté,
  §87) : ZAILON ne simule pas une installation qu'il n'a pas faite. Le
  pipeline de téléchargement natif (cache installers, vérification
  intégrité/taille, §85-86), les mises à jour groupées « Tout mettre à jour »
  (§15-16) et le Quick Panel ReShade (§49-50) arrivent dans une prochaine
  mise à jour.
- La détection de présence sur disque (DLL/ini réels) et l'« Adopter une
  installation existante » (§22) demandent le backend natif.
