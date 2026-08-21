# Quick Panel — multi-session (release 1.54.0)

Spécification : bloc « Quick Panel / Panneau rapide » — spec §13-15 (cible et
changement de session), §48-50 (liste, priorité, pin).

## Problème résolu

Avec plusieurs sessions actives (Cyberpunk + NTE + Photoshop…), le panneau ne
ciblait que la session prioritaire, sans moyen d'en changer ni de voir les autres.
Le sélecteur multi-session règle cela sans fermer le panneau (spec §15).

## Comportement

### En-tête (spec §14, §48)

- **1 session** : en-tête neutre « ZAILON · Panneau rapide » — pas de sélecteur
  (spec §15 : « Ne pas afficher cette liste lorsqu'il n'y a qu'une session »).
- **> 1 session** : l'en-tête affiche le nom de la session courante avec ▼. Au clic,
  la liste des sessions actives (non terminales) s'ouvre : **★ prioritaire**
  (étoile dorée = épinglée). Cliquer sur une session → `set-target` → le panneau
  reçoit l'état compact de cette session, sans se fermer.

### Priorité (spec §49)

Cible par défaut = `pickPrioritySession(sessions, pinned, foreground)` :
1. session épinglée (pin) ;
2. session au premier plan (foreground) ;
3. session la plus récente en `GameRunning`.

Après un changement manuel, la cible est mémorisée (ref côté fenêtre principale)
pour la durée de vie du panneau : les actions **Clavier** et **Performance**
s'appliquent à la session ciblée, pas à la prioritaire automatique.

### Pin (spec §50)

Bouton ★ dans l'en-tête : épingle / dépingle la session courante
(`setPinnedPriority`). Une fois épinglée, le raccourci continue d'ouvrir cette
session même si une autre prend le premier plan. Le pin est **retiré
automatiquement à la fermeture du jeu** (le store nettoie `pinnedPriorityGameId`
quand la session épinglée se termine).

## Fermeture ciblée et bascule (spec §47, §84 — release 1.55.0)

Quand la session affichée par le panneau se termine, ZAILON ne ferme plus le
panneau :

1. il calcule la **session suivante** parmi celles encore en cours ;
2. il bascule la cible (`nextSessionAfterCurrent`) et ré-émet la liste + l'état
   de la nouvelle cible — le panneau reste ouvert avec la nouvelle session ;
3. il ne se ferme que si **plus aucune** session n'est active (spec §47 : « Ne
   pas afficher les anciennes données »).

La cible épinglée ★ disparue ne bloque pas : `pickPrioritySession` est recalculé
sur les sessions vivantes (le pin est retiré par le store) — spec §84.

`nextSessionAfterCurrent(sessions, games, currentGameId, pinned, foreground)`
dans `src/lib/quickPanelState.ts` : exclut la cible disparue et les sessions
terminales, applique la priorité sur le reste ; retourne `undefined` si rien ne
reste. 4 tests : bascule vers la prioritaire restante, fermeture si rien, pin
disparu, pin d'une autre session respecté.

## Événements

| Événement | Sens | Rôle |
| --- | --- | --- |
| `quick-panel-sessions` | principale → panneau | liste des sessions actives |
| `set-target { gameId }` | panneau → principale | changer la cible + ré-émettre l'état |
| `pin-target { gameId }` | panneau → principale | épingler / dépinger (toggle) |

## Logique pure

`activeSessionsForQuickPanel(sessions, games, pinnedGameId, foregroundGameId)` dans
`src/lib/quickPanelState.ts` : filtre les sessions terminales, calcule la priorité,
tri priorité d'abord. 3 tests : pin prioritaire, foreground sans pin, sessions
terminales exclues (spec §47).

## Validation

- `tsc` ✅, build ✅, **147/147 tests** (4 nouveaux en 1.55.0).
- **Verify native ✅ + Verify ZAILON ✅** (release 1.54.0).

## Limites / prochaines étapes

- **« Tester le panneau »** (spec §44) et **diagnostic développeur** (spec §45).
- **Mémorisation position/écran** (spec §51-52) et **auto-hide** (spec §83-84).
- **Nom du profil visuel actif** dans le panneau (spec §17-18).
