# FrostyEditorWorker — cycle de vie et isolation

> Spec §76-83. Le point le plus structurant de l'add-on : **le travail lourd Frosty
> tourne dans un processus séparé** `Zailon.FrostyEditor.Worker`.

## Pourquoi un Worker

| Problème Frosty historique | Solution ZAILON |
| -------------------------- | --------------- |
| Gros assets / mémoire sur l'UI thread | assets lourds dans le Worker (§67) |
| Un plugin qui plante fait tomber l'éditeur | crash du Worker ≠ crash ZAILON (§76-78) |
| La RAM Frosty reste occupée après fermeture | kill du Worker → RAM libérée (§79-80) |
| Plugins tiers instables | sandbox dans le Worker (§82) |

## Cycle de vie

```
arrêté ──ouvrir éditeur──▶ démarrage ──ready──▶ warm
   ▲                                              │
   │                                              │ (45 s, 5 s en Perf, 0 en Max)
   └────────── kill propre (RAM libérée) ◀────────┘
```

Modèle implémenté (`src/lib/frostyEditor.ts`) :

- `workerAfterOpen()` → `starting` ;
- `workerWarmed()` → `warm` (+ `startedAt`) ;
- `workerClosed(worker, mode)` → warm avec `warmUntil` (45 s balanced / 5 s performance
  / 0 max — arrêt immédiat) ;
- `workerTick(now)` → `warm` expiré → `stopped` (RAM libérée) ;
- `workerPluginCrashed(worker, plugin)` → `crashCount++` ; **≥ 2 → plugin désactivé**
  et Worker arrêté (§83) ; sinon redémarrage ;
- `workerReset()` → état propre.

## Comportement utilisateur

- Ouverture de l'éditeur → Worker démarre, indexation en arrière-plan (progression %,
  jamais bloquant, §17) ;
- Fermeture → réchauffé 30-60 s pour réouverture rapide (§81), puis kill ;
- Crash plugin → message « Frosty Editor a redémarré après une erreur. Projet autosave
  restauré. » (§78) ;
- Mode Performance / Max → arrêt immédiat (§81).

## Mémoire

- `FrostyAssetIndexCache` par jeu (clé : gameVersion + profileVersion + frostyVersion,
  §16) — premier scan long, ensuite réutilisé ;
- cache LRU ; fermer un asset libère sa représentation lourde (§68) ;
- diagnostic : `memoryCacheMb` (§74).

## Tests de validation

- `test crash` : fixture de plugin qui plante → Worker redémarre, ZAILON reste ouvert,
  projet récupéré, plugin fautif identifiable (§118) ;
- `test mémoire` : ouvrir 20 textures + 10 meshes + plusieurs EBX, fermer l'éditeur →
  la RAM du Worker est libérée (§120) ;
- simulation de crash disponible dans la vue « Création Frosty » (bouton dédié).
