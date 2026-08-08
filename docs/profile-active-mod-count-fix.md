# Compteur de mods fiable — source de vérité unique du profil

> Spec : « Correctif critique Cyberpunk RED4ext + vrai statut runtime » §13-19.
> Livré dans la **1.22.0**.

## 1. Problème

`0 mods actifs` affiché alors que les mods fonctionnent dans le jeu = l'UI et le
déploiement ne lisent plus la même source.

## 2. Analyse

Tous les compteurs (Accueil, Bibliothèque, Quick Panel, Diagnostic) passaient
déjà par `resolveProfileMods(game, profile)` — mais cette fonction pouvait
retourner une liste vide ou tronquée :

1. **Catalogue unique** : `catalog = installedMods?.length ? installedMods : profile.mods`
   — une liste installée **stale/incomplète** (scan remplacé, ids ré-importés)
   éclipsait silencieusement les références du profil ;
2. **Intersection modStates** : seuls les mods présents dans `profile.modStates`
   sont gardés — si les ids du catalogue ne correspondent plus (ré-import,
   migration), l'intersection est vide → **0 mods actifs** alors que le
   déploiement (qui référence les fichiers stage) existe toujours.

## 3. Correctif — ProfileStateRepository (`src/lib/profileState.ts`)

Fonctions pures, testables, utilisées par `resolveProfileMods` (donc par tous
les écrans) :

- **`mergeModCatalogs(installed, profileMods)`** — union par id : le catalogue
  installé gagne sur les champs, mais les références du profil absentes de la
  liste installée sont **conservées** (plus jamais de liste tronquée) ;
- **`reconcileModStates(catalog, states)`** — toute clé de `modStates` absente
  du catalogue reçoit un **enregistrement minimal** : le profil n'affiche
  jamais 0 par erreur, la liste réapparaît (migration de réparation) ;
- **`countActiveMods(mods)`** — le compteur canonique (jamais la longueur d'une
  liste rendue, jamais un cache périmé).

Chaîne unique imposée :

```
ProfileStateRepository (mergeModCatalogs + reconcileModStates)
        ↓
resolveProfileMods → decoré (conflits, priorité)
        ↓
Accueil · Bibliothèque · Quick Panel · Diagnostic   (même fonction)
```

## 4. Tests

`test-framework-validator.ts` (8 tests) inclut :

- `mergeModCatalogs` : union par id, le catalogue installé gagne ;
- `reconcileModStates` : les clés sans catalogue sont conservées (jamais 0).

## 5. Limites restantes

- La **migration complète des profils cassés** (reconstruction de
  `enabledPackageIds` depuis les fichiers stage réels, priorités préservées)
  nécessite un accès au backend de déploiement natif — les garde-fous actuels
  évitent déjà le pire cas (84 → 0).
- Le « régression detector » de migration (invariant `before.packageRefs <=
  after.packageRefs + explicitlyRemoved`) est prévu pour le prochain lot.
