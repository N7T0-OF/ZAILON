# NTE — Correctif de la chaîne de lancement v3 (ntegloballauncher.exe)

> Spec : « Correctif urgent lancement NTE + simplification totale du bouton Jouer ».
> Livré dans la **1.21.1** (frontend) + **1.22.0** (batch natif, validé PR #1).

## 1. Problème

`ntegloballauncher.exe` (stage intermédiaire réel de la chaîne NTE) était traité
comme un exécutable inconnu :

- le test de chaîne affichait « ne correspond ni au launcher ni aux candidats
  connus — le rattachement pourra nécessiter un attachement manuel » ;
- le score natif ne lui donnait pas le +15 « launcher » (seul `NTELauncher.exe`
  était connu) ;
- l'idée d'« attachement manuel » restait présente dans l'UI standard ;
- un bouton secondaire [▼] proposait « Préparer et attendre » / « Lancer sans
  mods » à côté de Jouer.

## 2. Rôle de ntegloballauncher.exe (documenté, pas deviné)

```
ZAILON → Steam → ntegloballauncher.exe (stage LAUNCHER) → [UAC] → vrai jeu
```

- **Stage valide** : il reçoit +15 « launcher » et ne déclenche jamais
  « Chaîne incomplète ».
- **Jamais le processus final** : score 75/100 en contexte de rattachement
  (40 installation + 15 launcher + 20 contexte) < 80 → il n'est pas
  auto-attaché comme « jeu ». La recherche continue vers le vrai processus.
- **Ne bloque rien** : un launcher intermédiaire n'est pas une preuve de fin.

## 3. Changements

| Fichier | Changement |
|---|---|
| `src/lib/launchAdapters.ts` | NTE : `launcherExecutableCandidates: ['NTELauncher.exe', 'ntegloballauncher.exe']` |
| `src/types/index.ts` | `GameLaunchAdapter.launcherExecutableCandidates?: string[]` |
| `src-tauri/src/process_scanner.rs` | `GamePresenceRequest.launcher_executable_candidates` — le score +15 matche TOUT candidat launcher (test `nte_global_launcher_is_a_valid_stage_but_not_the_game`, 75 < 80) |
| `src/lib/gamePresence.ts` + `native.ts` | propagation des candidats launcher dans la requête de scan |
| `GameConfigurationPanel.tsx` | « Exécutable cohérent avec la chaîne » passe si connu **ou** situé dans l'installation (spec #28 : un nom nouveau ne bloque jamais la chaîne) ; texte « attachement manuel » supprimé |
| `HomeView.tsx` | bouton [▼] secondaire supprimé (Préparer et attendre / Lancer sans mods) ; message GameLost simplifié « Le jeu n'a pas démarré » |

## 4. Correspondance par score (native)

| Processus | Installation +40 | Launcher +15 | Candidat final +25 | Contexte +20 | Score |
|---|---|---|---|---|---|
| `ntegloballauncher.exe` sous NTEGlobal | ✓ | ✓ | — | ✓ | **75** → stage valide, pas le jeu |
| `NTELauncher.exe` | ✓ | ✓ | — | ✓ | **75** → stage valide |
| `HT-Win64-Shipping.exe` sous Binaries\Win64 | ✓ | — | ✓ | ✓ | **85** → jeu détecté |
| `Discord.exe` | — | — | — | ✓ | **20** → ignoré |

## 5. UI avant / après

Avant : `[Jouer] [▼]` + « Préparer et attendre » + « Lancer sans mods » +
« Chaîne incomplète — vérifié à 29770249211h 15m ».

Après : un seul `[Jouer]` → `[Préparation…]` → `[Lancement…]` →
`[Recherche du jeu…]` → `[● En cours]`. Les outils avancés restent dans
**Configuration > Lancement** et **Diagnostic** (Préparer et attendre, lancer
sans mods) — jamais à côté de Jouer.

## 6. Notification « jeu en cours » (spec §21-24)

Quand le PROCESSUS FINAL est détecté (jamais au lancement d'un launcher
intermédiaire), un toast apparaît en haut à droite pendant 2,5 s :

- **En cours via ZAILON** — la session a été lancée par ZAILON (transition
  `WaitingForGame` → `GameRunning`) ;
- **Jeu détecté par ZAILON** — jeu tournant hors ZAILON récupéré en cours
  d'utilisation (`attachDetectedGame`) ;
- **Session récupérée** — jeu déjà lancé quand ZAILON redémarre (fenêtre de
  grâce de 20 s après le boot du store).

La décision `recovered` vs `detected` est une fonction pure (`recoveryKind`,
`sessionPriority.ts`, testée) ; le toast est auto-fermé, fermable au clic.

## 7. Limites restantes

- La vraie chaîne NTE (nom exact du processus final, fenêtres) reste à confirmer
  sur la machine avec le jeu (protocole `docs/nte-keyboard-remap-test.md`).
- `ntegloballauncher.exe` est ajouté comme **candidat** launcher : si le nom réel
  diffère sur la machine, le +15 ne s'applique pas mais la détection par chemin
  (installation + corrélation temporelle) continue de fonctionner.
