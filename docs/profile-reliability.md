# Fiabilité des profils — correctif du bug « 0 mods » (release 1.49.0)

Spécification : bloc « Fiabilité profils + persistance UI + onboarding + intégrations
API » — priorités 1 (bug 0 mods), spec §1-11 et §56-60.

## Le problème

Un profil pouvait afficher `0 mods actifs` alors que :

- les paquets staged existent physiquement ;
- les mods fonctionnent dans le jeu ;
- le déploiement contient les mods.

Cause racine : le catalogue installé (`game.installedMods`) est persisté par le store
Zustand. Au démarrage, **aucun re-scan n'était déclenché** : un `installedMods` vide
sauvegardé (scan jamais fait, scan échoué, ou écriture partielle) était traité comme
la vérité jusqu'au clic « Analyser » — le résolveur `resolveProfileMods` (union
catalogue + références du profil) ne pouvait alors reconstruire que des enregistrements
minimaux sans fichiers.

## Ce qui a été fait

### 1. Réconciliation du catalogue au démarrage (spec §9-10)

Nouvelle action store `refreshStagedCatalogs()`, appelée une fois au boot depuis
`App.tsx` : pour chaque jeu, `native.listStagedMods(gameId)` (lecture des
`manifest.json` des paquets staged uniquement — léger) + fusion dans `installedMods`
via `scannedMods` (les métadonnées précédentes sont conservées par chemin/nom).

Conséquence : un cache vide persisté ne peut plus faire disparaître les mods — le
catalogue se repeuple au lancement, le compteur revient, sans action de l'utilisateur.

### 2. Invariant anti-« clear silencieux » (spec §8)

Le point de passage unique de toutes les écritures de profils
(`persistProfileTransaction`) rejette désormais AVANT toute écriture toute
transaction qui ferait passer un profil de > 0 à 0 actifs **sans être explicite** :

```
Une modification anormale du profil a été détectée et annulée.
```

Opérations explicites autorisées (flag passé par l'appelant) :

- `bulkSetEnabled(false)` couvrant TOUS les actifs (« Désactiver » sur la sélection
  complète) → `explicitDisableAll` ;
- retrait/suppression de tous les mods (bulk delete, suppression définitive) →
  `allowEmpty` ;
- transfert « move » de tous les mods de la source → `allowEmpty` ;
- annulation d'une opération groupée (restauration explicite de l'état antérieur) →
  `allowEmpty`.

La réparation `repairProfileStorage` ne passe aucun flag : si elle produisait un clear
silencieux, elle serait bloquée (c'est le comportement voulu).

### 3. Restauration automatique + rapport (spec §5-6, §57)

`repairReport()` compare les références des profils (`modStates`) aux ids du catalogue
résolu : si des références manquent, le re-scan les a restaurées → toast
« Profil restauré automatiquement — références réconciliées avec le store staged. »

### 4. Compteur canonique (spec §2, §10)

`enabledCountFromState()` calcule le nombre d'actifs **uniquement depuis les
`modStates`** du profil (équivalent `enabledPackageIds`) — jamais depuis une liste
rendue ou un cache. C'est ce compteur qui pilote le garde anti-clear.

## Nouveau module

`src/lib/profileConsistency.ts` — logique pure, 12 tests :

- `enabledCountFromState` / `referenceCountFromState` ;
- `isSilentClear(before, after, opts)` ;
- `needsStagedRefresh(game)` (spec §9) ;
- `repairReport(game)` (spec §57).

## Validation

- `tsc` ✅, build ✅, **111/111 tests** (12 nouveaux).
- **Verify native ✅ + Verify ZAILON ✅** (release 1.49.0).
- Les écritures natives étaient déjà transactionnelles/atomiques
  (`apply_profile_transaction` : `write_json_atomic`, rollback, historique par
  opération) — inchangées, l'invariant s'ajoute au-dessus côté store.

## Limites / prochaines étapes du bloc

- **Persistance UI** (spec §12-17) : Explorer (mode, colonnes, tri, filtres) et tous
  les réglages comportementaux sauvegardés avec debounce — à venir.
- **Tutoriel première visite** (spec §18-24) : tour guidé skippable, revu depuis
  Paramètres, versionné.
- **Intégrations API** (spec §25-34) : `ApiProviderMetadata`, bouton ⓘ → lien direct,
  stockage sécurisé des clés (Credential Manager / Keychain / Secret Service),
  masquage des secrets, test de clé.
- **Nettoyage** (spec §35-43) : suppression du bloc « Gratuit en permanence »,
  cartes Bibliothèque → temps de jeu au lieu du compteur mods, `PlaytimeRepository`
  (checkpoints 5 min, jamais le temps du launcher).
