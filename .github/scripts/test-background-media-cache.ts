/**
 * Tests du cache local des vidéos de fond (spec « Fix vidéo YouTube ») —
 * logique PURE : manifeste, clés, éviction LRU, validation, taille. Aucun
 * accès disque/processus.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cacheEntryFor,
  cacheThumbnailFilename,
  cacheVideoFilename,
  EMPTY_MEDIA_CACHE,
  evictLru,
  removeCacheEntry,
  totalCacheBytes,
  upsertCacheEntry,
  validateCachedVideo,
  type CachedBackgroundVideo,
  type BackgroundMediaCacheManifest,
} from '../../src/lib/backgroundMediaCache.ts'

const entry = (videoId: string, sizeBytes: number, cachedAt: number): CachedBackgroundVideo => ({
  videoId,
  videoFile: cacheVideoFilename(videoId),
  thumbnailFile: cacheThumbnailFilename(videoId),
  sizeBytes,
  cachedAt,
  sourceUrl: `https://youtube.com/watch?v=${videoId}`,
})

test('noms de fichiers stables et jamais devinés (videoId → mp4/jpg)', () => {
  assert.equal(cacheVideoFilename('abc123DEF45'), 'video_abc123DEF45.mp4')
  assert.equal(cacheThumbnailFilename('abc123DEF45'), 'thumbnail_abc123DEF45.jpg')
})

test('upsert : dédoublonne par videoId et trie par cachedAt décroissant', () => {
  let manifest = EMPTY_MEDIA_CACHE
  manifest = upsertCacheEntry(manifest, entry('aaa', 100, 1))
  manifest = upsertCacheEntry(manifest, entry('bbb', 200, 2))
  manifest = upsertCacheEntry(manifest, entry('aaa', 150, 3)) // remplace aaa
  assert.equal(manifest.entries.length, 2)
  assert.equal(manifest.entries[0].videoId, 'aaa')
  assert.equal(cacheEntryFor(manifest, 'aaa')?.sizeBytes, 150)
})

test('remove + total : taille agrégée, suppression ciblée', () => {
  let manifest: BackgroundMediaCacheManifest = EMPTY_MEDIA_CACHE
  manifest = upsertCacheEntry(manifest, entry('a', 100, 1))
  manifest = upsertCacheEntry(manifest, entry('b', 250, 2))
  assert.equal(totalCacheBytes(manifest), 350)
  manifest = removeCacheEntry(manifest, 'a')
  assert.equal(totalCacheBytes(manifest), 250)
  assert.equal(cacheEntryFor(manifest, 'a'), undefined)
})

test('evictLru : supprime les plus anciens jusqu’à la limite (jamais la dernière)', () => {
  let manifest: BackgroundMediaCacheManifest = EMPTY_MEDIA_CACHE
  manifest = upsertCacheEntry(manifest, entry('old', 500, 1))
  manifest = upsertCacheEntry(manifest, entry('mid', 400, 2))
  manifest = upsertCacheEntry(manifest, entry('new', 300, 3))
  const evicted = evictLru(manifest, 700)
  assert.deepEqual(evicted.entries.map(item => item.videoId), ['new', 'mid'])
  assert.equal(totalCacheBytes(evicted), 700)
})

test('validateCachedVideo : nom attendu + taille > 0', () => {
  assert.equal(validateCachedVideo(entry('xyz', 1234, 1), 'xyz'), true)
  assert.equal(validateCachedVideo({ ...entry('xyz', 1234, 1), videoFile: 'video_other.mp4' }, 'xyz'), false)
  assert.equal(validateCachedVideo({ ...entry('xyz', 0, 1) }, 'xyz'), false)
})
