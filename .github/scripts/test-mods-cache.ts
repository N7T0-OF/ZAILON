/**
 * Tests du cache mods intelligent (spec §37-38) — décisions pures :
 * re-scanner uniquement quand l'empreinte LÉGÈRE du dossier Mods a changé.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { modsScanDecision } from '../../src/lib/modsCache.ts'

test('cache mods : pas de dossier configuré → rien à scanner (reuse)', () => {
  assert.equal(modsScanDecision({ fingerprint: '', modsPathConfigured: false }), 'reuse')
})

test('cache mods : dossier absent alors qu’il était configuré → rescan (résultat vide + staged relus)', () => {
  assert.equal(modsScanDecision({ fingerprint: '', modsPathConfigured: true }), 'rescan')
})

test('cache mods : empreinte identique en mémoire (même session) → reuse, jamais de re-scan', () => {
  const fingerprint = '3f2a9c1b'
  assert.equal(modsScanDecision({ fingerprint, memoryFingerprint: fingerprint, modsPathConfigured: true }), 'reuse')
  // Le persisté peut être absent (première session) — la mémoire suffit.
  assert.equal(modsScanDecision({ fingerprint, memoryFingerprint: fingerprint, modsPathConfigured: true }), 'reuse')
})

test('cache mods : empreinte identique au persisté (session précédente) → reuse', () => {
  const fingerprint = '7c0ffee'
  assert.equal(modsScanDecision({ fingerprint, persistedFingerprint: fingerprint, modsPathConfigured: true }), 'reuse')
  // Mémoire vide (fresh process) — le persisté couvre le redémarrage.
  assert.equal(modsScanDecision({ fingerprint, memoryFingerprint: undefined, persistedFingerprint: fingerprint, modsPathConfigured: true }), 'reuse')
})

test('cache mods : tout changement d’empreinte → rescan complet', () => {
  assert.equal(modsScanDecision({ fingerprint: 'aaa', memoryFingerprint: 'bbb', persistedFingerprint: 'ccc', modsPathConfigured: true }), 'rescan')
  assert.equal(modsScanDecision({ fingerprint: 'new', memoryFingerprint: 'old', modsPathConfigured: true }), 'rescan')
  assert.equal(modsScanDecision({ fingerprint: 'new', modsPathConfigured: true }), 'rescan')
})
