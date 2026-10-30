# Persistance UI — Explorer + réglages (release 1.50.0)

Spécification : bloc « Fiabilité profils + persistance UI + onboarding + intégrations
API » — priorités 2 (persistance UI), spec §12-17.

## État avant cette release

La quasi-totalité des réglages était déjà persistée via le `partialize` du store
Zustand (thème, densité UI, taille de texte, mode Bibliothèque, tri Explorer, mode
grille, colonnes, NSFW, plateforme, jeu, page, raccourcis, notifications, mode
Performance…). Deux trous restaient :

1. `exploreSearch` — la recherche de l'Explorer était perdue au redémarrage (spec §16) ;
2. aucun debounce pour les réglages modifiés en continu — le color picker d'accent
   écrivait sur disque à chaque pixel de mouvement (spec §17).

## Ce qui a été fait

### 1. `exploreSearch` persisté (spec §16)

Ajout au `partialize` — le bloc `ExplorerPreferences` (spec §14) est désormais
intégralement persisté :

- `viewMode` → `exploreGrid` ✓ (déjà)
- `gridColumns` → `exploreColumns` ✓ (déjà)
- `sort` → `exploreSort` ✓ (déjà)
- `nsfw` → `nsfw` ✓ (déjà)
- `lastProvider` → `explorePlatform` ✓ (déjà)
- `filters` / recherche → `exploreSearch` ✓ **(nouveau)**

La position logique (page, tri, recherche) est restaurée au retour — le scroll n'est
pas persisté après redémarrage (spec §16 : optionnel, évité pour rester simple).

### 2. Sauvegarde debounced (spec §17)

Nouveau helper pur `src/lib/persistDebounce.ts` : `createDebouncer(commit, delayMs)`
avec `push` (coalescence), `flush` (écriture immédiate), `cancel`, `commitCount`.
6 tests.

Appliqué au setter `setAccentColor` (color picker) : coalescence **250 ms**. Le flush
est exposé via l'action `flushPendingSettings` et déclenché sur `beforeunload` +
démontage dans `App.tsx` — la dernière valeur choisie avant la fermeture est toujours
écrite.

Les sliders Visual Profile n'ont pas besoin de debounce : ils sont appliqués par le
bouton « Appliquer » (écriture unique), pas en continu.

### 3. Bloc « Gratuit en permanence » supprimé (spec §35)

Le texte permanent de Visual Profiles a été retiré — critère bloquant §71
(« le bloc "Gratuit en permanence" apparaît encore ») levé.

## Validation

- `tsc` ✅, build ✅, **117/117 tests** (6 nouveaux pour `persistDebounce`).
- **Verify native ✅ + Verify ZAILON ✅** (release 1.50.0).

## Limites / prochaines étapes du bloc

- **Tutoriel première visite** (spec §18-24) : tour guidé skippable, revu depuis
  Paramètres, versionné — à venir.
- **Intégrations API** (spec §25-34) : `ApiProviderMetadata`, bouton ⓘ → lien direct
  officiel, stockage sécurisé des clés — à venir.
- **Cartes Bibliothèque → temps de jeu** (spec §36-43) : `PlaytimeRepository` avec
  checkpoints (jamais le temps du launcher) — à venir.
