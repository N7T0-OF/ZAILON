# Add-on ZAILON — Frosty Editor (architecture)

> `official.zailon.frosty-editor` · dépend de `official.zailon.frosty` (spec §1, §57).
> Frosty Support ne dépend pas de l'éditeur : jouer avec des mods n'installe jamais
> tout l'éditeur.

## Vue d'ensemble

```
ZAILON Core (léger, offline)
   │
   ├── Frosty Support (add-on)          ← INSTALL / APPLY / RUN (§113)
   │     détecte le runtime Frosty officiel externe (jamais bundle)
   │
   └── Frosty Editor (add-on)           ← CREATE (§113)
         │
         ├── UI ZAILON (Création Frosty)
         │     projets, assets, matrice de capacités, build, diagnostic
         │
         └── FrostyEditorWorker (processus séparé)     ← §76-83
               ├── Frosty SDK (runtime externe officiel)
               ├── plugins Frosty (à la demande §43)
               └── opérations assets (parsers lourds)
```

## Découpage des responsabilités

| Acteur | Rôle |
| ------ | ---- |
| **Frosty Editor** | CREATE (projets, édition, build `.fbmod`) |
| **Frosty Support** | INSTALL / APPLY / RUN (ModData, lancement, .fbmod) |
| **Adapter NFS** | RÈGLES DU JEU (profils, versions) |
| **ZAILON Core** | BIBLIOTHÈQUE / PROFIL / SESSION / UI |

Le résultat du build de l'éditeur passe par le **même backend Frosty Support** que les
mods téléchargés (§57) — jamais un second pipeline.

## Bridge

`ZailonFrostyEditorBridge` — API interne stable (spec §9) :

```
openProject() createProject() loadGameProfile() searchAssets()
openAsset() exportAsset() importAsset() duplicateAsset() modifyAsset()
buildMod() validateProject()
```

L'UI ZAILON ne parle qu'à ce bridge ; le Worker exécute. Permet de remplacer le backend
réel (runtime Frosty 1.0.6, puis réécriture .NET 8 quand elle sera fonctionnelle) sans
toucher l'UI.

## Projet

`FrostyProject` (spec §10-11) — stocké **hors du dossier du jeu** :
`ZAILON_DATA/editor-projects/<game>/<project-id>/`.

- autosave par snapshots légers (rotation 5, §12) ;
- récents (historique Frosty 1.0.6.x réimplémenté proprement, §13) ;
- notes locales par asset, favoris, bookmarks (§95-97) ;
- historique de build + taille estimée avant build (§103-104).

## Matrice de capacités

`FROSTY_EDITOR_SUPPORT` (spec §59-60) : `{ ebx, textures, mesh, audio, localization,
bundles, build }` par jeu, issue des profils/plugins Frosty — jamais inventée.
NFS 2015 (`nfs16.exe`) = cible de validation complète (§58).

## Gating

- La vue « Création Frosty » n'existe **que** si `frosty.backend` ET `frosty.editor`
  sont actifs (capabilities, spec Add-ons §10-24) ;
- sinon : écran « nécessite Frosty Support + Frosty Editor » → lien Add-ons ;
- l'entrée « Éditer avec Frosty » dans la config du jeu n'apparaît qu'avec l'add-on.

## Sécurité / isolation

- Worker séparé (§76-83) : parsers, plugins et assets lourds ; un crash redémarre le
  Worker, jamais ZAILON ;
- fermeture → warm 45 s (5 s en Performance, 0 en Max) puis kill : **RAM libérée** ;
- plugins désactivés après 2 crashs (§83) ;
- sandbox plugins tiers dans le Worker (§82).

## Licence

Aucun code Frosty dans l'add-on (CC BY-NC-ND 4.0, voir `docs/frosty-license-audit.md`).
Le runtime officiel est **externe**, détecté par Frosty Support. Attribution conservée.

## Voir aussi

- `docs/frosty-editor-worker.md` — cycle de vie du Worker
- `docs/frosty-source-audit.md` — audit du dépôt
- `docs/frosty-plugin-inventory.md` — les 29 plugins
