# Profils Performance par jeu (spec §5-10, §23-24, §27, §36-40)

## Distinction UI (demande utilisateur)

Deux familles **jamais mélangées** dans Bibliothèque > Jeu > Configuration >
Performances :

| Performance ZAILON | Performance du jeu |
| ------------------ | ------------------ |
| Téléchargements (Normaux / Limités / En pause) | Priorité du processus (Auto / Normale / Supérieure à la normale / Haute) |
| Scans (Normaux / Réduits / En pause) | Limite FPS — backends natifs à venir (spec §18-31) |
| Animations ZAILON (Normales / Réduites / Désactivées) | |
| Quick Panel (Normal / Minimal) | |
| Priorité ZAILON (Normale / Basse) | |

## Presets (spec §24)

- **Automatique** — se résout sur Équilibré par défaut (adaptation batterie à
  venir, spec §34) ;
- **Équilibré** — téléchargements limités, scans réduits, animations réduites ;
- **Performance** — pause téléchargements + scans, animations coupées, Quick
  Panel minimal, priorité ZAILON basse, priorité du jeu automatique ;
- **Qualité** — pause mais animations normales (ne touche jamais aux réglages
  graphiques du jeu) ;
- **Personnalisé** — les 5 politiques ZAILON éditables (défauts = Équilibré).

## Résolution effective (spec §37-39)

`effectivePerformance(modes, customs, sessions, priorityGameId)` :
- une session active qui demande la **pause** → pause globale (la pause gagne) ;
- à la fermeture de la session prioritaire → recalcul automatique (l'état est
  dérivé des sessions vivantes : rien ne reste bloqué, spec §36) ;
- la priorité du processus du jeu suit la **session prioritaire** uniquement.

## Application concrète (release 1.47.0)

- **Animations** : le parallaxe des couvertures est coupé pendant le jeu quand
  la politique effective est réduite/désactivée (spec §14).
- **Téléchargements** : bannière « En pause — jeu actif » dans Téléchargements
  (spec §11).
- **Priorité du processus** : la politique est définie et affichée, l'application
  native (récupération du PID final + réversibilité à la fermeture) arrive avec
  le runtime arbiter.
- **Paramètres globaux** (spec §40) : Mode par défaut + Comportement sur batterie.

## GameModeTaskScheduler (release 1.48.0, spec §13, §11-12, §36)

Les politiques effectives ne sont plus seulement affichées : elles **pilote le
runtime** via un état dérivé (`runtimeActivity` dans le store) recalculé à
chaque changement de session ou de profil (`reconcileRuntimeActivity()`).

### Ce qui est suspendu pendant le jeu

- **Cadence du GamePresenceEngine** : 3 s → 6 s quand un jeu tourne **ou** que
  la politique effective impose la pause (spec §8) — la présence Steam/runtime
  reste suivie, sans activité lourde.
- **Artwork automatique** (spec §12) : suspendu quand les scans sont en pause
  (reprise au prochain ajout de jeu — aucune file orpheline).
- **Actions lourdes de l'interface** (spec §8) : boutons **Analyser** (onglet
  Mods) et **Détecter** (Bibliothèque) désactivés pendant le jeu, avec
  infobulle explicative.

### Pourquoi rien ne reste bloqué (spec §36)

`runtimeActivity` est **dérivé des sessions vivantes** — il n'est jamais
persisté. Quand la session prioritaire se termine, `reconcileRuntimeActivity()`
retombe automatiquement sur `{ downloads: 'normal', scans: 'normal' }` : pas de
restauration à programmer, pas d'état orphelin.

### Limites assumées (cette étape)

- Les tâches natives (téléchargements réels en cours, scans Rust) ne sont pas
  encore interrompues au niveau du processus — l'étape suivante gatera les
  `register_background_task` côté Rust avec les priorités spec §13
  (CriticalRuntime / High / Normal / Background / PausedWhileGaming).
- La priorité du processus du jeu (spec §14-16) reste à appliquer nativement.

## Validation

- `tsc` ✅, build ✅, **99/99 tests** (7 sur `performanceProfiles` : presets,
  aucune session → normal, pause gagne multi-session, recalcul à la fermeture,
  custom, réduction animations, session de référence).
- **Verify native ✅ + Verify ZAILON ✅** (release 1.48.0).

## Limites / prochaines étapes

- Gating natif des `register_background_task` (priorités spec §13) : les
  téléchargements et scans Rust réellement en cours sont interrompus/repris.
- Application native de la priorité du processus (spec §14-16) avec
  restauration à la fermeture.
- Backends FPS natifs (spec §18-31) : Unlock FPS via l'adaptateur du jeu,
  jamais d'injection ; anti-cheat = méthodes officielles seulement.
- Adaptation batterie (spec §34) dans le mode Automatique.
