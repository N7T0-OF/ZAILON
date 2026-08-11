# Pipeline d'installation des add-ons

Spécification : Add-ons §14-15, §65 — signature/hash, installation atomique,
rollback.

## Pipeline

```
Catalogue (cache → réseau → fallback)
   → téléchargement HTTPS (addon_download)
   → vérification SHA-256 (addon_verify_sha256)
   → extraction staging + garde anti-traversal (addon_install_staged)
   → échange atomique : ancien → backup, staging → install
   → vérification de santé (compatibilité + dépendances)
   → succès (backup supprimé)  OU  rollback (backup restauré)
```

## Commandes natives (src-tauri/src/lib.rs)

| Commande | Rôle | Gardes |
| --- | --- | --- |
| `addon_download` | Télécharge depuis une URL HTTPS | URL HTTPS uniquement, taille ≤ 1 GiB |
| `addon_verify_sha256` | Hash SHA-256 du fichier vs attendu | Refuse si non concordant |
| `addon_install_staged` | ZIP → staging → swap atomique | `enclosed_name` + `validate_archive_relative` (pas de traversal), symlinks refusés, manifest.json obligatoire, limite d'extraction 512 Mo, rollback |
| `addon_install_dir` | Dossier `addons/installed` (code) | Données utilisateur séparées (`addon-data`, §16) |

## Machine à états (src/lib/addonsInstall.ts)

`addonInstallReducer` : phases `download → verify → staging → swap → health →
cleanup`, états terminaux `done` / `failed` / `rolled_back`. Pure et testée
(7 tests). `ADDON_INSTALL_INITIAL_STATE` + progression 0..1.

## Catalogue

- `fetchAddonCatalog` : cache localStorage d'abord, réseau validé ensuite,
  **fallback hors ligne** (`OFFICIAL_ADDON_CATALOG`) — ZAILON fonctionne sans
  Internet (§6).
- `mergeCatalogs` : les entrées distantes priment sur le même ID, le fallback
  complète les IDs absents.
- `isOfficialCatalogUrl` : uniquement la source officielle
  (`raw.githubusercontent.com` / `github.com`, §5, §9).
- `isSafeDownloadUrl` : HTTPS sans identifiants.

## Limites

- Le catalogue de référence hors ligne utilise `sha256: 'catalog'` comme
  placeholder — la vérification est alors sautée (aucune vérification
  inventée) ; dès que `catalog.json` officiel fournit les vrais hash, ils sont
  vérifiés.
- La vérification de santé post-install est logique (compatibilité,
  dépendances, manifest déjà validé par l'extraction) ; une vérification
  fichier complète (entrypoint, chargeabilité) arrivera avec le SDK
  d'extensions.
