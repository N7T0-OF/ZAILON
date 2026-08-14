# Finalisation des add-ons officiels (spec §25-59, §65)

## Statut dérivé du catalogue — jamais écrit à la main (§47-49)

La disponibilité d'une carte vient UNIQUEMENT du catalogue
(`zailon-addons/catalog.json`) :

| Catalogue | Carte |
|---|---|
| `package` réel + SHA-256 (officiel) | **Disponible** · [Installer] |
| `package: null` | **En développement** · bouton désactivé |
| `package` déclaré mais irrésoluble / hash manquant | **Erreur** (catalogue incohérent) |

Quand un package est généré, `scripts/build-official-addons.ts` met
automatiquement `package`, `version`, `sha256` et `downloadSize` dans le
catalogue → la carte devient installable à la synchronisation suivante.

## Packages réellement construits aujourd'hui

| Add-on | Statut |
|---|---|
| `official.zailon.frosty` | Disponible (package + SHA-256) |
| `official.zailon.frosty-editor` | Disponible (package + SHA-256) |
| `official.zailon.visual-profiles` | Disponible (package + SHA-256) |
| les 15 autres officiels | En développement — aucun package tant que la fonctionnalité n'est pas migrée hors Core |

**Règle §55** : un package ne devient pas « Disponible » uniquement pour
supprimer le texte « En développement » — il doit contenir un manifeste, un
entrypoint et une vraie implémentation minimale.

## Corrections apportées

1. **Plus jamais de badge « Local » sur un officiel** (§42) : le catalogue
   embarqué est normalisé via `parseAddonCatalog` (official: true, SHA validé) —
   il se comporte exactement comme le catalogue distant.
2. **Dépendances lisibles** (§52-53) : chip « Nécessite Frosty Support ⓘ » sur
   la carte (nom humain, ids dans le tooltip) ; le dialogue d'installation
   propose toujours « Installer aussi : … ».
3. **Filtres de statut** (§65) : Tous / Installés / Disponibles / Mises à jour /
   En développement.
4. **Permissions** (§50) : icône 🔐 + nombre avec popover des libellés.

## Prochaines migrations prioritaires (§56)

Le code de Discord Presence, Nexus/GameBanana providers, Visual Profiles,
Cyberpunk Advanced, NTE Support et Performance+ existe déjà dans le Core :
la priorité est de le déplacer dans des packages, puis de vérifier le
« feature removal test » (§57) — désinstaller l'add-on fait disparaître la
fonctionnalité réelle (réglages, panneaux, chargements).
