/**
 * Tests du Mode Minimal (spec §42) — décisions pures : vidéo, automatismes et
 * animations coupés quand le mode est actif.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  minimalBackgroundAllowed,
  minimalAutoActivityAllowed,
  minimalModeDataset,
  resolveMinimalMode,
} from '../../src/lib/minimalMode.ts'

test('resolveMinimalMode : tout est coupé quand actif, rien quand inactif', () => {
  assert.deepEqual(resolveMinimalMode(true), { videoDisabled: true, autoActivityDisabled: true, animationsDisabled: true })
  assert.deepEqual(resolveMinimalMode(false), { videoDisabled: false, autoActivityDisabled: false, animationsDisabled: false })
})

test('minimalBackgroundAllowed : configuré ET hors mode minimal uniquement', () => {
  assert.equal(minimalBackgroundAllowed(true, false), true)
  assert.equal(minimalBackgroundAllowed(true, true), false)
  assert.equal(minimalBackgroundAllowed(false, false), false)
})

test('minimalAutoActivityAllowed : artwork/update coupés en mode minimal', () => {
  assert.equal(minimalAutoActivityAllowed(true, false), true)
  assert.equal(minimalAutoActivityAllowed(true, true), false)
  assert.equal(minimalAutoActivityAllowed(false, true), false)
})

test('minimalModeDataset : attribut data-minimal-mode du document', () => {
  assert.equal(minimalModeDataset(true).minimalMode, 'true')
  assert.equal(minimalModeDataset(false).minimalMode, '')
})
