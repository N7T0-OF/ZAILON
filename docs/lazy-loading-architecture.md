# Lazy loading architecture

Spécification : Startup Partie A §16-20 — « Ne charger une section que lorsqu'elle est réellement ouverte ».

## Principe

ZAILON n'initialise **aucune** section secondaire au démarrage. Le boot charge
uniquement le minimum (settings, thème, shell), puis chaque page s'initialise
lorsqu'elle est réellement ouverte. Le réseau ne conditionne jamais Time To
Interactive.

## Ce qui est déjà lazy

| Élément | Comportement |
| --- | --- |
| Pages (Explorer, Visual Profiles, Téléchargements, Notes, Paramètres) | Montées uniquement quand `currentView` les affiche (`AppWindow`) — changer de vue **détruit** la page précédente (lecteur vidéo inclus). |
| Providers (Nexus, GameBanana, CurseForge) | Aucune init au boot ; le catalogue se charge au premier accès d'Explorer. |
| Santé des providers | `ProviderHealthCache` partagé (TTL 5 min) — jamais testé au boot, re-testé à l'ouverture d'Explorer / Intégrations ou sur refresh manuel (§20). |
| Tâches d'arrière-plan | Chargées en phase `services` (StartupCoordinator), pas sur le chemin critique. |
| Fonds vidéo / YouTube | Différés après l'UI stable ; le composant n'est monté que sur l'Accueil (§15, 19). |
| Frosty | Jamais initialisé tant qu'on n'ouvre pas un jeu Frosty, n'importe pas un `.fbmod` ou ne clique pas Jouer (§96). |

## Squelettes de chargement

Une page lourde s'affiche **instantanément** avec des blocs pulsés aux
dimensions de son contenu final, puis ses données arrivent :

- `src/components/UI/Skeleton.tsx` : `Skeleton`, `SkeletonCard`,
  `SkeletonGrid`, `SkeletonRows`, `SkeletonIndicators`, `PageSkeleton`.
- Visual Profiles : squelette complet pendant le premier chargement du backend.
- Explorer : `LoadingGrid` (grille de cartes pulsées) pendant le chargement du
  catalogue.

Règle : **jamais d'écran vide ni de spinner plein écran au premier accès** —
toujours un squelette qui ressemble à la page.

## Cache santé providers (§20)

`src/lib/lazyPages.ts` :

- `ProviderHealthCache<T>` : valeur + `checkedAt`, fraîche pendant le TTL
  (5 minutes par défaut), `invalidate()` pour forcer un re-test.
- `providerHealthCache` : singleton partagé entre Explorer et Intégrations.
- `cachedProviderStatuses(cache, getter)` : réutilise la valeur fraîche, sinon
  appelle le getter natif et met en cache.

Ouvrir Explorer puis Intégrations dans les 5 minutes n'appelle plus qu'**une**
fois `provider_connection_statuses` (IPC natif), au lieu de deux.

## Exécution différée dans une page

`scheduleAfterIdle(task)` exécute une initialisation non critique après le
premier paint via `requestIdleCallback` (repli `setTimeout` ~200 ms, annulable).
À utiliser pour tout ce qui n'est pas nécessaire au rendu immédiat d'une page.

## Limites connues

- Le catalogue GameBanana est relancé à chaque ouverture d'Explorer (sans TTL
  applicatif) — les résultats restent légers et paginés.
- La liste complète des mods d'un jeu n'est matérialisée que lorsque l'onglet
  Mods / Explorer est ouvert ; les cartes Bibliothèque utilisent les résumés
  (`LibraryStartupCache`).
