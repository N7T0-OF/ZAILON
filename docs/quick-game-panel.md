# Quick Game Panel — fenêtre native ZAILON (pas d'overlay injecté)

## Statut

**Conception validée, implémentation non commencée** (nécessite une deuxième
fenêtre Tauri + raccourci global — travail natif à valider via la PR #1 puis
sur machine réelle).

## Objectif

Pendant le jeu, ouvrir une petite fenêtre ZAILON pour régler rapidement
Visual Profile / clavier, sans quitter le jeu. Ce n'est **pas** une injection
dans le jeu : c'est une fenêtre native indépendante (API Windows standard).

## Activation

- Configuration > Jeu > Interface en jeu : « Afficher le panneau rapide »,
  défaut **désactivé** ;
- raccourci configurable, défaut **Ctrl + Alt + Z** (pas Alt+Z : conflit
  possible avec NVIDIA).

## Contenu (compact)

```
┌───────────────────────────┐
│ ZAILON — NTE          ×   │
│                           │
│ Visuel        Cinématique │
│ Saturation          1.20  │
│ Luminosité        +0.04   │
│ Contraste           1.05  │
│                           │
│ Clavier         QWERTY ✓  │
│                           │
│ [Réinitialiser]            │
└───────────────────────────┘
```

Pas de bibliothèque, Nexus, galeries, téléchargements ni navigation complète.
Largeur ~300–380 px, hauteur adaptative, angles arrondis, ombre légère, fond
sombre, X discret. **Ne pas réintroduire Liquid Glass.**

## Comportement

- fermeture : X, Échap, raccourci, ou perte de focus (option « Fermer lorsque
  le focus est perdu », défaut activé) — Ctrl+Alt+Z → panneau, clic dans le jeu
  → panneau disparaît ;
- modifications appliquées immédiatement (pas de bouton Appliquer), enregistrées
  dans le profil ; protections de restauration conservées pour les réglages
  risquant de rendre l'écran illisible ;
- performances : aucun rendu/timer quand caché ; UI raisonnable quand visible ;
  pas de promesse « zéro perte FPS » — un rapport de mesure CPU/RAM/GPU (panneau
  ouvert vs fermé) est à produire.

## Plein écran

- fenêtré / borderless : fenêtre externe affichable au-dessus ;
- plein écran exclusif : Windows peut empêcher la présentation — détecter le
  mode et afficher « Panneau non disponible en plein écran exclusif
  [Utiliser Borderless] [Fermer] ». **Pas d'overlay injecté** pour contourner.

## Écrans multiples

Option « Afficher le panneau sur : écran du jeu / écran secondaire / dernier
écran utilisé ».

## Focus clavier

À l'ouverture : le panneau reçoit le focus. À la fermeture :
`releasePointerCapture` + `clearPressedState` + restauration du focus au jeu
(API de fenêtre standard, jamais de clic simulé) + réactivation du profil
clavier du jeu — évite les touches bloquées.

## Raccourcis optionnels

Profil visuel précédent / suivant, activer-désactiver QWERTY, reset visuel,
ouvrir panneau — combinaisons configurables, détection de conflits.
