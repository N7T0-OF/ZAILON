# Bibliothèque locale — détection unifiée

Spec « Détection locale » §5-6 : il n'existe **qu'une seule** fenêtre de
détection dans ZAILON, ouverte depuis tous les points d'entrée. Fini les
« deux systèmes différents » (file picker d'un côté, scan silencieux de
l'autre).

## La fenêtre

`SteamDetectionDialog` (« Bibliothèque locale ») :

1. Choix du mode : **Détection rapide** (index Steam, Epic, Registre —
   aucun parcours global du disque) ou **Détection complète** (complète avec
   une recherche limitée aux dossiers d'installation déclarés).
2. Analyse avec progression par fournisseur (Steam, Epic, Applications
   Windows, FiveM Client) + diagnostics par source.
3. Résultats avec sélection, filtres (type, source, recherche), choix
   d'exécutable quand nécessaire.
4. « Ajouter N » → `importDetectedGames` (déduplication multi-signaux :
   `provider:appid` stable ou exécutable+chemin équivalents).

## Points d'entrée unifiés

Tous ouvrent exactement la même fenêtre (`setDiscoveryDialogOpen(true)`),
rendue **une seule fois** dans `AppWindow` via un portail :

| Entrée | Avant 1.124 | Après |
|---|---|---|
| Sidebar « + » (Ajouter un jeu ou logiciel) | file picker (`addGameFromExecutable`) | fenêtre partagée |
| Bibliothèque → Détecter | gate Steam Advanced + scan silencieux sans l'add-on | fenêtre partagée, toujours |
| Accueil → Ajouter / Détecter | instances locales distinctes | fenêtre partagée |
| Palette de commandes → Ajouter / Détecter | file picker / navigation | fenêtre partagée |

## Architecture

- `discoveryDialogOpen` + `setDiscoveryDialogOpen` dans le store —
  **transitoire, absent de `partialize`** (jamais persisté).
- Le dialogue est un **service Core** : la détection locale (Steam, Epic,
  Registre Windows, FiveM) ne dépend d'aucun add-on. `steamAdvanced` ne
  gate plus l'ouverture de la fenêtre.
- `addDetectedGames` (scan silencieux en arrière-plan) n'est plus appelé
  depuis l'UI — un bouton ne fait plus jamais rien « dans le vide » sans
  afficher la fenêtre.

## Garanties (`.github/scripts/test-library-detection.ts`, 7 tests)

- Un seul rendu partagé : AppWindow oui, HomeView/GamesView non.
- « Détecter » → `setDiscoveryDialogOpen(true)`, plus de `addDetectedGames`.
- Sidebar « + » → fenêtre partagée, plus de file picker.
- `discoveryDialogOpen` jamais persisté.
- `scan_library` natif intact (Core).
