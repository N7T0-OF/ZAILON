# Groupes de jeux — vue Bibliothèque

Spec « Groupes de jeux » §1-4, §8-13. Un groupe est **purement
organisationnel** : il regroupe plusieurs environnements d'une même famille de
jeu (FiveM, Need for Speed, Cyberpunk…) sans jamais fusionner leurs profils,
leurs mods, leurs fichiers ni leurs statistiques.

## Modèle

- `Game.groupId?: string` — le groupe auquel appartient un jeu.
- `GameGroup { id, name, memberGameIds, createdAt, pinned? }` — l'ordre
  d'affichage est celui du tableau `gameGroups` (réordonnable), les groupes
  épinglés (`pinned`) passent en tête.

Les actions store : `createGameGroup`, `renameGameGroup`, `addGameToGroup`,
`removeGameFromGroup`, `deleteGameGroup`, `toggleGameGroupPinned`,
`moveGameGroup`. La suppression d'un groupe ne touche **jamais** aux jeux ni à
leurs fichiers (spec §12).

## Logique pure (`src/lib/gameGroups.ts`)

- `groupMembers`, `groupTotalPlaytime`, `groupProfileCount`, `groupModCount`,
  `groupLastPlayed` — statistiques **agrégées** (sommes), jamais fusionnées
  par profil.
- `reorderArray(items, index, direction)` — décalage d'une case, bornes
  respectées (aucune perte d'ordre).
- `proposeGameGroups`, `normalizeGameGroups` — proposition automatique
  (même exécutable, jamais de regroupement automatique) et normalisation
  idempotente (migration v7).

## UI

- **Filtre « Groupes »** dans la Bibliothèque (à côté de Tous / Jeux /
  Applications / Favoris / Récent) avec son compteur.
- **Grille de cartes** (`GroupLibraryGrid`) : nom, `X jeux · Y profils ·
  Z mods`, temps total, dernière utilisation, membres (max 4 + « +N »),
  épingle, Ouvrir (premier membre), Modifier, Monter/Descendre, Supprimer.
- **`GameGroupDialog`** (créer / éditer) : nom + sélection des membres avec
  recherche. Aucun déplacement de fichiers.

## Sélecteur rapide sur l'Accueil (spec §7, §16)

Quand le jeu sélectionné appartient à un groupe de plusieurs membres, la
flèche de changement de profil de l'Accueil devient un **sélecteur de groupe** :

```text
FiveM — Default → FiveM — Graphics → FiveM — ReShade → … (boucle)
```

- La séquence est celle de `groupProfilePairs(games, group)` : membres dans
  l'ordre du groupe, puis profils de chaque membre (tous les profils de tous
  les jeux membres, jamais fusionnés).
- Changer de jeu membre bascule `selectedGame` puis `selectedProfile` — le
  profil cible est explicite, jamais le « dernier utilisé » du jeu.
- Le bouton affiche `Jeu · Profil` (ex. « FiveM · Graphics ») quand le groupe
  a plusieurs membres.
- Jamais pendant une session active si le backend ne peut pas changer en
  runtime (message honnête, spec §18).

## Règle

Un groupe ne **fusionne** rien. Deux profils « FiveM — Default » et
« FiveM — Graphics » restent deux profils indépendants (mods, ReShade,
touches, Visual Profiles, historique et statistiques séparés) — ZAILON sait
simplement qu'ils appartiennent au même groupe.

## Persistance (spec §15)

Les groupes sont des **objets persistants** : `gameGroups` fait partie du
`partialize` du store (avec les jeux). Au démarrage : charger groupes →
charger jeux → résoudre les IDs (`normalizeGameGroups`) → afficher. Les
références utilisent les **IDs internes des jeux**, jamais les noms.
