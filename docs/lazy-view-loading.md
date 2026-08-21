# Démarrage allégé — chargement des vues à la demande

## Problème

Toutes les vues étaient importées statiquement dans `AppWindow`, donc **parsées
et exécutées dès le lancement** — y compris le code Frosty Editor, Visual
Profiles, Statistiques, Add-ons, Explore et News, alors que l'utilisateur n'y
va pas forcément. Pour un objectif « launcher ultra-léger », c'était du coût
de startup pur.

## Solution

`src/components/Layout/AppWindow.tsx` charge désormais les vues secondaires
via `React.lazy` + `Suspense` :

| Vue | Chunk séparé (minifié) |
| --- | --- |
| FrostyEditorView | ~89 ko |
| ExploreView | ~70 ko |
| VisualProfilesPage | ~42 ko |
| AddonsView | ~36 ko |
| StatisticsView | ~19 ko |
| NewsView | ~2,6 ko |
| SteamDetectionDialog | ~11 ko |

Restent **eager** (indispensables au premier rendu) : `HomeView` (vue par
défaut), `GamesView`, `SettingsView`, `DownloadsView`, la barre latérale, la
barre de titre et les toasts.

## Contrat verrouillé par les tests

`.github/scripts/test-startup-lazy.ts` :

- les 6 vues lourdes sont `lazy(() => import(...))` et jamais importées
  statiquement ;
- `HomeView` reste eager (premier rendu immédiat) ;
- un fallback `Suspense` couvre le chargement différé ;
- la fenêtre de détection locale est lazy (fallback silencieux) ;
- le toggle « Installer les dépendances » (Add-ons) est un `ZailonSwitch`,
  plus une checkbox brute.

## Lien avec l'exigence « zéro coût de startup »

C'est le pendant UI de l'exigence add-on : le code Frosty/Visual/Stats/Add-ons
n'est **pas chargé tant que l'utilisateur n'y navigue pas**, tout comme un
add-on installé mais non ouvert n'initialise rien.
