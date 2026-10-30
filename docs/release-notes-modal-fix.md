# Correctif de la fenêtre « Nouveautés de la mise à jour »

> Spec : « ZAILON — Correctif urgent de la fenêtre Nouveautés de la mise à jour ».
> Livré dans la **1.20.1**. Version suivante : 1.21.0.

## 1. Cause du bug

L'ancienne modale (`UpdateProvider.tsx`) était un simple conteneur `max-w-md`
**sans hauteur maximale ni défilement** :

```tsx
<div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 p-4">
  <div className="max-w-md w-full max-h-[90vh] overflow-y-auto ...">
```

Le `overflow-y-auto` était appliqué sur **toute la fenêtre** (avec `max-h-[90vh]`
mais sans structure `flex-col`), et le bouton « Continuer / Fermer » vivait
**dans le flux du contenu** : avec une Release Note très longue, il se retrouvait
après tout le texte, obligeant l'utilisateur à atteindre le bas — et sur des
écrans/tailles de fenêtre réduits, le bas était parfois hors d'atteinte.

## 2. Ancien layout

```
┌──────────────────────────────┐
│ ✨ Nouveautés 1.20.0         │
│ (header scrollable, part du  │
│  flux)                       │
│                              │
│ 200 lignes de changelog…     │
│                              │
│ [Continuer]   ← dans le flux │
└──────────────────────────────┘
```

## 3. Nouveau layout (3 zones)

`ScrollableModal.tsx` — composant réutilisable :

```
┌──────────────────────────────┐
│ Header fixe                  │  ← sticky (hors scroll)
│ ✨ NOUVEAUTÉS · ZAILON 1.20.1│      + croix ×
├──────────────────────────────┤
│ Contenu déroulant            │  ← flex:1, min-h-0, overflow-y-auto
│  ✨ Nouveautés               │
│  🔧 Améliorations            │
│  🐛 Corrections              │
├──────────────────────────────┤
│ Footer fixe                  │  ← sticky (hors scroll)
│  [Ne plus afficher ☐]        │
│  [Voir tous les changements] │  [Fermer] (principal)
└──────────────────────────────┘
```

Clés CSS (tailwind) :

```tsx
<section className="flex max-h-[min(760px,calc(100vh-64px))] w-[min(720px,calc(100vw-48px))] flex-col overflow-hidden ...">
  <header className="flex-none ..." />          // header fixe
  <div className="min-h-0 flex-1 overflow-y-auto thin-scroll">  // seul bloc scrollable
  <footer className="flex-none ..." />          // footer fixe
```

- La modale **ne dépasse jamais** la fenêtre ZAILON : `max-h-[min(760px,calc(100vh-64px))]`,
  `w-[min(720px,calc(100vw-48px))]`, plus `max-h-[calc(100%-32px)]` de repli pour
  les très petites fenêtres.
- Le header et le footer restent **toujours visibles** ; seul le centre défile.
- **Fermer** est le bouton principal du footer (jamais dans le flux du texte).

## 4. Comportement responsive

La modale est dimensionnée en `vw`/`vh` : si l'utilisateur redimensionne ZAILON
pendant qu'elle est ouverte, elle se réadapte immédiatement (pas de hauteur fixe
dépendant de la longueur du changelog). Testé à : 1920×1080, 1366×768, 1280×720,
petite fenêtre (~600×500).

## 5. Fermeture alternative

- `×` dans le header ;
- `Échap` (avec garde : la fermeture est toujours possible, aucun état bloquant) ;
- clic sur le backdrop (aucune opération critique en cours pour une modale de
  nouveautés) ;
- **failsafe** : si le rendu du contenu échoue, un message
  « Impossible d'afficher les notes de cette version » avec `[Fermer]` et
  `[Voir sur GitHub]` remplace le contenu — jamais de modale impossible à quitter.

## 6. Navigation clavier

Focus initial sur le footer (bouton **Fermer**) ; `Tab` parcourt
`×` → liens → `Voir tous les changements` → `Fermer`. `Page Down`/`Page Up`/
`Home`/`End`/flèches et molette fonctionnent dans le contenu. Le scroll de la
page Bibliothèque derrière est verrouillé pendant l'ouverture (`overflow:hidden`
sur le body) et restauré à la fermeture.

## 7. Markdown sécurisé

Nouveau mini-renderer sans dépendance (`src/lib/safeMarkdown.ts` + composant
`SafeMarkdown.tsx`) — **9 tests unitaires** :

- tout HTML brut est **échappé** (jamais de script / iframe / HTML arbitraire) ;
- les liens ne sont rendus que pour `http(s)://` (jamais `javascript:`) ;
- les images sont bornées par CSS (`max-width: 100%; height: auto`) et ne
  changent jamais la taille de la modale ;
- support : titres, listes, gras, code inline, blocs de code, liens, images,
  séparateurs, paragraphes.

## 8. Résumé vs notes complètes

- `ReleaseSummary` : ~8 premiers changements (le parser **tronque au niveau des
  items de liste**, jamais en plein milieu d'un mot).
- `[Voir tous les changements]` dans le footer → affiche la section complète
  dans la même modale (conserve la position de lecture, bouton redevient
  « Résumé »).
- Petites mises à jour (patch) : **toast** « ZAILON 1.20.1 installé — N corrections »
  + lien « Voir les changements », pas de grosse modale. Majeur/mineur : modale.

## 9. Affichage unique + option

- `lastSeenReleaseNotesVersion` enregistré **uniquement à la fermeture** (un
  crash pendant l'affichage → réaffichage au démarrage suivant, jamais de boucle).
- Case « Ne plus afficher automatiquement » (`showReleaseNotesOnUpdate`) — cochée
  par défaut, modifiable dans Réglages > À propos.
- Les notes restent toujours accessibles dans Réglages > À propos > Historique
  des versions.
- La modale ne s'ouvre qu'**après** que l'UI est stable (shell affiché, paramètres
  chargés) — jamais pendant le chargement initial, aucun appel GitHub bloquant
  (les notes viennent du CHANGELOG embarqué).

## 10. Test de stress

Fausse Release Note générée : 100 nouveautés + 100 corrections + 100
optimisations + 50 problèmes connus + blocs de code + liens + image très large,
en 1280×720 → la modale reste parfaitement utilisable, **Fermer visible sans
descendre**.

## 11. Autres modales corrigées

Voir `docs/modal-overflow-audit.md` — audit de toutes les micro-fenêtres de
ZAILON. L'ancien code de `UpdateProvider` a été remplacé par `ScrollableModal`.

## 12. Fichiers

| Fichier | Rôle |
|---|---|
| `src/components/UI/ScrollableModal.tsx` | Modale réutilisable 3 zones (header/body/footer fixes) |
| `src/lib/safeMarkdown.ts` | Parser Markdown sûr (logique pure, testable) |
| `src/components/UI/SafeMarkdown.tsx` | Rendu React des blocs |
| `src/components/UpdateProvider.tsx` | Refonte : résumé/Voir tout, Ne plus afficher, failsafe, toast patch |
| `.github/scripts/test-safe-markdown.ts` | 9 tests du parser |
