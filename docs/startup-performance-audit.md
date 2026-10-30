# Démarrage ZAILON — audit et optimisation (spec Startup Partie A §1-25)

Livré en 1.66.0.

## Audit du chemin de boot (constat)

Le démarrage de l'app se décompose en :

1. **Rechargement du store** (zustand persist, localStorage) — synchrone, contient les
   jeux, profils et mods ; les migrations tournent à ce moment.
2. **`main.tsx`** — `bootstrapTheme()` applique les tokens **avant** le premier rendu
   (déjà en place depuis 1.62.0, anti-flash).
3. **Effets App** au premier montage :
   - `reconcileRuntimeActivity()` — dérivé des sessions, léger ;
   - `refreshStagedCatalogs()` — lecture IPC des manifestes par jeu (async) ;
   - **GamePresenceEngine** — watcher à 1 s (récupération de session, preuve Steam) ;
   - listeners IPC (`backgroundTasks`, `pendingExternalInstalls`, `game-process-*`) ;
   - raccourcis globaux (Quick Panel, visuels) ;
   - UpdateProvider (vérification de mise à jour).

Constat : aucune de ces opérations ne bloque réellement le thread UI (tout est async ou
sur intervalle), mais **elles se lancent toutes dans la même fenêtre de temps**, en
concurrence avec le watcher de session — d'où les « ZAILON ne répond pas » ressentis sur
les machines lentes : pic d'IPC + GC + migrations synchrones du store au premier montage.

## Ce qui a été changé (1.66.0)

### StartupCoordinator (`src/lib/startup.ts`)

Phases et délais :

| Phase       | Priorité    | Délai  | Contenu                             |
| ----------- | ----------- | ------ | ----------------------------------- |
| bootstrap   | critical    | 0 ms   | settings, thème, accent, langue     |
| shell       | interactive | 0 ms   | sidebar + Accueil depuis cache      |
| local       | interactive | 100 ms | état local, catalogues staged       |
| sessions    | interactive | 150 ms | récupération des sessions actives   |
| services    | normal      | 800 ms | Discord, Steam, tâches, providers   |
| idle        | idle        | 4 s    | maintenance, deep scans, artwork    |

Règles codées :
- `isNetworkFreePhase('bootstrap' | 'shell' | 'local')` — le réseau ne démarre jamais
  avant l'interactif ;
- `chunkedWork(items, perChunk, …)` — découpage des gros traitements (~16-50 ms/tranche) ;
- jamais de `Promise.all` massif au boot (spec §10).

### Câblage App

- `refreshStagedCatalogs()` → phase **local** (100 ms) : ne concurrence plus la
  récupération de session ;
- `backgroundTasks()` + listener → phase **services** (800 ms) ;
- `pendingExternalInstalls` + listener → phase **services** (800 ms) ;
- marqueurs `shellAt` / `interactiveAt` posés par le profiler.

### Diagnostics développeur

- **UIWatchdog** (`createUiWatchdog`) : en DEV, tout bloc de l'event loop > 250 ms est
  journalisé (`Long UI task detected · durée ms`). Zéro coût en prod (non monté).
- **StartupProfiler** (`createStartupProfiler`) : `timeToWindow`, `timeToShell`,
  `timeToInteractive` — résumé formaté pour la console dev.

### LibraryStartupCache

Résumé léger par jeu (id, titre, miniature, favori, running, temps de jeu, profil actif)
— jamais les listes de mods : l'Accueil/Bibliothèque s'affichent depuis ce cache.

## Règles d'or à respecter

1. Aucune nouvelle fonctionnalité ne doit s'initialiser au boot (ex. Frosty, §96).
2. Toute section est chargée à la première ouverture réelle (Explorer, Visual Profiles,
   Mods, artwork).
3. Les tests providers/API ne se font pas au démarrage — seulement à l'ouverture
   d'Intégrations/Explorer ou selon intervalle.
4. Une tâche lourde sur le thread UI est une régression : la déplacer en phase
   services/idle ou la découper.

## Mesures (mode dev)

À obtenir sur machine normale : fenêtre quasi immédiate, UI interactive < 1-2 s, réseau
ne conditionnant jamais le TTI. Les valeurs exactes dépendent de la machine et de la
taille de la bibliothèque (voir spec §97 pour les scénarios de test).
