# Publication des add-ons officiels

Processus de release d'un add-on officiel `.zailon-addon` (spec « Fix critique
installation add-ons » §44, §9-11, §37-38). La règle d'or : **un bouton
Installer ne doit JAMAIS apparaître pour un add-on sans fichier téléchargeable**
(§49) — le catalogue ne passe l'entrée à `available: true` qu'après publication
réelle.

## 1. Cycle complet

1. **Bump version** — `version` du manifest, tag explicite `addon-vX.Y.Z`.
2. **Build** — construire le module (UI, worker, resources).
3. **Valider** — manifest, permissions, plateforme, dépendances.
4. **Empaqueter** — `npm run addon:pack <dir> -o dist/<id>-vX.Y.Z.zailon-addon`
   (ou `node .github/scripts/addon-cli.ts pack …`) — archive ZIP déterministe.
5. **Tester localement** — ZAILON → Add-ons → **Importer un add-on** →
   sélectionner le `.zailon-addon` → vérifier installation, registre, UI slot,
   dépendances, worker, désinstallation. Le chemin de référence
   (`G:\2_Logiciel\CLAUDE CODE\EXEMPLE\Frosty Editor` par ex.) sert de source,
   jamais d'installation directe (§17).
6. **Tag + release GitHub** — tag explicite (jamais `latest`) :
   ```text
   frosty-v1.0.0
   ```
   Asset :
   ```text
   official.zailon.frosty-v1.0.0.zailon-addon
   ```
7. **Hash + signature** — SHA-256 du fichier + signature Ed25519 du hash
   (spec §14, §20). Pour un add-on officiel, l'installation exige un SHA-256
   réel et une signature (§14, §52).
8. **Publier le catalogue** — mettre à jour `catalog.json` (repository officiel
   `N7T0-OF/zailon-addons`) : `available: true` + `release` (repository, tag,
   asset) + `sha256` réel. La CI `Validate add-on catalog` de ZAILON refuse tout
   catalogue où un add-on `available` n'a pas ces métadonnées (§37).

## 2. Format d'entrée du catalogue

```json
{
  "id": "official.zailon.frosty",
  "name": "Frosty Support",
  "version": "1.0.0",
  "category": "game-support",
  "size": 8400000,
  "sha256": "<64 hex réels>",
  "minZailonVersion": "1.69.0",
  "permissions": ["game.read", "game.files.write", "mods.read", "mods.write", "network", "process.launch", "game.launch"],
  "description": "…",
  "available": true,
  "release": {
    "repository": "N7T0-OF/zailon-addons",
    "tag": "frosty-v1.0.0",
    "asset": "official.zailon.frosty-v1.0.0.zailon-addon"
  },
  "signature": "<base64>",
  "signaturePublicKey": "<base64>"
}
```

Règles :

- l'URL de téléchargement est TOUJOURS construite par ZAILON depuis
  `release` : `https://github.com/{repository}/releases/download/{tag}/{asset}`
  (§5) — jamais `latest/download`, jamais déduite de l'ID (§2-3, §39) ;
- l'asset est publié sous un **tag explicite** : une release suivante ne casse
  pas l'installation d'une version ancienne (§3) ;
- le nom de l'asset n'est JAMAIS déduit de l'ID (§12).

## 3. Statuts d'une carte

| Statut                 | Condition                                                         |
| ---------------------- | ----------------------------------------------------------------- |
| `En développement`     | `available: false` — bouton Installer désactivé, tooltip (§13)    |
| `Disponible`           | `available: true` + release explicite + SHA-256 réel (officiel)   |
| `Installé`             | add-on présent dans le store                                      |
| `Màj disponible`       | version catalogue > version installée                             |

## 4. Erreurs de téléchargement

- **404** — package absent : affiché immédiatement, **aucun retry** (§40) ;
  boutons [Voir la release] [Importer manuellement].
- **403/429** — GitHub limité : retry plus tard (§41).
- **Réseau** — erreur générique, retry possible.

## 5. Script local

`scripts/release-addon.ps1` empaquette un dossier d'add-on, calcule le
SHA-256 et affiche le bloc de métadonnées à copier dans le catalogue :

```powershell
.\scripts\release-addon.ps1 -AddonDir .\addon-template -Id official.zailon.frosty -Version 1.0.0
```

## 6. Add-ons officiels construits

Deux add-ons sont désormais **réellement construits et validés** dans ce dépôt
(source : `addons/`) :

| Add-on | Package | SHA-256 (enregistré dans le catalogue) |
| --- | --- | --- |
| Frosty Support | `official.zailon.frosty-v1.0.0.zailon-addon` | `de58be…78cb4` |
| Frosty Editor | `official.zailon.frosty-editor-v1.0.0.zailon-addon` | `d5b38b…7f36` |

- Reconstruire : `npm run addon:build:official` → `dist/` (pack déterministe,
  SHA-256 vérifiable par le test `test-official-addons.ts`).
- Le catalogue (`src/lib/official-addon-catalog.json`) contient déjà le
  `release` (tag + asset) et le `sha256` réels de ces deux add-ons, mais
  `available: false` : **la carte reste « En développement » tant que la
  release GitHub n'est pas publiée** (§49).
- Dès que les assets sont uploadés sur `N7T0-OF/zailon-addons` (tags
  `frosty-v1.0.0` et `frosty-editor-v1.0.0`), il suffit de passer les deux
  entrées à `available: true` — les métadonnées sont prêtes et la CI
  `Validate add-on catalog` vérifiera la cohérence.
