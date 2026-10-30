# Runtime Toast — preuve de connexion réelle (release 1.52.0)

Spécification : bloc « Quick Panel / Panneau rapide » — spec §1-7 (Runtime Toast),
§42 (rappel raccourci), §62-63 (notifications).

## Principe : le toast est une PREUVE de connexion

Le Runtime Toast n'est pas une notification de lancement : c'est le signal fiable
que la chaîne **ZAILON → jeu → fonctions runtime** est réellement montée. Si la
petite bulle apparaît avec `QWERTY ✓ · Visuel ✓`, alors la session est réellement
reliée.

## Déclenchement (spec §4)

Le toast « En cours via ZAILON » n'apparaît que lorsque :

- le **vrai processus final** est détecté (premier `sessionGameDetected`, confiance
  ≥ seuil) ;
- la session est `GameRunning` ;
- le profil est résolu ;
- le RuntimeFeatureCoordinator a tenté d'activer ses fonctionnalités.

Il n'est **jamais** déclenché par : clic Jouer, ouverture de Steam, ouverture du
launcher, UAC, processus intermédiaire. (Audité dans le store : l'émission est dans
`sessionGameDetected`, pas dans `launchGame`.)

## Contenu contextuel (spec §2, §5, §19)

Badges alimentés par l'état RÉEL de la session (jamais la configuration) :

| Fonction | Source de vérité |
| --- | --- |
| QWERTY | `session.inputProfileActive` |
| Visuel | `session.visualProfileActive` |
| Mods | `session.runtimeToolsActive` |
| Déploiement | `session.deploymentActive` |

- **Connexion complète** : `QWERTY ✓ · Visuel ✓ · Mods ✓` (ton émeraude).
- **Connexion partielle** : une fonction active + une absente → ton ambre +
  « connexion partielle » (spec §5 : jamais un gros popup d'erreur).
- **Applications non-jeux** (Photoshop…) : aucun badge mods, juste la connexion
  (spec §98).

## Rappel du raccourci (spec §42, §63)

`Ctrl+Alt+Z · Panneau rapide` apparaît sous la bulle **seulement les 3 premières
sessions** (`shortcutHintCount` persisté, limite `SHORTCUT_HINT_LIMIT = 3`), puis
plus jamais.

## Notifications activables (spec §62)

Paramètres > Tâches et notifications :

- « En cours via ZAILON » (défaut ON) ;
- « Session terminée » (défaut ON).

## Durée et animation (spec §3)

2,5 s, fade + translation droite, pas de son, pas de rebond. Une seule bulle à la
fois (aucune superposition, spec §90). Aucun toast par réglage (spec §91).

## Module

`src/lib/runtimeToast.ts` — logique pure, 10 tests :

- `buildRuntimeToastContent(session, game, shortcutHintCount, shortcutLabel)` ;
- `runtimeBadges(session)` ;
- `isPartialConnection(session, isGame)` ;
- `SHORTCUT_HINT_LIMIT`.

## Validation

- `tsc` ✅, build ✅, **134/134 tests** (10 nouveaux).
- **Verify native ✅ + Verify ZAILON ✅** (release 1.52.0).

## Limites / prochaines étapes du bloc Quick Panel

- **Contenu enrichi du panneau** (spec §16-18) : ViewModel léger
  (`QuickPanelSessionViewModel`, spec §39) — la fenêtre native existe déjà
  (1.40.0), le contenu contextuel par jeu (Cyberpunk/NTE) reste à faire.
- **Multi-session dans le panneau** (spec §13-15, §48-50) : sélecteur de session
  en en-tête, épinglage prioritaire — `pickPrioritySession` existe côté store.
- **Bouton Test** (spec §44) et **diagnostic développeur** (spec §45) pour le
  panneau.
- **Mémorisation position/écran** (spec §51-52) et **auto-hide** (spec §83-84).
