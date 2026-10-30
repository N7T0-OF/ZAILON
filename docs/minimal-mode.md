# Mode Minimal (spec §42)

## Objectif

ZAILON doit pouvoir **rester ouvert sans être perceptible** : aucune vidéo,
aucune animation décorative, aucun automatisme réseau non sollicité — tout en
gardant l'essentiel (bibliothèque, profils, lancement, sessions).

## Ce que coupe le mode minimal

| Domaine | Effet |
| --- | --- |
| Fond vidéo / animation | Interdit (`minimalBackgroundAllowed` → `hasBackgroundSource = false` sur l'Accueil) |
| Animations / transitions / parallaxe | Désactivées via `data-minimal-mode` (CSS `animation/transition: none`) |
| Recherche automatique d'illustrations | Coupée (`autoArtwork` ignoré dans le store) |
| Vérification automatique de mises à jour | Coupée (`UpdateProvider` ne démarre pas le check) |

## Architecture

```
src/lib/minimalMode.ts   — décisions pures (resolveMinimalMode,
                           minimalBackgroundAllowed,
                           minimalAutoActivityAllowed, minimalModeDataset)
src/store/useStore.ts    — minimalMode (persisté) + setMinimalMode ;
                           autoArtwork gated par !minimalMode
src/App.tsx              — data-minimal-mode sur <html>
src/index.css            — [data-minimal-mode="true"] * (animation/transition none)
src/components/Views/HomeView.tsx        — fond vidéo coupé
src/components/UpdateProvider.tsx        — check auto coupé
src/components/Views/SettingsView.tsx    — toggle « Mode minimal » (Mode jeu)
```

## Choix de conception

- **Un seul toggle**, pas une liste d'options : le mode minimal est binaire par
  définition (spec §42).
- **Réversible à chaud** : activer/désactiver applique immédiatement l'attribut
  DOM et les garde-fous — aucun redémarrage.
- **Jamais bloquant** : le mode minimal ne touche pas au lancement, aux profils
  ni aux sessions — il retire uniquement le superflu.
