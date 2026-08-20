# Pipeline d'installation des add-ons (spec « Pipeline » §1-9)

## Les deux bugs corrigés

1. **`Add-on archive must be a ZIP`** : `addon_install_staged` refusait tout
   fichier dont l'extension n'était pas `.zip` — or les packages cache sont
   nommés `*.zailon-addon`. La validation est désormais faite sur le CONTENU
   (magic bytes ZIP `PK\x03\x04` / `PK\x05\x06` / `PK\x07\x08`), jamais sur
   l'extension. Un `.zailon-addon` est un format LOGIQUE dont le contenu doit
   être un vrai ZIP.
2. **Version ZAILON figée** : `ZAILON_CURRENT_VERSION` était codé en dur
   (`'1.69.0'`) alors que le launcher tournait en 1.9x — les add-ons exigeant
   1.78+ semblaient incompatibles. La version est désormais dérivée de
   `package.json` au build (test de régression dédié).

## Pipeline complet (ordre d'exécution)

```
addons.json (index)
  → carte (Disponible uniquement si package + SHA-256 réels)
  → clic Installer (jamais proposé si add-on incompatible — version ZAILON,
    plateforme, API)
  → [dépendances d'abord : même pipeline complet pour chacune]
  → téléchargement HTTPS (URL principale)
      → échec ? → miroir CDN jsDelivr (1 tentative)
  → validation du contenu AVANT écriture (Rust) :
      status HTTP 2xx
      content-type ≠ text/html / application/json (page d'erreur GitHub)
      magic bytes ZIP
  → SHA-256 (obligatoire pour les officiels)
  → signature Ed25519 (vérifiée quand déclarée — jamais exigée seule)
  → extraction en staging → swap atomique → rollback
  → vérification de santé (manifest + compatibilité)
  → activation
```

## Erreurs utilisateur

- **Archive invalide** : « L'archive de l'add-on est invalide ou le
  téléchargement GitHub n'a pas renvoyé une archive ZIP. » — jamais un message
  de décompression brut.
- **Package introuvable** (404) : aucun retry, boutons « Réessayer / Importer
  manuellement / Voir le package ».
- **GitHub limité** (403/429) : retry plus tard.
- **Incompatible** : refus AVANT téléchargement avec la liste des raisons.

## Dépendances (spec §5)

« Installer les dépendances » (coché par défaut) installe d'abord chaque
dépendance avec le même pipeline complet, puis l'add-on demandé — ex.
Frosty Support avant Frosty Editor. Dépendance introuvable au catalogue →
installation impossible, message explicite.

## Miroir (spec §7)

`mirrorAddonUrl` (pur, testé) dérive `cdn.jsdelivr.net/gh/owner/repo@branch/…`
depuis l'URL raw GitHub. Utilisé en repli unique quand l'URL principale échoue
ou sert un contenu invalide.
