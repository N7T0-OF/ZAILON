# Renommage d'un jeu (cosmétique, jamais technique)

## Principe

Le nom **affiché** d'un jeu est découplé de son **identité technique**.

```text
gameId       = cyberpunk2077           (identité — jamais modifiée)
displayName  = Cyberpunk 2077 — Modded (choix utilisateur, cosmétique)
name         = Cyberpunk 2077          (nom détecté Steam/Epic/ZAILON)
executable   = Cyberpunk2077.exe       (détection)
```

Renommer un jeu ne casse donc **jamais** :

- la détection (exécutable + chemin + provider/AppID) ;
- les mods, profils et installations ;
- les add-ons et leurs associations ;
- les statistiques et le temps de jeu ;
- les raccourcis et associations Steam/Epic ;
- le lancement.

## Résolution

`src/lib/gameIdentity.ts` expose :

- `resolveGameName(game)` → `displayName || name` (nom complet) ;
- `resolveGameTitle(game)` → `displayName || shortName || name` (gros titres) ;
- `normalizeDisplayName(value)` → trim + espaces réduits (vide = reset) ;
- `isRenamed(game)` → vrai si un nom personnalisé diffère du nom détecté.

## Actions

- **Renommer** : bouton crayon dans l'en-tête du jeu + menu contextuel de la
  Bibliothèque → `renameGame(gameId, name)` (store, persisté). Un nom vide
  réinitialise au nom détecté.
- **Réinitialiser le nom** : proposé dans le menu contextuel quand `isRenamed`.

## Règle

`displayName` est **purement cosmétique** : jamais utilisé pour construire une
clé, un chemin, un filtre technique ou une association. Les fonctions de
détection (`resolveGameIdentity`, `sameGameIdentity`) n'en tiennent pas compte.
