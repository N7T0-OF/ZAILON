import test from 'node:test'
import assert from 'node:assert/strict'
import { parseYouTubeUrl, youtubeEmbedUrl, youtubeThumbnailUrl } from '../../src/lib/youtubeUrl.ts'

test('watch standard', () => {
  const parsed = parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  assert.equal(parsed?.videoId, 'dQw4w9WgXcQ')
})

test('youtu.be court', () => {
  const parsed = parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')
  assert.equal(parsed?.videoId, 'dQw4w9WgXcQ')
})

test('shorts', () => {
  const parsed = parseYouTubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')
  assert.equal(parsed?.videoId, 'dQw4w9WgXcQ')
})

test('embed', () => {
  const parsed = parseYouTubeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')
  assert.equal(parsed?.videoId, 'dQw4w9WgXcQ')
})

test('live', () => {
  const parsed = parseYouTubeUrl('https://www.youtube.com/live/dQw4w9WgXcQ')
  assert.equal(parsed?.videoId, 'dQw4w9WgXcQ')
})

test('timestamps t= et #t=', () => {
  const a = parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=65')
  assert.equal(a?.startSeconds, 65)
  const b = parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ?t=90')
  assert.equal(b?.startSeconds, 90)
})

test('URL non-YouTube refusée', () => {
  assert.equal(parseYouTubeUrl('https://vimeo.com/12345'), null)
  assert.equal(parseYouTubeUrl('https://tiktok.com/@x/video/123'), null)
  assert.equal(parseYouTubeUrl('https://example.com/watch?v=dQw4w9WgXcQ'), null)
})

test('ID invalide refusé', () => {
  assert.equal(parseYouTubeUrl('https://www.youtube.com/watch?v=tooshort'), null)
  assert.equal(parseYouTubeUrl('https://www.youtube.com/watch?v='), null)
  assert.equal(parseYouTubeUrl('https://youtu.be/'), null)
})

test('chaîne vide et malformée', () => {
  assert.equal(parseYouTubeUrl(''), null)
  assert.equal(parseYouTubeUrl('   '), null)
  assert.equal(parseYouTubeUrl('not a url'), null)
})

test('embed URL utilise uniquement le videoId, jamais l\'URL brute', () => {
  const embed = youtubeEmbedUrl('dQw4w9WgXcQ', { startSeconds: 30 })
  assert.ok(embed.startsWith('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?'))
  assert.ok(embed.includes('autoplay=1'))
  assert.ok(embed.includes('mute=1'))
  assert.ok(embed.includes('loop=1'))
  assert.ok(embed.includes('playlist=dQw4w9WgXcQ'))
  assert.ok(embed.includes('start=30'))
  assert.ok(!embed.includes('watch?v='))
})

test('thumbnail publique', () => {
  assert.equal(youtubeThumbnailUrl('dQw4w9WgXcQ'), 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
})
