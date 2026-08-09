# Moteur d'illustrations unifié (spec « Refonte Apparence » §1-14, 48, 58-61)

## Objectif

Fini les grosses sections par fournisseur et les sources affichées comme
fonctionnelles sans l'être. Un seul registre décrit tous les fournisseurs
d'illustrations, leur état **réel** et leur priorité. La recherche envoie la
requête vers toutes les sources disponibles et **fusionne les résultats dans
une seule grille** : l'utilisateur choisit une image, jamais un fournisseur.

## Registre des fournisseurs (`src/lib/artworkRegistry.ts`)

| Fournisseur | État réel | Raison |
|---|---|---|
| Steam officiel | `available` (toujours, sans clé) | Connecteur natif existant |
| SteamGridDB | `available` si clé, sinon `not-configured` | Connecteur natif ajouté (grids/heroes/logos/icons) |
| IGDB | `not-implemented` | OAuth non branché — aucun résultat fictif |
| Nexus | `not-implemented` | Fournit des images de mods, pas de jaquettes |
| GameBanana | `not-implemented` | Connecteur absent |
| CurseForge | `not-implemented` | Connecteur absent |

Chaque fournisseur déclare : priorité (1 = premier), capacités par type
(cover / banner / background / logo / icon) et la raison de son état (bulle ⓘ).
L'état est calculé par `artworkProviderState(id, config)` — pur et testé.

## Recherche multi-source

- **Automatique** : Steam officiel d'abord ; si aucune image, nouvelle
  tentative avec SteamGridDB (clé présente). Première source fiable gagne.
- **Toutes les sources** : une seule recherche fusionnée avec toutes les
  sources disponibles.
- Une source indisponible **ne bloque jamais** la recherche : elle est listée
  en pied de résultats (« N source(s) indisponible(s) ⓘ »).

## Déduplication (`dedupeArtworkCandidates`)

Clé principale : **URL normalisée** (origine + chemin, paramètres de cache CDN
ignorés). La même image venue de plusieurs sources n'apparaît qu'une fois ; le
premier candidat (Steam officiel en premier côté natif) est conservé.

## Côté natif (`src-tauri/src/lib.rs`)

- `search_game_artwork` accepte `api_keys` (`{ steamgriddb: "..." }`) et ajoute
  les résultats SteamGridDB à la liste Steam, dédupliqués par URL dans un même
  `HashSet`.
- `test_artwork_provider("steamgriddb", clé)` : GET SteamGridDB avec la clé ;
  retourne « Connexion OK », « Clé invalide ou révoquée » ou le code HTTP.

## Paramètres > Illustrations

- Liste compacte de l'état des six sources (une ligne par fournisseur, pas de
  grandes cartes).
- Clé SteamGridDB : Enregistrer / Remplacer / Tester la connexion / Supprimer.
- Mode de source (Automatique / Toutes les sources).
- La clé est stockée localement (persistance du store) et transmise
  **uniquement** à SteamGridDB, uniquement pour les illustrations.

## Limitations connues

- IGDB, Nexus, GameBanana et CurseForge restent honnêtement marqués
  « connecteur non disponible » : les brancher demanderait de nouveaux
  connecteurs natifs (OAuth IGDB, etc.) — hors périmètre de cette version.
- Le test de clé SteamGridDB et la recherche SteamGridDB réels nécessitent une
  machine avec le jeu (ou au moins une clé valide) — validation réseau non
  couverte par la CI locale.
- La réorganisation manuelle de l'ordre des sources (spec §5) n'est pas encore
  exposée : l'ordre suit la priorité par défaut du registre.
