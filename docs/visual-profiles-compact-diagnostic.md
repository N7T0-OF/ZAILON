# Visual Profiles — Diagnostic compact (spec §1-4)

## Section Diagnostic refondue

Avant : une liste de paragraphes techniques permanents (limitations
Microsoft, comportement du pilote, restrictions HDR…), mélangés aux états.

Après — grille d'états immédiatement lisibles :

```
Backend          Windows Gamma Ramp
HDR              Désactivé
ICC              Détecté / Aucun
Restauration     Confirmée / Non confirmée ⚠   (détail : Dernière …)
Historique       26 version(s)  ← cliquable
Profil actif     Default

[Tester] [Restaurer]   ⓘ Limitations et fonctionnement
```

## Bulle ⓘ (spec §2)

La documentation technique vit dans une bulle (`InfoBubble` étendue `wide`) :

- fonctionne au **hover** (~180 ms), au **clic**, reste ouverte quand la souris
  reste dessus, se ferme au clic extérieur / Échap ;
- accessible clavier/tactile (bouton focus + Entrée/Espace) ;
- contenu plafonné à ~8 lignes visibles avec défilement interne (pas d'aide
  intégrée existante : « En savoir plus » est remplacé par le défilement —
  écart documenté) ;
- contenu : limitations fixes (API Windows, pilote, HDR, multi-écran, aucune
  injection, ICC lecture seule, DDC/CI) + limitations du backend + diagnostics
  du rapport.

## Données dynamiques restées visibles (spec §3)

- Dernière restauration → cellule « Restauration » (détail « Dernière : … ») ;
- Historique du profil → cellule cliquable « N version(s) » ;
- états Backend / HDR / ICC / Profil actif.

## Fenêtre Historique (spec §4)

Clic sur « N version(s) » → fenêtre listant toutes les versions (date locale
fr-FR) avec trois actions par version :

- **Restaurer** → `restore_visual_profile_version` (existant) ;
- **Comparer** → `read_visual_profile_version` (nouveau, lecture seule) →
  fenêtre comparant les 12 réglages de la version vs le profil actuel,
  différences surlignées (or) ;
- **Supprimer** → `delete_visual_profile_version` (nouveau) → corbeille ZAILON,
  avec confirmation.

## Limite d'historique native (spec §4)

`save_visual_profile` plafonne l'historique à **50 versions** :
`prune_visual_history` déplace les plus anciennes vers la corbeille visuelle.
Plus jamais de milliers de copies accumulées.

## Validation

- `tsc` ✅, build ✅, 93/93 tests, **Verify native ✅ + Verify ZAILON ✅**
  (release 1.46.0 — la CI native compile les 3 commandes et le prune).

## Limites restantes

- Pas d'« aide intégrée » pour « En savoir plus » (bulle défilante à la place).
- Le reste du bloc (profils Performance par jeu, FPS backends, scheduler
  Game Mode, spec §5-43) fera l'objet des prochaines releases.
