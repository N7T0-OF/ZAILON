import { test } from 'node:test'
import assert from 'node:assert/strict'
import { INFO_POPOVER_LONG_TEXT_CHARS, popoverHasMore, popoverShortText } from '../../src/lib/infoPopover.ts'

test('popoverHasMore : texte court sans détails → pas de bouton (spec §41)', () => {
  assert.equal(popoverHasMore('Texte court.', undefined), false)
})

test('popoverHasMore : bloc details fourni → En savoir plus (spec §41)', () => {
  assert.equal(popoverHasMore('Court.', { contenu: 'long' }), true)
})

test('popoverHasMore : texte long → En savoir plus automatique (spec §41)', () => {
  const long = 'x'.repeat(INFO_POPOVER_LONG_TEXT_CHARS + 1)
  assert.equal(popoverHasMore(long, undefined), true)
})

test('popoverShortText : texte court inchangé', () => {
  assert.equal(popoverShortText('Bonjour'), 'Bonjour')
})

test('popoverShortText : texte long tronqué avec …', () => {
  const long = 'a'.repeat(300)
  const short = popoverShortText(long)
  assert.ok(short.length < long.length)
  assert.ok(short.endsWith('…'))
})

test('popoverShortText : seuil exact (220) reste complet', () => {
  const at = 'b'.repeat(INFO_POPOVER_LONG_TEXT_CHARS)
  assert.equal(popoverShortText(at), at)
})
