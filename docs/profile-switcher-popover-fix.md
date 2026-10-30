# ProfileSwitcher — correctif du popover coupé

Statut : **implémenté et validé** (release 1.37.0)

## Cause

Le sélecteur de profil de la page du jeu (hero Bibliothèque) était rendu **dans le
`<header class="relative overflow-hidden">`** du hero. Tout popover `absolute` rendu dans
ce conteneur est rogné par :

- `overflow: hidden` (le header, pour le fond du hero) ;
- le stacking context créé par le header relatif ;
- les transform/backdrop du hero.

Résultat : avec beaucoup de profils, une petite fenêtre, ou selon la position de la zone
« Profil actif », le menu était coupé ou invisible.

## Ancienne implémentation

```
header.overflow-hidden
└─ div.relative
   └─ button (déclencheur)
   └─ div.absolute.left-0.top-full.z-40   ← rogné par overflow:hidden du header
      └─ liste de profils + création + gestion
```

## Nouvelle implémentation

```
document.body (portal, createPortal)
└─ backdrop fixed (zIndex popover-1)      → clic pour fermer
└─ div.fixed (zIndex popover)             → position calculée, jamais coupé
   ├─ en-tête « Profils » (+ badge « Jeu en cours »)
   ├─ recherche de profil (dès 8 profils)
   ├─ liste (max ~6 visibles, scroll interne)
   └─ pied : nouveau profil + « Gérer les profils… »
```

- **Portal** : le menu est rendu dans `document.body`, hors de tout conteneur de page —
  aucun `overflow-hidden`, `transform`, `clip-path` ou z-index local ne peut le couper.
- **Positionnement** : rect du bouton déclencheur mesuré (`getBoundingClientRect`) ;
  ouverture **vers le haut** si l'espace sous le bouton est insuffisant, **vers le bas**
  sinon ; `max-height` recalculé selon la direction ; clamped à la fenêtre (8 px de marge).
- **Repositionnement** : re-mesure au scroll (capture, y compris scroll interne de
  l'app) et au resize ; fermeture par Échap ou clic sur le backdrop.
- **Échelle de z-index centralisée** (`src/lib/zIndex.ts`) : `popover = 1000`,
  `modal = 2000`, `toast = 3000` — plus aucune valeur arbitraire pour les nouvelles
  couches.

## Comportement jeu en cours

- Le profil actif reste sélectionnable et affiche « Actif ».
- Les autres profils sont désactivés avec « Disponible après fermeture du jeu » :
  pas de changement de mods à chaud (spec §32).

## Fichiers

- `src/lib/zIndex.ts` — nouvelle échelle centralisée.
- `src/components/UI/ProfileSwitcherPopover.tsx` — nouveau composant portal.
- `src/components/Views/GamesView.tsx` — hero réécrit pour utiliser le composant ;
  le trigger porte le `ref` d'ancrage, l'ancien popover inline est supprimé.

## Validation

- `tsc` ✅, build ✅, 72/72 tests ✅.
- Verify native ✅ + Verify ZAILON ✅ (CI).

## Limites / tests restants sur machine réelle (spec §54)

- 1 profil / 5 profils / 20 profils (recherche active au-delà de 8) ;
- petite fenêtre → ouverture vers le haut ;
- plein écran / hero avec overflow / scroll → repositionnement ;
- jeu en cours → profils non actifs désactivés.
