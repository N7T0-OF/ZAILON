import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_BACKGROUND_MEDIA_SETTINGS,
  clampVolume,
  describeBackgroundMedia,
  resolveAudioSettings,
  resolveMediaType,
  type BackgroundMediaSettings,
  type GameBackgroundMedia,
} from '../../src/lib/backgroundMedia.ts'

const GLOBAL: BackgroundMediaSettings = DEFAULT_BACKGROUND_MEDIA_SETTINGS

test('volume par défaut très faible (7%)', () => {
  assert.equal(DEFAULT_BACKGROUND_MEDIA_SETTINGS.bgVolume, 0.07)
  assert.equal(DEFAULT_BACKGROUND_MEDIA_SETTINGS.bgAlwaysMuted, true)
})

test('clampVolume borne 0-1 et rejette NaN', () => {
  assert.equal(clampVolume(0.5), 0.5)
  assert.equal(clampVolume(2), 1)
  assert.equal(clampVolume(-1), 0)
  assert.equal(clampVolume(Number.NaN), DEFAULT_BACKGROUND_MEDIA_SETTINGS.bgVolume)
})

test('muet par défaut, jamais de son surprise au lancement', () => {
  const audio = resolveAudioSettings(undefined, GLOBAL)
  assert.equal(audio.muted, true)
  assert.equal(audio.volume, 0.07)
})

test('audio global désactivé force le silence', () => {
  const audio = resolveAudioSettings({ type: 'youtube', mutedOverride: false, volumeOverride: 0.5 }, { ...GLOBAL, bgAudioEnabled: false })
  assert.equal(audio.muted, true)
})

test('surcharge par jeu respectée quand l\'audio global est actif', () => {
  const audio = resolveAudioSettings({ type: 'youtube', mutedOverride: false, volumeOverride: 0.12 }, { ...GLOBAL, bgAudioEnabled: true })
  assert.equal(audio.muted, false)
  assert.equal(audio.volume, 0.12)
})

test('resolveMediaType : youtube si videoId présent', () => {
  const media: GameBackgroundMedia = { type: 'youtube', youtubeVideoId: 'dQw4w9WgXcQ' }
  assert.equal(resolveMediaType(media, GLOBAL, false), 'youtube')
})

test('resolveMediaType : video locale', () => {
  const media: GameBackgroundMedia = { type: 'video', localPath: 'C:/x/bg.mp4' }
  assert.equal(resolveMediaType(media, GLOBAL, true), 'video')
})

test('resolveMediaType : image → none (géré par le Hero)', () => {
  assert.equal(resolveMediaType({ type: 'image' }, GLOBAL, true), 'none')
})

test('resolveMediaType : fond vidéo globalement désactivé', () => {
  assert.equal(resolveMediaType({ type: 'youtube', youtubeVideoId: 'x' }, { ...GLOBAL, bgVideoEnabled: false }, false), 'none')
})

test('resolveMediaType : auto choisit youtube puis video', () => {
  assert.equal(resolveMediaType({ type: 'auto', youtubeVideoId: 'abc123abc12' }, GLOBAL, true), 'youtube')
  assert.equal(resolveMediaType({ type: 'auto' }, GLOBAL, true), 'video')
  assert.equal(resolveMediaType({ type: 'auto' }, GLOBAL, false), 'none')
})

test('describeBackgroundMedia', () => {
  assert.equal(describeBackgroundMedia(undefined, false), 'Automatique')
  assert.equal(describeBackgroundMedia({ type: 'youtube', youtubeVideoId: 'x' }, false), 'YouTube')
  assert.equal(describeBackgroundMedia({ type: 'video' }, true), 'Vidéo locale')
  assert.equal(describeBackgroundMedia({ type: 'image' }, false), 'Image fixe')
})
