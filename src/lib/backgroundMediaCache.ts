/**
 * Cache local des vidéos de fond (spec « Fix vidéo YouTube de l'Accueil »).
 *
 * Le lien YouTube ne devient JAMAIS le lecteur du launcher : une fois résolue,
 * la vidéo est téléchargée dans `ZAILON_DATA/media/backgrounds/` puis lue
 * localement (hors-ligne, sans re-téléchargement à chaque lancement).
 *
 * Cette lib est PURE (manifeste, clés, éviction LRU, validation, taille) —
 * les chemins réels et le téléchargement vivent côté natif. Testable sous
 * node --test.
 */

export const MEDIA_CACHE_DIR = 'media/backgrounds'
export const MEDIA_CACHE_SCHEMA_VERSION = 1

export interface CachedBackgroundVideo {
  /** VideoId YouTube (11 caractères) — clé de cache stable. */
  videoId: string
  /** Nom du fichier vidéo dans le dossier de cache (ex. `video_abc123.mp4`). */
  videoFile: string
  /** Nom de la vignette associée, si présente. */
  thumbnailFile?: string
  sizeBytes: number
  cachedAt: number
  /** URL source (provenance, jamais re-téléchargée silencieusement). */
  sourceUrl: string
}

export interface BackgroundMediaCacheManifest {
  schemaVersion: number
  entries: CachedBackgroundVideo[]
}

export const EMPTY_MEDIA_CACHE: BackgroundMediaCacheManifest = {
  schemaVersion: MEDIA_CACHE_SCHEMA_VERSION,
  entries: [],
}

/** Nom du fichier vidéo pour un videoId (format stable, jamais deviné). */
export function cacheVideoFilename(videoId: string): string {
  return `video_${videoId}.mp4`
}

/** Nom du fichier vignette pour un videoId. */
export function cacheThumbnailFilename(videoId: string): string {
  return `thumbnail_${videoId}.jpg`
}

/** Insère/remplace l'entrée d'un videoId (dédoublonnée, tri stable). */
export function upsertCacheEntry(manifest: BackgroundMediaCacheManifest, entry: CachedBackgroundVideo): BackgroundMediaCacheManifest {
  const others = manifest.entries.filter(item => item.videoId !== entry.videoId)
  return { ...manifest, entries: [...others, entry].sort((a, b) => b.cachedAt - a.cachedAt) }
}

/** Retire l'entrée d'un videoId (fichiers supprimés côté natif). */
export function removeCacheEntry(manifest: BackgroundMediaCacheManifest, videoId: string): BackgroundMediaCacheManifest {
  return { ...manifest, entries: manifest.entries.filter(item => item.videoId !== videoId) }
}

/** Entrée de cache pour un videoId, si présente. */
export function cacheEntryFor(manifest: BackgroundMediaCacheManifest, videoId: string): CachedBackgroundVideo | undefined {
  return manifest.entries.find(item => item.videoId === videoId)
}

/** Taille totale occupée (octets). */
export function totalCacheBytes(manifest: BackgroundMediaCacheManifest): number {
  return manifest.entries.reduce((sum, entry) => sum + (entry.sizeBytes || 0), 0)
}

/** Éviction LRU : supprime les plus anciens jusqu'à respecter `maxBytes`. */
export function evictLru(manifest: BackgroundMediaCacheManifest, maxBytes: number): BackgroundMediaCacheManifest {
  if (maxBytes <= 0) return { ...manifest, entries: [] }
  let entries = [...manifest.entries].sort((a, b) => b.cachedAt - a.cachedAt)
  let total = totalCacheBytes({ ...manifest, entries })
  while (total > maxBytes && entries.length > 1) {
    const removed = entries.pop()!
    total -= removed.sizeBytes || 0
  }
  return { ...manifest, entries }
}

/** Validation d'un fichier mis en cache : nom attendu + taille > 0. */
export function validateCachedVideo(entry: CachedBackgroundVideo, videoId: string): boolean {
  return entry.videoFile === cacheVideoFilename(videoId) && entry.sizeBytes > 0
}

/** Entrée native du cache (inventaire disque) — mappée vers le manifeste. */
export interface NativeCachedMediaEntry {
  videoId: string
  sizeBytes: number
  cachedAt: number
  sourceUrl?: string
}

/**
 * Construit le manifeste de cache depuis l'inventaire natif RÉEL (le disque
 * est la source de vérité — jamais un manifeste deviné). Filtre les entrées
 * vides/invalides et trie par date décroissante.
 */
export function mediaCacheManifestFromNative(entries: NativeCachedMediaEntry[]): BackgroundMediaCacheManifest {
  const mapped = entries
    .filter(entry => Boolean(entry.videoId) && entry.sizeBytes > 0)
    .map(entry => ({
      videoId: entry.videoId,
      videoFile: cacheVideoFilename(entry.videoId),
      sizeBytes: entry.sizeBytes,
      cachedAt: entry.cachedAt || 0,
      sourceUrl: entry.sourceUrl || '',
    }))
    .sort((a, b) => b.cachedAt - a.cachedAt)
  return { schemaVersion: MEDIA_CACHE_SCHEMA_VERSION, entries: mapped }
}

/** Pipeline d'état du téléchargement YouTube (spec) : statut lisible par l'UI. */
export type YoutubeResolveStatus = 'idle' | 'validating' | 'identifying' | 'downloading' | 'caching' | 'verifying' | 'cached' | 'ytdlp_missing' | 'failed'

export const PIPELINE_STAGES: Array<{ id: YoutubeResolveStatus; label: string }> = [
  { id: 'validating', label: 'Validation du lien' },
  { id: 'identifying', label: 'Identification de la vidéo' },
  { id: 'downloading', label: 'Téléchargement' },
  { id: 'caching', label: 'Cache local' },
  { id: 'verifying', label: 'Vérification du fichier' },
]
