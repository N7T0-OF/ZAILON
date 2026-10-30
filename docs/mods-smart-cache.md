# Cache mods intelligent (spec §37-38)

## Objectif

Le re-scan complet d'un dossier Mods (lecture de chaque mod : fichiers,
manifestes, hash, tailles) est coûteux et inutile quand **rien n'a changé**.
ZAILON calcule une **empreinte LÉGÈRE** du dossier (métadonnées uniquement :
noms des entrées, tailles, mtimes, nombre d'entrées — jamais le contenu des
fichiers) et ne re-scanne **que** si elle a changé.

Résultat : ouvrir un jeu est instantané et reste frais — « le launcher vérifie
seulement : fichier modifié ? … Sinon : réutiliser le cache » (spec §37).

## Architecture

```
┌─ Rust ─────────────────────────────────────────────────┐
│ mods_folder_fingerprint(mods_path) → string            │
│   empreinte métadonnées (DefaultHasher, 1 métadonnée   │
│   par entrée) — jamais de lecture de contenu           │
└────────────────────────────────────────────────────────┘
        │ (commande Tauri, native.ts)
        ▼
┌─ Store ────────────────────────────────────────────────┐
│ folderModsCache   Map<gameId, {fingerprint, folderMods}>│  ← mémoire (session)
│ modsFingerprints  Record<gameId, fingerprint>           │  ← persisté (entre sessions)
│                                                         │
│ scanMods(gameId, {force?})                              │
│   fingerprint = mods_folder_fingerprint(path)           │
│   si fingerprint == cache mémoire → reuse folderMods    │
│   sinon → native.scanMods + maj cache                  │
│   stagedMods TOUJOURS relus (listStagedMods)            │
│                                                         │
│ refreshModsIfChanged(gameId)  → appelé à l'ouverture    │
│   décision PURE via modsScanDecision()                  │
└────────────────────────────────────────────────────────┘
```

### Décision pure — `src/lib/modsCache.ts`

`modsScanDecision({ fingerprint, memoryFingerprint, persistedFingerprint,
modsPathConfigured })` → `'reuse' | 'rescan'` :

| Situation | Décision |
| --- | --- |
| Pas de dossier Mods configuré | `reuse` (rien à scanner) |
| Dossier configuré mais absent | `rescan` (résultat vide + staged relus) |
| Empreinte = mémoire (même session) | `reuse` |
| Empreinte = persisté (session précédente) | `reuse` |
| Empreinte changée / inconnue | `rescan` |

### Détails de fiabilité

- **Les paquets staged sont toujours relus** (`listStagedMods`) : ZAILON les
  modifie lui-même (import, toggle, purge) — le cache ne couvre que le dossier
  Mods, jamais l'état du store staged.
- **Les opérations ZAILON invalident le cache** : un toggle renomme
  `DISABLED_*` (le nom change → empreinte différente), un import copie des
  fichiers (mtime/entrées changent), une suppression enlève des entrées.
  `scanMods` est rappelé après chaque opération et voit l'empreinte changée.
- **Entre deux sessions** : `modsFingerprints` (persisté, ~40 octets par jeu)
  permet à `refreshModsIfChanged` de sauter le re-scan quand le dossier n'a
  pas bougé — l'affichage venu de `games[].installedMods` (déjà persisté) est
  exact. Jamais les mods eux-mêmes en localStorage.

## Fichiers

- `src-tauri/src/lib.rs` — `mods_folder_fingerprint` + test Rust
  (`mods_folder_fingerprint_changes_on_rename_add_and_missing`).
- `src/lib/native.ts` — binding `modsFolderFingerprint`.
- `src/lib/modsCache.ts` — `modsScanDecision` (pure, 5 tests).
- `src/store/useStore.ts` — cache mémoire, `modsFingerprints` (persisté),
  `scanMods` fast path, `refreshModsIfChanged`, déclenchement à l'ouverture
  d'un jeu (`setSelectedGame`).
