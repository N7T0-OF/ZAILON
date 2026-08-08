# Quick Game Panel — fenêtre native ZAILON (pas d'overlay injecté)

## Statut

**Implémenté (1.20.0) + détection plein écran exclusif (1.21.0), validé en
compilation par la PR #1** (Windows + Linux). Comportement réel à confirmer
sur machine avec jeu : ouverture de la fenêtre, position, fermeture à la
perte de focus, détection du plein écran exclusif.

## Objectif

Pendant le jeu, ouvrir une petite fenêtre ZAILON pour régler rapidement
Visual Profile / clavier, sans quitter le jeu. Ce n'est **pas** une injection
dans le jeu : c'est une fenêtre native indépendante (API Windows standard).

## Activation

- Réglages > Panneau rapide en jeu : « Afficher le panneau rapide ZAILON »,
  défaut **désactivé** ;
- raccourci configurable, défaut **Ctrl + Alt + Z** (pas Alt+Z : conflit
  possible avec NVIDIA).

## Implémentation

- `src-tauri/src/quick_panel.rs` : fenêtre Tauri `quick-panel` créée au moment
  de l'ouverture (jamais au démarrage) — 340×460, sans barre de titre,
  transparente, toujours au-dessus, hors barre des tâches, positionnée en bas
  à droite de l'écran du jeu. **Fermeture automatique à la perte de focus**
  (gardée par « a déjà reçu le focus » pour éviter une fermeture immédiate à
  l'ouverture).
- `src/main.tsx` : la fenêtre `quick-panel` rend uniquement
  `components/QuickPanel.tsx` (visuel : activer/désactiver, profils préc./suiv.,
  restaurer ; clavier : disposition ZAILON on/off ; ouvrir ZAILON ; fermer).
- Communication : le panneau pilote le visuel par les commandes natives
  existantes (`visual_shortcut_action`) et envoie `quick-panel-action`
  (`toggle-keyboard` / `focus-main`) à la fenêtre principale, qui bascule
  `setSessionInputActive` ou se ramène au premier plan.
- Raccourci global enregistré seulement quand l'option est activée, ré-ajouté
  après chaque transition de jeu (l'effet des raccourcis visuels repasse par
  `unregisterAll`).

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
- plein écran exclusif : **détecté** (1.21.0) — `exclusive_fullscreen_active`
  compare la résolution active de l'écran (EnumDisplaySettings / ENUM_CURRENT)
  à la résolution du bureau (GetMonitorInfo) ; en exclusif la première diffère
  de la seconde. Si le mode est détecté au raccourci, ZAILON affiche le message
  « Le panneau rapide n'est pas disponible en plein écran exclusif » avec
  [Utiliser Borderless] [Fermer] au lieu d'ouvrir le panneau ; si le jeu passe
  en exclusif pendant que le panneau est ouvert, il se ferme (sondage 2 s).
  **Limite honnête** : un exclusif lancé à la résolution exacte du bureau n'est
  pas distinguable par cette seule preuve. **Pas d'overlay injecté** pour
  contourner.

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
