# GameSession V2 — « ZAILON possède une session, pas un PID »

## Problème résolu

Pour les jeux à chaîne de lancement multi-étapes (Steam → launcher officiel →
UAC → launcher élevé → processus final), ZAILON ne doit plus considérer que la
fermeture du premier processus qu'il a démarré signifie la fin de la session.

**Ancienne logique (interdite) :**

```text
processStartedByZailon == true  →  session liée au PID
PID initial fermé               →  session terminée
```

**Nouvelle logique :**

```text
GameSession  →  appartient au jeu (gameId + installation), pas à un PID
processus intermédiaire fermé   →  WaitingForGame / WaitingForElevation
preuve de présence (processus, chemin, Steam AppID, fenêtre)  →  rattachement auto
```

## Modèle

`GameSession` (types `GameSession` / `GameSessionState` / `SessionSource`) :

- `source`: `zailon` | `manual` | `reattached` | `recovered` | **`external`**
  (jeu détecté en cours hors ZAILON et rattaché automatiquement) ;
- `presenceEvidence: string[]` : preuves ayant conduit à la présence
  (`processus`, `installation`, `steam`, `fenêtre`…) ;
- `finalProcess`, `confidence` : processus final réel + score de correspondance ;
- `deploymentActive` : **false** pour une session `external` — les mods
  pré-lancement n'ont pas pu être déployés (le jeu était déjà lancé) ;
- `timeline` : chaîne complète (GameLaunchRequested → LauncherExited →
  ElevationRequested → GameAttached → GameExited).

États : `Preparing → LauncherStarted → WaitingForElevation → WaitingForGame →
GameDetected → GameRunning → GameLost → Ending → Ended | Failed`.

## Règle de migration (imposée aux modules)

Plus aucun module ne teste `processStartedByZailon`. Les fonctions runtime se
branchent sur l'état de session :

- clavier QWERTY / AZERTY : `session.state == GameRunning` (et focus jeu) ;
- Visual Profile : `GameFocused` → appliquer, `GameUnfocused` → restaurer ;
- Discord Rich Presence : `GameSessionStarted` / `GameSessionEnded` ;
- compteur de temps : `GameDetected → GameEnded` (temps réellement en jeu) ;
- mode jeu ZAILON : `GameRunning` (suspendre Nexus/galeries/scans lourds).

## Watchdog avec preuve Steam

`sessionWatchdog(steamAppIds)` : quand la fenêtre de rattachement expire,
la session ne passe **pas** en `GameLost` si Steam indique encore que l'AppID
du jeu tourne (registre `HKCU\Software\Valve\Steam\RunningAppID` + drapeaux
`Apps\<appid>\Running`). L'attente est prolongée de 45 s (étape
`SteamEvidence` dans la timeline) — le timeout est basé sur l'activité, pas sur
un délai arbitraire de 90 s.

## Détection hors ZAILON

`attachDetectedGame(gameId, processName, confidence, evidence)` : si un jeu
configuré tourne sans session (lancé depuis Steam, relancé par un launcher,
redémarrage de ZAILON), la session est créée automatiquement avec :

- profil : dernier profil utilisé pour ce jeu (sinon premier) ;
- `source: 'external'`, `deploymentActive: false` (mods pré-lancement non
  appliqués — affiché honnêtement dans l'interface) ;
- fonctions runtime attachables actives (QWERTY, visuel, compteur, présence) ;
- notification « Jeu détecté — session ZAILON récupérée automatiquement ».

Aucun bouton « Attacher » dans l'interface standard (voir
`smart-play-button.md`).

## Quitter le jeu

L'UI n'expose que « Quitter le jeu » (jamais « Terminer la session »). Le flux :
bouton « En cours » → confirmation « Retour au jeu / Quitter le jeu » →
confirmation « progression non sauvegardée » → `endSession(gameId)` (demande
de fermeture normale via le nettoyage natif, pas de kill brutal).

## Critères d'acceptation

- la disparition du premier PID ne termine plus la session (jeu avec launcher) ;
- Steam dit « En cours » + ZAILON a perdu le PID → recherche du processus final
  au lieu de terminer ;
- un jeu lancé hors ZAILON est rattaché automatiquement (sans bouton) ;
- `deploymentActive` est honnête (false pour un jeu lancé hors ZAILON) ;
- les mods pré-lancement ne sont jamais démontés pendant une transition de
  launcher.
