# Gestion du cache des fonds vidéo (spec « Gestion du cache »)

## Objectif

Les fonds vidéo de l'Accueil téléchargés depuis YouTube (via yt-dlp) sont mis
en cache dans `ZAILON_DATA/media/backgrounds/` pour une lecture locale
hors-ligne. Cette feature donne à l'utilisateur le contrôle complet : voir ce
qui est en cache, la taille occupée, supprimer une vidéo précise ou tout
vider — sans jamais toucher aux fichiers des profils, rollbacks ou Collections.

## Architecture

```
┌─ Rust ───────────────────────────────────────────────────┐
│ list_cached_background_media() → Vec<CachedBackgroundMediaEntry>
│   inventaire RÉEL de `video_<id>.mp4` (le disque est la    │
│   source de vérité — jamais un manifeste deviné).          │
│ remove_cached_background_media(videoId) → bool             │
│   supprime vidéo + vignette (id sanitisé avant tout accès).│
│ clear_cached_background_media() → u32 (fichiers supprimés) │
└───────────────────────────────────────────────────────────┘
        │ (commandes Tauri, native.ts)
        ▼
┌─ Lib pure (backgroundMediaCache.ts) ──────────────────────┐
│ mediaCacheManifestFromNative(entries) → manifest trié      │
│ totalCacheBytes / evictLru / upsert / remove (déjà testés) │
└───────────────────────────────────────────────────────────┘
        │
        ▼
┌─ Store (useStore.ts) ─────────────────────────────────────┐
│ backgroundMediaCache : BackgroundMediaCacheManifest         │
│   (état, JAMAIS persisté — dérivé du disque)                │
│ loadBackgroundMediaCache()  → inventaire natif             │
│ removeBackgroundMedia(id)   → natif + maj locale           │
│ clearBackgroundMedia()      → natif + reset                │
└───────────────────────────────────────────────────────────┘
        │
        ▼
┌─ UI (SettingsView → Stockage) ────────────────────────────┐
│ Stat « Fonds vidéo en cache » (compte + taille)             │
│ bouton « Vider le cache des fonds vidéo »                   │
│ liste : videoId, taille, date, bouton Supprimer par entrée  │
└───────────────────────────────────────────────────────────┘
```

## Points de fiabilité

- **Le disque est la source de vérité** : `list_cached_background_media` lit le
  dossier réel ; aucun manifeste persisté ne peut « croire » qu'une vidéo
  existe si le fichier a été supprimé (ou inversement).
- **Identifiant sanitisé** avant tout accès disque
  (`sanitize_background_video_id`) — jamais de chemin injecté depuis un nom de
  fichier.
- **Nommage réel** : la vignette produite par yt-dlp est `video_<id>.jpg`
  (webp/png en repli) — l'inventaire et la suppression gèrent les trois
  extensions.
- **Suppression ciblée** : vidéo + vignette, jamais autre chose ; l'UI confirme
  avant de tout vider.
- **Rien n'est chargé au boot** : l'inventaire n'est lu qu'à l'ouverture de la
  section Stockage.

## Fichiers

- `src-tauri/src/lib.rs` — 3 commandes + sanitisation (Rust).
- `src/lib/native.ts` — `listCachedBackgroundMedia` /
  `removeCachedBackgroundMedia` / `clearCachedBackgroundMedia`.
- `src/lib/backgroundMediaCache.ts` — `mediaCacheManifestFromNative` (pur).
- `src/store/useStore.ts` — état + 3 actions.
- `src/components/Views/SettingsView.tsx` — section Stockage enrichie.
- `.github/scripts/test-background-media-cache.ts` — test du mapping natif →
  manifeste.
