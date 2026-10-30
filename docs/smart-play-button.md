# SmartPlayButton — un seul bouton Jouer

## Principe

L'utilisateur ne doit jamais avoir à comprendre processus / launcher / PID /
session. Il n'existe qu'**un seul CTA principal** par jeu, dont le libellé et le
comportement sont pilotés par l'état de la session :

| État | Libellé | Comportement |
| --- | --- | --- |
| Jeu fermé | `Jouer` | Préparation des mods puis lancement (ou launcher officiel) |
| Préparation | `Préparation 34%…` | désactivé, barre de progression |
| Steam / launcher ouvert | `Lancement…` | désactivé, attente |
| UAC requis | `Autorisation requise…` | désactivé, message UAC |
| En attente du processus final | `Recherche du jeu…` | désactivé, scan actif |
| Jeu détecté | `En cours` (pastille verte) | ouvre la confirmation de sortie |
| Launcher ouvert mais jeu non détecté | `Réessayer` | relance la tentative |

L'état secondaire est affiché en petit texte sous le bouton — **jamais** sous
forme de boutons supplémentaires.

## Actions manuelles supprimées de l'UI standard

`Attacher au jeu en cours`, `Continuer à attendre` et `Terminer la session` ne
sont plus affichés autour de Jouer (Accueil + page du jeu). Le rattachement est
automatique (GamePresenceEngine, `game-presence-engine.md`). Les outils
manuels restent disponibles uniquement dans **Diagnostic > Lancement**
(outils avancés, utilisés pendant la configuration d'un nouveau jeu).

## Clic sur « En cours »

Ne lance **jamais** une seconde instance. Il ouvre une micro-fenêtre intégrée :

1. « Le jeu est actuellement en cours d'exécution. Souhaitez-vous vraiment le
   quitter ? » — bouton principal **Retour au jeu**, secondaire **Quitter le jeu** ;
2. si « Quitter le jeu » : « Toute progression non sauvegardée peut être
   perdue. » — **Annuler** / **Quitter le jeu** (rouge).

Fermeture par Échap ou clic extérieur. La fermeture du jeu n'est jamais
l'action par défaut ; aucun « Forcer la fermeture » immédiat (fermeture normale
via le nettoyage natif d'abord).

## Règles de layout

- un seul CTA principal, emplacement fixe, aucune superposition ;
- le menu déroulant (Jouer / Préparer et attendre le jeu / Lancer sans mods)
  reste accessible uniquement quand le jeu est fermé (pas pendant une session) ;
- badge « En cours » : pastille verte pulsante + libellé, cohérent avec Steam.
