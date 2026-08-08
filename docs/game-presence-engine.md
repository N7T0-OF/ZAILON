# GamePresenceEngine — « quel jeu est en cours ? »

## Principe

La détection de présence est **indépendante du lancement** : un jeu configuré
qui tourne (lancé par ZAILON, par Steam, par un launcher externe, ou après un
redémarrage de ZAILON) doit être suivi. Steam n'est pas un concurrent du suivi
ZAILON : c'est **une source de preuve supplémentaire**.

## Sources de preuve

1. processus Windows (nom + chemin complet) — natif `process_scanner` ;
2. chemin d'installation configuré (`installRoot`) ;
3. candidats exécutables de l'adaptateur (launcher + processus finaux) ;
4. contexte de rattachement (+20, session en attente) ;
5. **Steam AppID** (`steamAppId` dans l'adaptateur, NTE = 4508340) ;
6. fenêtre principale du jeu (à venir, Phase 6 — watcher de fenêtres).

Score de correspondance (`ProcessMatchScore`, natif) : installation +40,
exécutable candidat +25, relation launcher +15, contexte +20. Seuils :
**≥ 80 rattachement automatique**, 50–79 à confirmer, < 50 ignoré. Jamais de
rattachement par simple nom de processus.

## RunningGamesWatcher (frontend)

Un seul watcher léger (intervalle 1 s, scan debounce 3 s) dans `App.tsx` :

- `tick()` + `sessionWatchdog(steamAppIds)` ;
- lecture de la présence Steam toutes les 3 s (commande native
  `steam_running_state`) pour les AppID des jeux configurés ;
- scan des **sessions en attente** (`WaitingForGame` / `WaitingForElevation` /
  `GameLost`) : processus final → `sessionGameDetected` ;
- scan des **jeux configurés sans session** (`shouldScanExternalGame`) :
  autoAttach activé OU preuve Steam → `attachDetectedGame` (rattachement
  automatique, aucune action utilisateur).

`shouldScanExternalGame(game, steamAppIds, autoAttachGameIds, activeGameIds)`
(logique pure, testée) : pas de scan si le jeu n'est pas installé ou a déjà une
session ; scan si autoAttach ou si Steam indique l'AppID actif.

## Provider Steam natif (sans SDK)

`src-tauri/src/steam_presence.rs` : lecture seule du registre
`HKCU\Software\Valve\Steam\RunningAppID` (DWORD, AppID en cours) et drapeaux
`Apps\<appid>\Running`. Fonctions pures testées (`collect_running`,
`dword_from_bytes`). Commandes Tauri : `steam_running_state(appIds)` →
`{ steam_running, running_app_ids }`. Aucune interaction avec le processus
Steam, aucune injection, fonctionne aussi pour Epic/GOG/FiveM via le matching
par chemin.

## Récupération de présence

Règle clé : si Steam considère un AppID actif alors que ZAILON est idle ou
vient de perdre sa session, ZAILON **cherche** le processus final au lieu de
terminer :

- session en attente expirée + Steam actif → attente prolongée (watchdog) ;
- jeu configuré détecté en cours sans session → création automatique
  (`attachDetectedGame`, source `external`, mods pré-lancement non appliqués —
  affiché honnêtement).

## Évitement des fausses sessions

Combinaison de preuves exigée : Steam seul ne suffit pas à garder `GameRunning`
si aucun processus de l'installation n'est visible ; un processus seul ne
suffit pas sans installation ou candidat connu. Le seuil 80 et le matching par
installation empêchent le rattachement de processus étrangers (Discord,
Navigateur…).
