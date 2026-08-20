# Étiquette add-on sur les jeux (spec « Mise à niveau » §4)

## Objectif

Dans la vitrine de la Bibliothèque, un jeu lié à un add-on affiche une
étiquette claire : « ● Cyberpunk Advanced · installé », « ● Frosty Support ·
disponible »… Le clic ouvre la page Add-ons. **Aucune étiquette si aucun
add-on n'est associé** — et jamais d'association arbitraire.

## Associations (signaux stables, jamais le seul nom)

| Famille de jeu | Signal | Add-on |
| --- | --- | --- |
| Cyberpunk 2077 | nom contient `cyberpunk` | Cyberpunk Advanced |
| FiveM (client) | nom contient `fivem` OU fournisseur `FiveM Client` | FiveM Profiles |
| Neverness to Everness (NTE) | nom contient `neverness` | NTE Support |
| Jeux Frostbite | exécutable du **registre Frosty** (ex. `NFS16.exe`) | Frosty Support |

Les jeux Frostbite passent par `frostyAdapterForExecutable` — le même registre
que le backend Frosty, jamais une liste d'IDs dupliquée.

## Statuts de l'étiquette (spec §4)

- **Installé** (add-on installé ET activé) → pastille émeraude + « · installé ».
- **Disponible** (package réel dans le catalogue officiel, non installé) →
  pastille or + « · disponible ». Un add-on sans package n'est JAMAIS
  « disponible » (même règle que le bouton Installer : `catalogAddonAvailability`).
- **En développement** (aucun package) → pastille grise, pas de mot d'état.

## Implémentation

- `src/lib/gameAddonAssociation.ts` (pur, testé) :
  - `gameAddonAssociations` — associations par signaux ;
  - `gameAddonLabels` — association + statut réel (installé/activé >
    disponible > développement), avec libellé lisible.
- `LibraryCard` (Bibliothèque) : pastille sous le titre, `onClick` →
  `setView('addons')`.

## Tests

`.github/scripts/test-game-addon-association.ts` : associations par famille,
aucune étiquette sans association, hiérarchie des statuts (installé activé >
désactivé > disponible > développement), libellés lisibles, clic → Add-ons.
