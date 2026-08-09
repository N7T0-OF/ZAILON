# Runtime Session V3 — cœur (fin de session, état runtime vérifié)

Statut : **implémenté et validé** (release 1.39.0) — cœur du bloc « Runtime
Session V3 ». Le Quick Panel complet (fenêtre native enrichie) et l'import
Cyberpunk façon MO2 (racines virtuelles) font l'objet des prochaines releases.

## 1. Cause des sessions zombies (spec §1-5)

L'événement `game-process-stopped` était émis par le worker natif quand **le
processus lancé par ZAILON** se terminait. Pour un jeu à launcher (NTE), ce
processus EST le launcher : il meurt au moment de l'UAC, la session passe en
`WaitingForGame` puis `GameRunning` quand le vrai jeu est détecté — mais
**personne ne surveillait la disparition du processus final**. La session
restait « En cours » indéfiniment.

## 2. Nouvelle détection de fin (PossibleExit)

```
GameRunning
  → scan périodique (processus hors launcher + fenêtre + Steam)
  → aucune preuve du jeu final
  → PossibleExit (possibleExitSince, grâce 5 s)
  → nouvelle preuve ? → retour GameRunning (lastSeenAt)
  → rien après la grâce → session terminée (GameExited)
```

- **Le launcher ne compte jamais** : le scanner natif renvoie désormais
  `isLauncherProcess` (spec §2) — un `ntegloballauncher.exe` encore vivant ne
  maintient pas « En cours ».
- **Steam est une preuve, pas une source unique** (spec §4) : Steam Running
  maintient la session tant qu'il le confirme ; sans processus ni fenêtre, la
  grâce expire et la session se termine (jamais de zombie, spec §5).
- **Cadence** : pendant une PossibleExit le scan repasse à 3 s (spec §3) ;
  fin constatée en ~6-11 s après la fermeture réelle.
- **Nettoyage complet** : `endSession` restaure le déploiement temporaire,
  arrête le timer, rétablit le remapping (input arbiter) et le Visual Profile,
  nettoie Discord et ferme le Quick Panel.

Logique pure extraite dans `src/lib/sessionEnd.ts` (`evaluateSessionEnd`,
`EXIT_GRACE_MS = 5000`) — 6 tests dédiés.

## 3. Modules runtime : source = la session, pas le PID (spec §6-9)

Les fonctions runtime (QWERTY, Visual Profile, Discord, timer) étaient déjà
branchées sur la session (`sessionGameDetected` → `inputProfileActive`,
`visualProfileActive`, `runtimeToolsActive`), pas sur `initialPid`. Le
rattachement rétroactif (jeu détecté hors ZAILON, après UAC, avant redémarrage)
passe par le même chemin. Ce tour ajoute :

- les **badges vérifiés** (spec §48) : sur l'Accueil pendant une session,
  « QWERTY / Visuel / ZAILON » s'affichent en ✓/⚠ selon l'état réel
  (`inputProfileActive`, `visualProfileActive`, `runtimeToolsActive`) ;
- un garde-fou anti-ré-attachement : les preuves d'une session déjà « En
  cours » alimentent la fin de session, plus jamais un nouvel attach (fini le
  toast et la timeline répétés à chaque scan).

## 4. Toasts de session (spec §51-52)

- **Start** : « En cours via ZAILON » (déjà existant) enrichi d'une ligne de
  détail.
- **Fin** : nouveau toast « Session terminée · <durée> » (2,5 s), non bloquant.

## 5. Quick Panel — test réel (spec §21)

Bouton **« Tester le panneau »** dans Paramètres > Panneau rapide en jeu :
ouvre la vraie fenêtre native même sans jeu (vérifie création, taille, focus,
raccourci). La fenêtre native (borderless, always-on-top, skip-taskbar) et le
raccourci global existaient déjà ; le contenu enrichi arrive avec la prochaine
release.

## 6. Comparer avec la racine attendue (spec §45)

Nouveau bouton dans **État & Diagnostic > Fichiers**. Pour chaque fournisseur
de framework :

```
RED4ext     [Runtime ✓]
paquet red4ext-2.40
Projeté vers : r6 › red4ext › plugins
27 / 27 fichiers visibles
```

- **attendu** = fichiers physiquement présents (`provider.files`) ;
- **projeté** = fichiers réellement exposés dans la carte virtuelle ;
- un framework mal exposé (racine incorrecte) apparaît en « X non exposés »,
  jamais en « absent » — c'est exactement le cas TweakXL/ArchiveXL de l'import
  Cyberpunk actuel.

## 7. Validation

- `tsc` ✅, build ✅, **78/78 tests** (6 nouveaux : `test-session-end.ts`).
- **Verify native** (champ `isLauncherProcess` + 3 tests natifs) + **Verify
  ZAILON** via CI.

## 8. Limites / prochaines étapes

- **Quick Panel complet** : contenu enrichi (profil, clavier, visuel, runtime),
  réouverture sans recréation, diagnostic fenêtre (spec §10-22, §50).
- **Import Cyberpunk façon MO2** : `BulkModFolderScanner` +
  `CyberpunkModRootResolver`, capabilities frameworks, graphe de dépendances,
  réparation des imports existants (spec §23-47, §56-57).
- Tests machine réelle : fermeture NTE → « En cours » quitte sous ~6-11 s ;
  toast de fin ; bouton Test du Quick Panel.
