import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accentContrastText, parseHexColor, relativeLuminance } from '../../src/lib/designSystem.ts'

test('parseHexColor : #rrggbb standard', () => {
  assert.deepEqual(parseHexColor('#f3faf8'), { r: 243, g: 250, b: 248 })
})

test('parseHexColor : tolère l’absence de # et la casse', () => {
  assert.deepEqual(parseHexColor('0D1111'), { r: 13, g: 17, b: 17 })
})

test('parseHexColor : invalide → null (spec §48)', () => {
  assert.equal(parseHexColor('rouge'), null)
  assert.equal(parseHexColor('#f3faf'), null)
  assert.equal(parseHexColor(''), null)
})

test('relativeLuminance : blanc proche de 1, noir proche de 0', () => {
  assert.ok(relativeLuminance({ r: 255, g: 255, b: 255 }) > 0.99)
  assert.ok(relativeLuminance({ r: 0, g: 0, b: 0 }) < 0.01)
})

test('accentContrastText : accent clair → texte sombre (spec §47)', () => {
  assert.equal(accentContrastText('#f3faf8'), '#090b0b')
})

test('accentContrastText : accent sombre → texte clair (spec §47)', () => {
  assert.equal(accentContrastText('#0d1111'), '#ffffff')
})

test('accentContrastText : invalide → repli texte clair (spec §48)', () => {
  assert.equal(accentContrastText('nope'), '#ffffff')
})
