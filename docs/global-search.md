# Recherche globale

Spec « Recherche globale ». Une seule requête, en haut de ZAILON (barre de
titre), trouve :

- jeux et applications (nom, nom court, éditeur, fournisseur) ;
- profils (associés à leur jeu) ;
- mods (associés à leur jeu) ;
- groupes de jeux ;
- add-ons installés (nom, id).

## Interaction

- **Ctrl/Cmd+K** ouvre/ferme la recherche, ou clic sur la pastille
  « Rechercher » de la barre de titre.
- **↑ / ↓** naviguent, **Entrée** ouvre, **Échap** ferme.
- Rendu en **portal** (`document.body`) : jamais coupé par un
  `overflow-hidden` ou un stacking context.

## Navigation

| Résultat | Action |
|---|---|
| Jeu / application | `setSelectedGame` + vue Bibliothèque (page jeu) |
| Profil | `setSelectedGame` + `setSelectedProfile` explicite |
| Mod | jeu + onglet Mods |
| Add-on | vue Add-ons |
| Groupe | Bibliothèque + filtre « Groupes » |

Le filtre Bibliothèque (`libraryFilter`) est désormais un état du store
(persisté) : un résultat « groupe » peut ouvrir directement la vue Groupes.

## Logique pure (`src/lib/globalSearch.ts`)

`globalSearch({ query, games, gameGroups, addons }, limit)` — score simple
(préfixe > frontière de mot > sous-chaîne), tri stable, total borné (jamais
des centaines de lignes). Testé dans `test-global-search.ts`.
