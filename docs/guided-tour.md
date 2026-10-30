# Visite guidée — tutoriel de première visite (release 1.51.0)

Spécification : bloc « Fiabilité profils + persistance UI + onboarding + intégrations
API » — priorité 3 (tutoriel de première visite réouvrable), spec §18-24, §54, §67.

## Comportement

- **Premier lancement** : si le tour n'a jamais été terminé ni passé, il s'affiche
  après un court délai (1,2 s) dans une **petite fenêtre flottante** en haut de
  l'écran — **non bloquante** (spec §19 : pas d'énorme modal plein écran,
  l'utilisateur garde accès à l'application derrière).
- **6 étapes** (spec §20) : Bibliothèque → Jeu → Profils → Explorer → Jouer →
  Quick Panel. Chaque étape **navigue automatiquement vers la bonne page** avant de
  se présenter (spec §21).
- **Navigation** : Suivant / Précédent / Passer / Terminer (+ croix = Terminer),
  indicateur d'étape, marquage des étapes complétées.
- **« Passer » est respecté** (spec §54) : `tourSkipped` persisté — le tour ne
  réapparaît jamais tout seul.

## État persisté (`OnboardingState`)

| Champ | Rôle |
| --- | --- |
| `tourCompleted` | tour terminé (Suivant sur la dernière étape ou Terminer) |
| `tourSkipped` | « Passer » cliqué |
| `tourVersion` | version du tour vue par l'utilisateur |
| `tourCompletedSteps` | ids des étapes complétées |
| `hintsSeen` | conseils contextuels déjà vus (spec §24) — prêt pour les futures infos ⓘ |

Tous persistés via le `partialize` du store Zustand.

## Paramètres > À propos

- **Revoir la visite guidée** — relance le tour (`restartTour` + navigation vers
  l'Accueil) (spec §22).
- **Réinitialiser les conseils** — remet tout à zéro avec confirmation
  (`resetTour`).

## Versionnage (spec §23)

`CURRENT_TOUR_VERSION` dans `src/lib/tourSteps.ts` : lors d'une refonte majeure de
l'interface, incrémenter la version et proposer « Découvrir la nouvelle interface » —
**jamais** relancer le tour complet automatiquement.

## Tests (spec §67)

`.github/scripts/test-guided-tour.ts` — 7 tests : 6 étapes exactement, ids uniques,
vues valides, couverture des étapes requises, titres/textes non vides, version
définie, ordre stable (Bibliothèque en 1ᵉʳ, Explorer en 4ᵉ, Quick Panel en dernier).

## Validation

- `tsc` ✅, build ✅, **124/124 tests** (7 nouveaux).
- **Verify native ✅ + Verify ZAILON ✅** (release 1.51.0).

## Limites / prochaines étapes du bloc

- **Intégrations API** (spec §25-34) : `ApiProviderMetadata`, bouton ⓘ → lien
  direct officiel, stockage sécurisé des clés — à venir.
- **Cartes Bibliothèque → temps de jeu** (spec §36-43) : `PlaytimeRepository` avec
  checkpoints (jamais le temps du launcher) — à venir.
- **Conseils contextuels** (spec §24) : le champ `hintsSeen` est en place ; les
  prochaines infos ⓘ réutilisables pourront l'alimenter.
