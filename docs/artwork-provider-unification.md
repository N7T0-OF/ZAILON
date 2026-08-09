# Moteur d'illustrations unifié (spec « Refonte Apparence » §1-14, 48, 58-61)

## Objectif

Fini les grosses sections par fournisseur et les sources affichées comme
fonctionnelles sans l'être. Un seul registre décrit tous les fournisseurs
d'illustrations, leur état **réel** et leur priorité. La recherche envoie la
requête vers toutes les sources disponibles et **fusionne les résultats dans
une seule grille** : l'utilisateur choisit une image, jamais un fournisseur.

## Registre des fournisseurs (`src/lib/artworkRegistry.ts`)

| Fournisseur | Priorité | État réel | Raison |
|---|---|---|---|
| SteamGridDB | 1 | `available` si clé, sinon `not-configured` | Spécialiste des assets de bibliothèque (grid/hero/logo/icon) |
| Steam officiel | 2 | `available` (toujours, sans clé) | Couverture/hero officiels |
| IGDB | 3 | `available` si Client Twitch, sinon `not-configured` | Covers / artworks / screenshots, y compris jeux hors Steam |
| GameBanana | 4 | `available` (API publique, sans clé) | Couvertures et images de jeux |
| Nexus | 5 | `not-implemented` | Réservé aux images de mods/galeries, pas de jaquettes |
| CurseForge | 6 | `not-implemented` | Pas de recherche publique de jeux par nom |

Chaque fournisseur déclare : priorité, capacités par type (cover / banner /
background / logo / icon) et la raison de son état (bulle ⓘ). L'état est
calculé par `artworkProviderState(id, config)` — pur et testé.

## Recherche multi-source

- **Automatique** : Steam officiel d'abord (aucune clé requise) ; si aucune
  image, nouvelle tentative avec toutes les sources configurées.
- **Toutes les sources** : une seule recherche fusionnée avec toutes les
  sources disponibles, **SteamGridDB en tête** (recommandation : source n°1
  pour les personnalisations), puis Steam, IGDB, GameBanana.
- Une source indisponible **ne bloque jamais** la recherche : elle est listée
  en pied de résultats (« N source(s) indisponible(s) ⓘ »).

## Déduplication (`dedupeArtworkCandidates`)

Clé principale : **URL normalisée** (origine + chemin, paramètres de cache CDN
ignorés). La même image venue de plusieurs sources n'apparaît qu'une fois ; le
premier candidat (Steam officiel en premier côté natif) est conservé.

## Côté natif (`src-tauri/src/lib.rs`)

- `search_game_artwork` accepte `api_keys` (`{ steamgriddb: "...",
  igdbClientId: "...", igdbClientSecret: "..." }`) et fusionne dans une seule
  liste dédupliquée par URL (même `HashSet`) : SteamGridDB, Steam officiel,
  IGDB puis GameBanana.
- **IGDB** : POST token Twitch (Client Credentials) → POST `v4/games` avec
  `search "…"; fields name,cover.image_id / artworks.image_id;` → images
  `images.igdb.com/igdb/image/upload/t_cover_big|t_1080p/{image_id}.jpg`.
- **GameBanana** : `Core/List/Like` (recherche de jeux par nom, public) puis
  `Core/Item/Data` (`screenshots`) ; aucune clé requise.
- `test_artwork_provider(provider, api_keys)` : SteamGridDB (GET grids),
  IGDB (échange token Twitch), GameBanana (GET public).

## Paramètres > Illustrations

- Liste compacte de l'état des six sources (une ligne par fournisseur, pas de
  grandes cartes), calculée depuis la configuration réelle.
- Clé SteamGridDB : Enregistrer / Remplacer / Tester la connexion / Supprimer.
- IGDB : Client ID + Client Secret (application Twitch gratuite), Enregistrer /
  Remplacer / Tester / Supprimer.
- GameBanana : « Tester (public) » — aucune configuration nécessaire.
- Mode de source (Automatique / Toutes les sources).
- Les clés sont stockées localement (persistance du store) et transmises
  **uniquement** au fournisseur concerné, uniquement pour les illustrations.

## Auto-artwork

La recherche automatique pour les nouveaux jeux privilégie toujours l'art
**officiel Steam** ; les autres sources ne servent que si Steam ne fournit rien
pour l'emplacement. Les clés configurées (SteamGridDB, IGDB) sont transmises.

## Limitations connues

- Nexus et CurseForge restent honnêtement marqués « connecteur non disponible »
  (pas d'API de jaquettes de jeux par nom) ; Nexus servira aux images de mods.
- Le format exact des champs `screenshots` de GameBanana est tolérant mais non
  garanti : si la réponse change, le connecteur renvoie simplement zéro image
  (jamais d'erreur ni de résultat fictif).
- Les connecteurs réseau (SteamGridDB, IGDB, GameBanana) ne sont pas couverts
  par la CI locale : la validation réelle nécessite une clé valide / une
  machine avec le jeu.
- La réorganisation manuelle de l'ordre des sources (spec §5) n'est pas encore
  exposée : l'ordre suit la priorité par défaut du registre.
