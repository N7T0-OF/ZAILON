# Bibliothèque — Parallaxe et performance (spec §68)

Suivi de la passe « Library Polish + Parallax + Global Optimization Pass ».

## Livré — release 1.45.0

- « Sans couverture » supprimé (spec §1) → voir `docs/artwork-fallback-system.md`.
- Couverture automatique `FallbackArtwork` (spec §2-3).
- Parallaxe 3D subtil (spec §4-9) : rotation max 4°, scale 1.012,
  `perspective: 900px`, retour 220 ms, `will-change` au survol seulement.
- Mode Animations + toggle Effet 3D (spec §11-12), tactile désactivé (§10).
- Aucun rerender global au mouvement d'une carte (spec §48) : le mouvement est
  appliqué au style du nœud, pas à React.

## À venir (prochaines releases)

- **Virtualisation de la grille** (spec §20) : test 50/100/250/500/1000
  éléments, scroll fluide.
- **Lazy loading + libération hors viewport** (spec §18-19) : intersection
  observer, préchargement de quelques lignes autour du viewport.
- **Variantes d'images** (spec §17) : cover-thumb/medium/original — jamais de
  4K dans la grille.
- **Stores ciblés** (spec §46-47) : un changement d'artwork/favori/session
  n'actualise que la carte concernée, pas toute la Bibliothèque.
- **Suspension pendant le jeu / arrière-plan** (spec §14, §49-50) : pas
  d'animation quand ZAILON est minimisé ou en mode jeu en arrière-plan.
- **Mesures** (spec §65) : FPS/CPU/GPU/RAM avec 20/100/500 cartes, parallaxe
  ON vs OFF, sur machine réelle.

## Critères bloquants (spec §67) — statut

- ❌ résolu : l'option « Sans couverture » n'existe plus ;
- ✅ résolu : le fallback n'est jamais un rectangle vide ;
- ✅ résolu : le parallaxe n'utilise pas de gros zoom (4°, scale 1.012) ;
- ✅ résolu : aucune animation permanente sur 100 cartes (uniquement au survol) ;
- ✅ résolu : aucun `requestAnimationFrame` global sans hover (aucune boucle) ;
- ✅ résolu : « Réduire les animations » est respecté (mode Animations) ;
- ⏳ à venir : covers 4K jamais chargées en masse (variantes §17) ;
- ⏳ à venir : lag au scroll (virtualisation §20) ;
- ✅ résolu : un hover ne force aucun rerender global (§48) ;
- ⏳ à venir : animations coupées quand ZAILON est minimisé (§49).
