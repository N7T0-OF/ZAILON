# ZAILON — Système de lancement multi-étapes (GameSession)

> Cas prioritaire : **Neverness to Everness** (launcher officiel + UAC + jeu final).
> Le principe central : **ZAILON ne « possède » plus un PID, il « possède » une
> session de jeu**. Même si la chaîne devient
> `ZAILON → Steam → NTELauncher → UAC → launcher élevé → vrai NTE`,
> ZAILON conserve le même contexte : profil, mods, clavier, visuels, temps de jeu,
> présence Discord.

## Problème réel

Pour certains jeux (NTE en tête) :

1. ZAILON lance le jeu ou son launcher ;
2. un launcher officiel s'ouvre ;
3. Windows demande une élévation UAC ;
4. le processus initial lancé par ZAILON se ferme ;
5. le launcher officiel démarre un autre processus ;
6. le vrai jeu démarre ensuite depuis ce launcher ;
7. ZAILON croit que la session s'est terminée (l'événement natif
   `game-process-stopped` est émis à la sortie du premier PID).

Conséquences : « En cours » disparaît, le compteur s'arrête, le profil n'est plus
attaché, le remapping AZERTY/QWERTY et le Visual Profile sont désactivés, les
outils runtime s'arrêtent, et le déploiement peut être démonté prématurément.

## Modèle

### GameSession

Une session n'est liée à **aucun PID unique** :

```ts
interface GameSession {
  id: string
  gameId: string
  profileId: string
  launchStrategy: LaunchBehavior
  launcherProcessIds: number[]
  gameProcessIds: number[]
  startedAt: number
  gameDetectedAt?: number
  endedAt?: number
  state: GameSessionState
  runtimeToolsActive: boolean
  deploymentActive: boolean
  inputProfileActive: boolean
  visualProfileActive: boolean
  source: SessionSource          // 'zailon' | 'manual' | 'reattached' | 'recovered'
  reattachUntil?: number         // fin de la fenêtre de rattachement
  graceUntil?: number            // délai de grâce avant fin réelle
  timeline: GameLaunchChainStep[]  // 18:12:04 Steam launch requested …
  confidence?: number            // confiance du rattachement (0-100)
  finalProcess?: string          // ex. HT-Win64-Shipping.exe
}
```

États : `Preparing | LauncherStarted | WaitingForGame | GameDetected |
GameRunning | GameLost | Reattaching | Ending | Ended | Failed`.

### Règles clés

- **La fermeture du premier PID ne termine plus la session** : pendant la fenêtre
  de rattachement `ProcessReattachWindow` (30-120 s, configurable par adaptateur),
  la sortie du launcher passe la session en `WaitingForGame` — le déploiement
  reste actif, le timer continue, les watchers restent.
- **Déploiement avant le launcher** : `PrepareProfile → BuildDeployment →
  ApplyDeployment → VerifyRuntimePaths → StartOfficialLauncher → WaitForGame →
  AttachFinalGameProcess`. Les mods/PAK/loader/bypass sont prêts AVANT l'ouverture
  du launcher.
- **Runtime après détection** : AZERTY/QWERTY, Visual Profile, Discord, compteur,
  mode jeu, gestion focus ne s'activent qu'à `GameRunning` — pas au lancement.
- **Fin réelle** : uniquement quand aucun processus jeu reconnu, aucun launcher en
  préparation, aucune fenêtre reconnue, et après `GameEndGracePeriod` (5-15 s).
- **Rattachement** : manuel (« Attacher au jeu en cours »), automatique
  (réattachement par installation + signature), ou récupéré après redémarrage de
  ZAILON. Ne jamais associer un processus uniquement parce que son nom contient
  « NTE » : chemin, installation, temps, signature, fenêtre.
- **UAC** : jamais contourné (pas d'auto-acceptation, pas de désactivation, pas de
  ZAILON en administrateur par défaut). État `WaitingForElevation` : « Acceptez la
  fenêtre UAC pour continuer ».
