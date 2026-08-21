import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { compareSemver, parseSemver, shouldShowReleaseNotes } from '../../src/lib/releaseNotes.ts'

test('parseSemver : versions classiques et préfixe v', () => {
  assert.deepEqual(parseSemver('1.115.0'), { major: 1, minor: 115, patch: 0 })
  assert.deepEqual(parseSemver('v1.2.3'), { major: 1, minor: 2, patch: 3 })
  assert.deepEqual(parseSemver('2.0.0-beta'), { major: 2, minor: 0, patch: 0 })
  assert.equal(parseSemver(''), null)
  assert.equal(parseSemver('nope'), null)
})

test('compareSemver : ordre strict', () => {
  assert.equal(compareSemver('1.115.0', '1.114.0'), 1)
  assert.equal(compareSemver('1.114.0', '1.115.0'), -1)
  assert.equal(compareSemver('1.115.0', '1.115.0'), 0)
  assert.equal(compareSemver('2.0.0', '1.9.9'), 1)
  assert.equal(compareSemver('1.2.3', '1.2.4'), -1)
})

test('shouldShowReleaseNotes : affiche uniquement après une vraie montée de version', () => {
  // Nouvelle version installée, ancienne déjà vue → on affiche.
  assert.equal(shouldShowReleaseNotes({ installedVersion: '1.115.0', lastSeenVersion: '1.114.0', enabled: true }), true)
  // Même version → déjà vue, on n'affiche pas.
  assert.equal(shouldShowReleaseNotes({ installedVersion: '1.115.0', lastSeenVersion: '1.115.0', enabled: true }), false)
  // Préférence désactivée → jamais.
  assert.equal(shouldShowReleaseNotes({ installedVersion: '1.115.0', lastSeenVersion: '1.114.0', enabled: false }), false)
  // Première installation (aucune version vue) → pas de fenêtre.
  assert.equal(shouldShowReleaseNotes({ installedVersion: '1.115.0', lastSeenVersion: undefined, enabled: true }), false)
  assert.equal(shouldShowReleaseNotes({ installedVersion: '1.115.0', lastSeenVersion: '  ', enabled: true }), false)
  // Retour en arrière → pas de fenêtre.
  assert.equal(shouldShowReleaseNotes({ installedVersion: '1.114.0', lastSeenVersion: '1.115.0', enabled: true }), false)
})
