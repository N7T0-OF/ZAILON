# Correctif du bouton Jouer coupé

Spec : « ZAILON — Refonte Apparence + Bibliothèque + correctif Cyberpunk » §42-45.

## Problème

Le bouton Jouer de l’Accueil était tronqué : le rectangle arrondi s’arrêtait
après le « r » de « Jouer ». Le libellé change selon l’état (Jouer → Lancement…
→ Recherche du jeu… → En cours → Autorisation requise…) et la largeur devait
rester stable entre ces états, y compris en FR/EN/DE/PT/ES (textes plus longs).

## Correctif (classe du bouton)

```tsx
flex shrink-0 items-center justify-center gap-2 whitespace-nowrap
rounded-full px-5 py-2.5 font-display text-[11px] font-bold uppercase
tracking-[0.11em] transition-all min-w-[168px]
```

- `min-width` stable (168 px Accueil, 140 px hero Bibliothèque) : la largeur ne
  dépend plus du texte courant ;
- `padding-inline` symétrique (`px-5` au lieu de `pl-5`) ;
- `white-space: nowrap` : aucun retour à la ligne ;
- `flex-shrink: 0` : le bouton ne rétrécit jamais ;
- `justify-center` : le contenu reste centré quand la largeur dépasse le texte.

Le même correctif est appliqué au **bouton Jouer du hero de la page du jeu**
(ajouté dans la refonte Bibliothèque).

## Pourquoi pas de largeur fixe codée en dur ?

Le libellé le plus long (« Autorisation requise… » / « Recherche du jeu… »)
dépasse 140 px en uppercase + tracking : `min-width` garantit la stabilité
sans casser la localisation (un texte plus long que la largeur minimum
s’étend naturellement grâce à `width: auto`).
