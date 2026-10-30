# Partage de profils ZAILON — format, sécurité et flux

> Spécification « Persistance + Accent + Partage », spec §24-92. Livré en 1.65.0.

## Principe

Gratuit, local, **sans compte obligatoire** et sans serveur ZAILON :

- **Archive complète** `.zailon-profile` (ZIP) — transporte la configuration ET les
  paquets de mods locaux. Import hors ligne possible sur un autre PC.
- **Manifeste léger** — configuration, liste des mods, versions, sources, ordre et
  réglages. Les mods sont retéléchargés depuis leurs sources à l'import.
- **Code copiable** `ZAILON-PROFILE-V1:<base64url(JSON)>` — la forme la plus légère du
  manifeste, collable dans l'import sans fichier.

## Formats

### `.zailon-profile` (archive ZIP, écrit par le backend Rust `export_profile`)

```
manifest.json      ← manifeste complet (schéma v1)
mods.json          ← liste des mods
load-order.json    ← modStates du profil (ordre + état)
rules.json         ← conflictRules
settings.json      ← installOptions
notes.txt          ← description du profil
files/<name>--<id> ← paquets inclus (mode « Hors ligne » uniquement)
```

Validation à l'import (`preview_profile_import`) :

- nombre d'entrées limité (100 000) ;
- **aucun symlink** accepté ;
- chemins relatifs contrôlés (`enclosed_name`, `validate_archive_relative`) ;
- manifeste limité à 5 Mo ;
- extraction limitée à 4 Go, staging avant renommage final ;
- exécutables sensibles filtrés (`forbidden_archive_file`).

### Code de profil (`src/lib/profileShareCode.ts`)

- Préfixe exact `ZAILON-PROFILE-V1:` — tout autre contenu est **refusé** (aucun
  exécution de code arbitraire, §52-53).
- Encodage base64url du JSON, décodage strict avec validation de forme
  (`validateManifestShape` : schemaVersion, app, mods[], profile.name, modStates…).
- Taille plafonnée à 256 Ko — au-delà, l'export fichier est recommandé.
- `isProfileCode` / `decodeProfileCode` : détection et décodage.

## Neutralisation des chemins (spec §45-46)

À l'export, les chemins absolus utilisateur sont remplacés par des jetons :

| Champ profil            | Jeton exporté        |
| ----------------------- | -------------------- |
| `directory`             | `PROFILE_STORE`      |
| `manifestPath`          | `PROFILE_STORE/manifest.json` |
| `loadOrderPath`         | `PROFILE_STORE/loadorder.txt` |
| `settingsPath`          | `PROFILE_STORE/settings.ini` |
| `overwritePath`         | `PROFILE_STORE/overwrite` |
| `generatedPath`         | `PROFILE_STORE/generated` |
| `deploymentPath`        | `GAME_ROOT`          |
| `bypass`                | `GAME_ROOT/Bypass`   |

À l'import, `sanitizeProfileForImport` supprime ces champs ainsi que
`clonedFromProfileId` / `templateId` — la machine destinataire recalcule tout.

**Jamais exporté** : clés API, jetons, identifiants, chemins personnels complets,
historique, temps de jeu, nom du PC.

## Réglages transportables (spec §44)

Le manifeste inclut les réglages globaux du jeu quand ils existent :

- `keyboardLayout` (disposition virtuelle QWERTY/AZERTY) ;
- `launchAdapter` (chaîne de lancement, launcher intermédiaire) ;
- `backgroundMedia` (fond multimédia de l'Accueil — lien YouTube uniquement, jamais
  le contenu vidéo).

## Import : création systématique d'un nouveau profil (spec §37)

`importProfileManifest(manifest, preferredName?)` :

1. nettoie le profil reçu (`sanitizeProfileForImport`) ;
2. calcule un nom **sans collision** (`nextProfileName` : « Default », « Default (2) »…) ;
3. crée un nouveau profil sélectionné — les profils existants ne sont jamais écrasés ;
4. réconcilie le catalogue des mods (ids ré-importés conservés) ;
5. notifie le nombre de références importées.

## Statistiques de reproductibilité (spec §56-57)

`computeShareStats(mods, mode)` :

- `withSource` : mods avec `sourceUrl` ou `externalReferences` ;
- `localWithoutSource` : mods locaux non retéléchargeables ;
- `localIncluded` : en mode Hors ligne, les locaux sont inclus ;
- `reproducibility = (withSource + localIncluded) / total × 100` ;
- `estimatedBytes` : somme des tailles connues (affichée en mode Hors ligne).

## Dialogue UI (`src/components/UI/ProfileShareDialog.tsx`)

- **Exporter** : mode Léger / Hors ligne, statistiques + barre de reproductibilité,
  avertissement mods locaux, « Copier un code » (léger) ou « Exporter un fichier ».
- **Importer** : « Choisir un fichier .zailon-profile » (aperçu natif) ou zone de
  collage du code, aperçu (jeu source, mods, frameworks, fichiers intégrés,
  avertissements), alerte jeu étranger, extraction optionnelle des fichiers intégrés,
  « Créer un nouveau profil ».
- Entrée principale : Bibliothèque > Jeu > Configuration > **Sauvegardes**.

## Testés

- Roundtrip code (dont Unicode), refus de bruit / préfixes inconnus / JSON arbitraire,
  validation de forme, limite de taille, résumé d'affichage.
- Statistiques (léger vs complet), chemins portables, réglages jeu, sanitize import,
  noms sans collision.
- 236 tests au total au moment de la 1.65.0 (17 nouveaux).
