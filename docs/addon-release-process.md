# Publication des add-ons officiels

Processus de publication d'un add-on officiel `.zailon-addon` (spec
« Simplification totale du système d'Add-ons GitHub » §1-51).

**Modèle : UN SEUL repository statique — AUCUNE GitHub Release.** Le
catalogue `zailon-addons/catalog.json` (schema 2) référence des chemins
RELATIFS de packages versionnés, et ZAILON télécharge directement le fichier
demandé via `raw.githubusercontent.com` (§1-3, §27-28). Pas de release, pas de
tag, pas de `releases/latest/download`, pas de `GitHubReleaseResolver`, pas de
clone Git chez l'utilisateur (§46-48).

La règle d'or reste : **un bouton Installer ne doit JAMAIS apparaître pour un
add-on sans fichier téléchargeable** (§5, §49).

## 1. Où vivent les fichiers

Le dépôt dédié `N7T0-OF/zailon-addons` n'existe pas encore (404) : les
packages sont hébergés dans le dépôt ZAILON sous `zailon-addons/`, structurés
exactement comme le dépôt autonome cible. Quand `N7T0-OF/zailon-addons` sera
créé, il suffit de changer `ADDON_REPOSITORY.repo` dans `src/lib/addons.ts`
(§3, §25) — rien d'autre.

```
zailon-addons/
├── catalog.json                  ← schema 2, source de vérité unique (§4, §19)
├── packages/
│   ├── frosty/
│   │   └── official.zailon.frosty-1.0.0.zailon-addon
│   └── frosty-editor/
│       └── official.zailon.frosty-editor-1.0.0.zailon-addon
├── docs/addon-development/       ← bouton 📄 (spec §30)
└── templates/                    ← templates de créateurs (§31)
```

Le nom de fichier est VERSIONNÉ (`<id>-<version>.zailon-addon`) : aucun
problème de cache CDN, rollback naturel vers l'ancienne version (§16-18).

## 2. Cycle complet

1. **Modifier** la source de l'add-on dans `addons/<id>/`.
2. **Build + pack + catalogue** — `node scripts/build-official-addons.ts`
   (ou `npm run addon:build:official`) : pack déterministe vers
   `zailon-addons/packages/<dir>/<id>-<version>.zailon-addon`, SHA-256,
   tailles, version et métadonnées du manifest mis à jour automatiquement
   dans `catalog.json` (§19) — **jamais de valeurs éditées à la main**.
3. **Tester localement** — ZAILON → Add-ons → **Importer un add-on** →
   sélectionner le `.zailon-addon` → vérifier installation, registre, UI slot,
   dépendances, désinstallation.
4. **Commit + push** — c'est tout. Aucune étape « Create Release / Upload
   Asset / Create Tag » (§7). La CI `Validate add-on catalog` vérifie que
   chaque package déclaré existe réellement, que son manifest interne
   correspond (ID + version), que le SHA-256 et la taille sont exacts, que les
   dépendances existent (§6) — un catalogue cassé fait échouer le pipeline.
5. **Branche stable** — pousser le contenu publié sur la branche dédiée que
   ZAILON utilise pour les téléchargements (spec §39) :
   `git push origin <HEAD>:zailon-addons-stable`. `main` peut être en retard
   (branche d'intégration) — la branche `zailon-addons-stable` garantit que
   les URLs raw servent la dernière version publiée immédiatement.

## 3. Entrée de catalogue (schema 2)

```json
{
  "id": "official.zailon.frosty",
  "name": "Frosty Support",
  "version": "1.0.0",
  "category": "game-support",
  "description": "…",
  "package": "packages/frosty/official.zailon.frosty-1.0.0.zailon-addon",
  "sha256": "<64 hex réels>",
  "downloadSize": 7656,
  "installedSize": 19140,
  "platforms": ["windows", "linux", "macos"],
  "minZailonVersion": "1.78.0",
  "permissions": ["game.read", "…"],
  "dependencies": [],
  "optionalDependencies": []
}
```

- `package` : chemin RELATIF dans le repository (§2) — jamais d'URL
  construite à la volée, jamais `releases/latest` (§1, §39) ;
- `package: null` : add-on en développement, aucun bouton Installer (§5) ;
- `sha256` réel obligatoire pour tout add-on avec package (§20, §36) ;
- le nom de l'asset n'est JAMAIS déduit de l'ID (§12) — le catalogue l'écrit.

## 4. Résolution côté ZAILON

`AddonRepositoryClient` (spec §2-3, §39) :

```text
BASE_URL = raw.githubusercontent.com/N7T0-OF/ZAILON/zailon-addons-stable/zailon-addons/
catalogUrl  = BASE_URL + catalog.json
packageUrl  = BASE_URL + entry.package
docsUrl     = github.com/N7T0-OF/ZAILON/tree/main/zailon-addons/docs/addon-development
```

Le catalogue n'est jamais fetché au boot (§23) — uniquement à l'ouverture
d'Add-ons (cache frais 6 h) ou sur le bouton « Actualiser » (revalidation
forcée, §24, §34). Hors ligne : catalogue en cache + fallback embarqué ;
les add-ons installés continuent de fonctionner (§22).

## 5. Statuts d'une carte (spec §49)

| Statut                    | Condition                                                      |
| ------------------------- | -------------------------------------------------------------- |
| `Disponible`              | `package` présent + SHA-256 réel                               |
| `Installé`                | add-on présent dans le store                                   |
| `Mise à jour disponible`  | version catalogue > version installée                          |
| `En développement`        | `package: null` — bouton Installer désactivé                   |
| `Incompatible`            | version ZAILON / plateforme / dépendances manquantes           |
| `Hors connexion`          | catalogue de référence servi, aucun téléchargement possible    |
| `Erreur`                  | package déclaré mais irrésoluble / SHA invalide                |

## 6. Erreurs

- **404 au téléchargement** → « Package introuvable » : le package référencé
  est absent du repository — actualiser le catalogue ou importer
  manuellement. Jamais de retry automatique (404 = fichier absent, §48).
- **403/429** → « GitHub temporairement indisponible » : retry plus tard.
- **SHA invalide** → installation refusée, rollback (§14, §35).

## 7. Migration depuis l'ancien système (schema 1 → 2)

- L'ancien modèle (GitHub Releases, `release`/`available`, URLs
  `releases/latest/download`) a été supprimé (§46).
- Le cache local du catalogue est invalidé (`catalogSchemaVersion` 1 → 2,
  clé de cache `v3` → `v4`) : sans invalidation, un ancien catalogue aux
  mauvaises URLs serait servi (§47).