- **ACE (NTE)** : aucun hook, injection, driver, écriture processus, fichier modifié.
- **Événements** : `GameLaunchRequested, LauncherDetected, ElevationRequested,
  LauncherExited, CandidateGameDetected, GameAttached, GameForeground,
  GameBackground, GameExited, SessionRecovered` — QWERTY, Visual Profile, Discord
  et Mode Jeu s'abonnent à ces événements, ils ne gèrent plus les PIDs.
- **Règle d'architecture** : remplacer `if (processStartedByZailon) enableFeature()`
  par `if (gameSession.state === GameRunning) enableFeature()` — clavier, Visual
  Profile, Rich Presence, timer, overlays, mode jeu, watchers, nettoyage runtime.

### Adaptateurs par jeu (`GameLaunchAdapter`)

```ts
interface GameLaunchAdapter {
  launchBehavior: LaunchBehavior  // DirectProcess | LauncherChild | LauncherDetached
                                 // | SteamLauncher | ExternalLauncher | MultiStage
  launcherExecutable?: string
  gameExecutableCandidates: string[]
  reattachWindowSeconds: number   // défaut 60
  endGraceSeconds: number         // défaut 10
  launchChainStages: string[]     // ex. ['Steam', 'NTELauncher', 'UAC', 'Game']
}
```

Valeurs connues : NTE = `SteamLauncher`/`LauncherDetached` (launcher `NTELauncher`,
candidats `HT-Win64-Shipping.exe`, racines `Client\WindowsNoEditor\HT\Binaries\Win64`) ;
Cyberpunk = `DirectProcess`/`SteamLauncher` ; FiveM = `ExternalLauncher`/`MultiStage`.

## Contrat natif (Phase 6 Rust)

- L'événement `game-process-stopped` ne doit plus suffire : la sortie du PID
  initial déclenche `WaitingForGame`, pas la fin de session.
- Nouveau service natif `GamePresenceScanner` (polling adaptatif : 1-3 s hors
  session, 250-500 ms pendant le rattachement, 1 s ou événements en jeu) qui émet
  `game-process-detected` avec `{ gameId, processName, processPath, confidence }`.
- `DetachedProcessReattacher` : corrélation temporelle + chemin sous l'installation
  + signature + fenêtre (les signatures sont mémorisées par
  `ProcessSignatureLearning`, jamais uniquement le PID).
- Voir `docs/input-backends-rust-design.md` pour la boucle de validation (PR →
  `verify-native.yml` ou machine avec MSVC) : le code natif ne doit pas être posé
  dans `src-tauri` sans cette validation.

## UI

- **Accueil** : états de session (Préparation / Launcher ouvert / En attente du jeu
  + compte à rebours / En cours), pastilles QWERTY ✓ PAK ✓ Bypass ✓, actions
  « Continuer à attendre », « Détecter un processus », « Terminer la session ».
- **Bibliothèque > jeu** : « Attacher au jeu en cours », « Préparer et attendre le
  jeu » (déploie + watcher + attente du lancement manuel).
- **Diagnostic > Lancement** : méthode, session active, chaîne de processus,
  processus final, rattachement, confiance, QWERTY, mods, timeline.
- **Notifications** : rattachement certain → toast ~2 s ; échec après 90 s →
  action avec [Continuer à attendre] [Détecter un processus] [Voir le diagnostic]
  [Terminer la session].

## Critères d'acceptation (rappel)

La disparition du premier processus ne termine plus la session ; NTE est reconnu
après redirection par son launcher ; le temps continue ; les mods restent déployés ;
QWERTY et Visual Profile se déclenchent après rattachement ; Alt+Tab restaure ;
le launcher peut fermer sans fermer la session ; attachement d'un NTE lancé
manuellement ; récupération après redémarrage ZAILON ; UAC et ACE jamais contournés ;
les lancements directs (Cyberpunk, sans launcher) ne sont pas cassés.

Rapports attendus : `docs/nte-launch-chain-report.md`,
`docs/game-session-architecture.md`, `docs/process-reattachment-report.md`
(à écrire après les tests sur un vrai jeu).
