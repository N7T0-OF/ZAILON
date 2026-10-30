# Import du temps de jeu Steam (spec « Mise à niveau » §3)

## Objectif

Quand un jeu est déjà connu de Steam, le compteur ZAILON ne doit pas repartir
de zéro. ZAILON importe l'historique Steam **en lecture seule** et l'affiche
**séparément** du suivi ZAILON — jamais fusionné.

## Règle inviolable

- `totalPlaytime` = temps suivi par ZAILON lui-même (sessions lancées via
  ZAILON), en minutes.
- `importedPlaytimeMin` = historique fourni par Steam (minutes), lu depuis
  `localconfig.vdf`.
- `externalPlaytimeSource` = `steam` (réservé `epic`/`gog` pour la suite).

L'affichage sépare toujours les deux :

> Temps total : 142 h · Suivi ZAILON : 38 h · Steam : 104 h

## Côté natif (Rust)

- `parse_steam_localconfig_playtime(text)` : parseur **pur** du format
  KeyValues VDF (`localconfig.vdf`) via `keyvalues-parser` (déjà utilisé par
  `steamlocate` pour `libraryfolders.vdf`). Extrait `apps > <appid> >
  PlaytimeForever`, **en minutes**. Aucune I/O.
- `steam_playtime(steam_path)` : commande Tauri qui localise Steam, lit
  `userdata/*/config/localconfig.vdf` de **tous** les comptes, et garde le
  **maximum** par AppID (jamais de double comptage entre comptes). Lecture
  seule — jamais d'écriture dans Steam.

## Côté frontend

- `src/lib/playtimeImport.ts` (pur, testé) :
  - `combinedPlaytimeMin` — total affichable ;
  - `applySteamPlaytime` — mappe les AppID Steam vers `importedPlaytimeMin`
    (jamais `totalPlaytime`) ;
  - `importedTotals` — agrégat minutes/compteur/par source.
- `native.steamPlaytime()` — wrapper de la commande.
- `importSteamPlaytime()` (store) — importe et applique, notice claire.
- **Page Statistiques** : bouton « Importer Steam », bandeau « Temps Steam
  importé : X sur N jeux — jamais fusionné », badge `Steam +Xh` sur chaque jeu
  du classement et détail par jeu.

## Ce qui n'est PAS fait (honnête)

- **Epic** : Epic ne stocke pas le temps de jeu dans un fichier local fiable
  exploitable en lecture seule (données cloud). Le champ `externalPlaytimeSource`
  est prêt (`epic`/`gog`) mais aucun import Epic n'est activé tant qu'une
  source locale fiable n'existe pas.
- Aucune écriture dans Steam, aucun compte requis, aucune API key.

## Tests

- `.github/scripts/test-playtime-import.ts` : lib pure + contrats source
  (commande lecture seule, minutes, jamais `latest/download`).
- Rust : `parses_steam_localconfig_playtime_forever_minutes` +
  `steam_localconfig_playtime_tolerates_missing_sections`.
