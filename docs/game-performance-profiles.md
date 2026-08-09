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
  (spec §11) — la pause réelle au niveau des tâches natives arrive avec le
  GameModeTaskScheduler (spec §13).
- **Priorité du processus** : la politique est définie et affichée, l'application
  native (récupération du PID final + réversibilité à la fermeture) arrive avec
  le runtime arbiter.
- **Paramètres globaux** (spec §40) : Mode par défaut + Comportement sur batterie.

## Validation

- `tsc` ✅, build ✅, **100/100 tests** (7 nouveaux : presets, aucune session →
  normal, pause gagne multi-session, recalcul à la fermeture, custom, réduction
  animations, session de référence).
- **Verify ZAILON ✅** (release 1.47.0).

## Limites / prochaines étapes

- GameModeTaskScheduler (spec §13) : pause réelle des tâches natives.
- Application native de la priorité du processus (spec §14-16) avec
  restauration à la fermeture.
- Backends FPS natifs (spec §18-31) : Unlock FPS via l'adaptateur du jeu,
  jamais d'injection ; anti-cheat = méthodes officielles seulement.
- Adaptation batterie (spec §34) dans le mode Automatique.
