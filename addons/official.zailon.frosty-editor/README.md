# Frosty Editor — add-on officiel ZAILON

**ID** : `official.zailon.frosty-editor` — **version** : 1.0.0 — **catégorie** : Modding

Édition avancée des jeux Frostbite intégrée à ZAILON : Asset Browser (index
réel des catalogues `.cat`), éditeur EBX avec validation par type, Plugin
Manager interne, projets `.zailon-frosty-project` (export/import), Bulk
Export et build de mods — le tout piloté depuis l'espace « Création Frosty ».

**Dépendance** : `official.zailon.frosty` (Frosty Support) — le moteur
runtime. L'éditeur ne s'installe pas sans lui (§34-35).

## Installation

1. Installer d'abord **Frosty Support** (capacité `frosty.backend`).
2. Installer **Frosty Editor** — via la carte « Disponible », ou en local :
   **Importer un add-on** → `dist/official.zailon.frosty-editor-v1.0.0.zailon-addon`.
3. La sidebar affiche **Création Frosty** (et « Éditer avec Frosty » dans la
   configuration d'un jeu Frostbite).

## Contrat

- **Lazy loading strict** : installé mais jamais ouvert → 0 SDK Frosty, 0
  index, 0 Worker, aucune RAM significative (§3, §116).
- **Worker isolé** : le runtime Frosty réel tourne dans un processus séparé —
  un crash plugin ne ferme pas ZAILON ; fermer l'espace libère toute sa RAM.
- **Jamais bundlé** : le code Frosty (SDK, plugins) n'est ni embarqué ni
  redistribué — licence FrostyToolsuite respectée (§87-88).
- **Plateforme** : Windows.

## Construction / publication

```powershell
.\scripts\release-addon.ps1 -AddonDir .\addons\official.zailon.frosty-editor -Id official.zailon.frosty-editor -Version 1.0.0
```

Voir `docs/addon-release-process.md` pour le cycle complet.
