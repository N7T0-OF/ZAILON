import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyAccentTokens, applyDangerTokens, bootstrapTheme, ZAILON_DANGER, ZAILON_DANGER_HOVER, ZAILON_DANGER_MUTED } from '../../src/lib/designTokens.ts'

function mockRoot() {
  const vars = new Map<string, string>()
  return {
    root: {
      style: {
        setProperty: (name: string, value: string) => { vars.set(name, value) },
      },
    },
    vars,
  }
}

test('applyAccentTokens : injecte les 8 tokens dérivés (spec §8)', () => {
  const { root, vars } = mockRoot()
  assert.equal(applyAccentTokens(root, '#f97316'), true)
  assert.equal(vars.get('--zailon-accent'), '#f97316')
  assert.ok(vars.has('--zailon-accent-hover'))
  assert.ok(vars.has('--zailon-accent-active'))
  assert.ok(vars.has('--zailon-accent-muted'))
  assert.ok(vars.has('--zailon-accent-border'))
  assert.ok(vars.has('--zailon-accent-text'))
  assert.ok(vars.has('--zailon-accent-contrast'))
  assert.ok(vars.has('--zailon-focus-ring'))
})

test('applyAccentTokens : accent clair → texte sombre (contraste, spec §47)', () => {
  const { root, vars } = mockRoot()
  applyAccentTokens(root, '#f3faf8')
  assert.equal(vars.get('--zailon-accent-text'), '#090b0b')
})

test('applyAccentTokens : accent sombre → texte clair', () => {
  const { root, vars } = mockRoot()
  applyAccentTokens(root, '#0d1111')
  assert.equal(vars.get('--zailon-accent-text'), '#ffffff')
})

test('applyAccentTokens : couleur invalide → refusé, aucun token posé (spec §6)', () => {
  const { root, vars } = mockRoot()
  assert.equal(applyAccentTokens(root, 'rouge'), false)
  assert.equal(vars.size, 0)
})

test('applyDangerTokens : palette danger indépendante de l’accent (spec §14, §70)', () => {
  const { root, vars } = mockRoot()
  applyDangerTokens(root)
  assert.equal(vars.get('--zailon-danger'), ZAILON_DANGER)
  assert.equal(vars.get('--zailon-danger-hover'), ZAILON_DANGER_HOVER)
  assert.equal(vars.get('--zailon-danger-muted'), ZAILON_DANGER_MUTED)
})

test('bootstrapTheme : accent persisté appliqué avant le premier rendu (spec §7)', () => {
  const { root, vars } = mockRoot()
  const storage = {
    getItem: () => JSON.stringify({ state: { accentColor: '#38bdf8' }, version: 3 }),
  }
  bootstrapTheme(root, storage)
  assert.equal(vars.get('--zailon-accent'), '#38bdf8')
  assert.equal(vars.get('--zailon-danger'), ZAILON_DANGER)
})

test('bootstrapTheme : pas de réglage persisté → tokens par défaut seulement (spec §7)', () => {
  const { root, vars } = mockRoot()
  bootstrapTheme(root, { getItem: () => null })
  assert.equal(vars.get('--zailon-accent'), undefined)
  assert.equal(vars.get('--zailon-danger'), ZAILON_DANGER)
})

test('bootstrapTheme : JSON invalide → aucun crash (spec §5)', () => {
  const { root, vars } = mockRoot()
  bootstrapTheme(root, { getItem: () => 'pas du json{' })
  assert.equal(vars.get('--zailon-accent'), undefined)
  assert.equal(vars.get('--zailon-danger'), ZAILON_DANGER)
})
