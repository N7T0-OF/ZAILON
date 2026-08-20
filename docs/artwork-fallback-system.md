# Système de couverture automatique (spec §1-3, §68)

## « Sans couverture » supprimé

Le filtre et la case à cocher « Sans couverture » de la Bibliothèque sont
supprimés (spec §1) : plus aucun jeu ne peut apparaître volontairement comme
une case vide. La logique de filtrage associée (`onlyWithoutCover`) a été
retirée de `GamesView`.

## FallbackArtwork (spec §2-3)

Quand aucune image n'est disponible (couverture personnalisée, artwork
récupéré, icône, logo), `src/components/UI/FallbackArtwork.tsx` génère une
carte propre :

- **teinte déterministe** dérivée du nom du jeu (FNV-1a → teinte HSL stable :
  le même jeu garde toujours la même couleur, chaque jeu a sa teinte) ;
- **dégradé léger** (165°, du clair au sombre) + reflet radial discret ;
- **icône centrée** (jeu → manette, application → écran) dans une pastille
  translucide ;
- **titre** propre en bas.

C'est un composant pur et déterministe (même entrée → même carte) : le
« FallbackArtworkGenerator » de la spec n'a donc aucun état, aucun fichier à
écrire, aucun cache à invalider — le coût par carte est nul (pas de décodage
d'image). Écart documenté par rapport à la spec : pas de `fallback-cover.webp`
sur disque, le rendu CSS équivalent est plus léger et toujours à jour.

Appliqué à : **Bibliothèque** (grille) et **Accueil** (cartes rapides
Continuer/Favoris, qui utilisaient un rectangle gris).

## Parallaxe 3D subtil (spec §4-9, §48, §58-59)

`src/components/UI/ParallaxCover.tsx` enveloppe la couverture :

- la souris **incline** la carte : `rotateX`/`rotateY` max **4°**, scale max
  **1.012** — ce n'est pas un zoom, la taille reste quasi identique (§5) ;
- `perspective: 900px` sur le conteneur, `transform-style: preserve-3d` sur la
  couche inclinée (§6) ;
- le mouvement est appliqué **directement au style** du nœud (ref) — aucun
  `setState` par déplacement, aucun rerender de la grille (§8, §48) ;
- `will-change: transform` uniquement **pendant le survol** (§59) ;
- retour au repos en **220 ms** à la sortie (§9) ;
- seules les cartes **survolées** calculent l'effet, aucune boucle globale (§13) ;
- la transformation s'applique à la couche visuelle seulement : badges,
  overlay « Ouvrir » et bouton restent dans des couches non transformées —
  zones de clic intactes (§25).

## Contraintes respectées (spec §10-13, §11-12)

- **tactile** : désactivé (`matchMedia('(hover: none), (pointer: coarse)')`) ;
- **Réduire les animations** : respecté via le mode Animations
  (Automatique/Activées/Réduites, défaut Automatique = suit le système) ;
- **désactivable** : « Effet 3D des couvertures » dans Paramètres > Apparence.

## Validation

- `tsc` ✅, build ✅, **93/93 tests** (3 nouveaux pour `motion.ts` :
  résolution du mode, activation du parallaxe, normalisation de l'inclinaison
  bornée).
- **Verify ZAILON ✅** (release 1.45.0).

## Limites restantes

- Mesure FPS/CPU/GPU sur machine réelle avec 20/100/500 cartes (spec §65) —
  à faire en conditions réelles.
- Le préchargement au survol prolongé (spec §51) et la virtualisation
  (spec §20) arrivent dans les prochaines releases.
