# Frosty Editor — Exigences de performance

> Spec §67-68, §84, §116, §119-120. L'éditeur ne doit **jamais** peser sur le
> démarrage de ZAILON ni sur les sessions normales.

## Règles d'or

1. **Zero startup cost** (§116) : Frosty Editor installé mais non ouvert =
   aucune initialisation SDK, aucune indexation, aucun Worker, aucun plugin, aucune RAM
   significative.
2. **Lazy strict** (§3) : chargement uniquement si l'utilisateur ouvre « Créer un
   projet Frosty », « Éditer avec Frosty », un asset Frostbite, ou l'espace Création.
3. **Worker isolé** (§76-83) : la RAM Frosty est entièrement libérée à la fermeture.
4. **Virtualisation** (§14-15) : jamais de rendu intégral des assets (centaines de
   milliers possibles).
5. **Index en arrière-plan** (§16-17) : premier scan long, ensuite cache par
   (gameVersion, profileVersion, frostyVersion).

## Budgets cibles (mode développeur — profiler §84)

| Opération | Budget cible |
| --------- | ------------ |
| Startup ZAILON avec l'éditeur installé (inactif) | +0 ms, +0 RAM |
| Index assets (premier scan, gros jeu) | progressif, UI fluide |
| Index assets (cache) | réutilisé, quasi instantané |
| Recherche d'asset | debounced, résultats virtuels |
| Ouverture texture | décodage uniquement de l'asset ouvert (§25) |
| Ouverture mesh | async au-delà d'un seuil (§67) |
| Build | Worker/background, non bloquant (§51) |
| Fermeture de l'éditeur | RAM Worker libérée (0 en Max) |

## Mesures

- `AddonPerformanceMonitor` (spec Add-ons §67-68) : RAM, startup contribution,
  tâches de fond, temps CPU par add-on — l'éditeur doit contribuer ~0 au boot ;
- le diagnostic de la vue affiche `memoryCacheMb` et l'état du Worker ;
- mode développeur : temps d'index, ouverture texture/mesh, build, mémoire.

## Anti-règles

- ❌ Pas de polling permanent (filesystem watchers/événements seulement, spec §71) ;
- ❌ Pas de gros asset sur l'UI thread (§67) ;
- ❌ Pas de chargement de tous les plugins au démarrage du Worker (§43) ;
- ❌ Pas de cache cumulé sans nettoyage (anciennes archives, staging, builds — §74) ;
- ❌ Pas de vidage mémoire global : fermer un asset libère sa représentation (§68).

## Test gros jeu (§119)

Indexer un jeu Frostbite à grand catalogue : l'UI reste fluide, la RAM reste bornée,
la recherche reste instantanée.
