# Bibliothèque plein écran (refonte façon vitrine Steam)

Spec : « ZAILON — Refonte Apparence + Bibliothèque + correctif Cyberpunk » §27-57.

## Avant / Après

**Avant** : une colonne latérale permanente à gauche (liste des jeux, 3 modes,
filtres limités). La page du jeu était à droite, la liste occupait ~288 px en
permanence.

**Après** : la Bibliothèque est une **vitrine plein écran**. La colonne latérale
est supprimée. Cliquer une carte ouvre la **page du jeu** avec hero + onglets.

```
BIBLIOTHÈQUE
[ 🔎 Rechercher un jeu ou une application ]   [Détecter] [Ajouter un jeu]

Tous(12) · Jeux(10) · Applications(2) · Favoris(3) · Installés récemment(4)     [Sans couverture] [Petit|Normal|Grand]

┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│ cover  │ │ cover  │ │ cover  │ │ cover  │
│ CP2077 │ │  NTE   │ │ FiveM  │ │Blender │
└────────┘ └────────┘ └────────┘ └────────┘
```

## Ce qui est livré (1.32.0)

- **Vitrine plein écran** (`LibraryShowcase`) : recherche locale instantanée
  (jamais de réseau), filtres Tous / Jeux / Applications / Favoris / Installés
  récemment avec compteurs, densité Petit (106 px) / Normal (148 px) / Grand
  (196 px), « Sans couverture ».
- **Cartes** : couverture (fallback lettre), icône Jeu/Application, nom, nombre
  de mods actifs, **étoile de favori** (bascule directe), badge **« ● En
  cours »** (session active) et **« ★ Prioritaire »** (session prioritaire,
  `pickPrioritySession` : épinglée → premier plan → Running la plus récente).
- **Menu contextuel** (clic droit) : ajouter/retirer des favoris, ouvrir,
  « Changer l’apparence… » (désactivé — livré avec le moteur d’illustrations
  unifié, chantier Apparence).
- **Page du jeu** : hero background (hero → bannière → fond → couverture,
  dégradé léger, image non masquée), **« ← Bibliothèque »** qui revient à la
  grille en conservant recherche + filtre + scroll, infos principales (profil
  actif, mods actifs, profil(s), bouton **Jouer** avec la machine d’états
  complète).
- **Raccourci Ctrl+L** : focus sur la recherche de la Bibliothèque (Ctrl+K
  reste la palette globale).

## Navigation

- `Sidebar` → Bibliothèque : ouvre la vitrine (`gamesBrowsing = true`).
- Accueil → « Toute la bibliothèque » / « Ouvrir la Bibliothèque » : vitrine.
- Palette Ctrl+K → un jeu : page du jeu directe.
- Carte de la vitrine → page du jeu ; « ← Bibliothèque » → vitrine.

## Statut des sessions

Le badge « En cours » vient de `gameSessions` (état non terminal). Le badge
« Prioritaire » vient de `pickPrioritySession(sessions, pinnedPriorityGameId,
foregroundGameId)` — une seule session prioritaire à la fois, même avec
plusieurs jeux ouverts (Cyberpunk + Photoshop → les deux cartes « En cours »,
une seule « Prioritaire »).

## Limites honnêtes

- « Changer l’apparence » est désactivé en attendant le moteur d’illustrations
  multi-providers (chantier Apparence).
- Pas encore de virtualisation à 100+ apps : la grille reste CSS. Les images
  utilisent les thumbnails/chemins locaux du cache ZAILON (pas d’URL distante).
