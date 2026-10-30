// Tests du formateur de durée (fix du bug « 29770249211h 15m »).
//   node --test .github/scripts/test-duration-format.ts

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatClock, formatElapsedDuration, formatTime } from '../../src/utils/index.ts'

const now = Date.now()

test('formatElapsedDuration : plages demandées par la spec', () => {
  assert.equal(formatElapsedDuration(now, now), '0s')
  assert.equal(formatElapsedDuration(now, now + 500), '0s')
  assert.equal(formatElapsedDuration(now, now + 10_000), '10s')
  assert.equal(formatElapsedDuration(now, now + 59_000), '59s')
  assert.equal(formatElapsedDuration(now, now + 60_000), '1min')
  assert.equal(formatElapsedDuration(now, now + 2 * 60_000), '2min')
  assert.equal(formatElapsedDuration(now, now + 59 * 60_000), '59min')
  assert.equal(formatElapsedDuration(now, now + 3_600_000), '1h')
  assert.equal(formatElapsedDuration(now, now + 23 * 3_600_000), '23h')
  assert.equal(formatElapsedDuration(now, now + 24 * 3_600_000), '1j')
  assert.equal(formatElapsedDuration(now, now + 2 * 86_400_000), '2j')
  assert.equal(formatElapsedDuration(now, now + 3_600_000 + 14 * 60_000), '1h 14min')
})

test('formatElapsedDuration : valeurs invalides → chaîne vide, jamais de milliards d’heures', () => {
  assert.equal(formatElapsedDuration(now, now - 1_000), '') // future (start > now)
  assert.equal(formatElapsedDuration(Number.NaN, now), '')
  assert.equal(formatElapsedDuration(now, Number.POSITIVE_INFINITY), '')
  assert.equal(formatElapsedDuration(0, Number.MAX_SAFE_INTEGER), '') // > 1 an
  // Régression bloquante : un timestamp epoch passé comme « durée » ne doit
  // JAMAIS produire un nombre absurde d’heures.
  const absurd = formatElapsedDuration(0, 1_786_214_924_117) // ~epoch ms
  assert.notEqual(absurd, '29770249211h 15m')
  assert.ok(absurd === '')
})

test('formatTime : ne reçoit QUE des minutes — garde-fous anti-timestamp', () => {
  assert.equal(formatTime(0), '0m')
  assert.equal(formatTime(12), '12m')
  assert.equal(formatTime(134), '2h 14m')
  assert.equal(formatTime(120), '2h')
  // Un timestamp ms passé par erreur est maintenant neutralisé, pas affiché.
  assert.equal(formatTime(1_786_214_924_117), '')
  assert.equal(formatTime(Number.NaN), '')
  assert.equal(formatTime(-5), '')
  assert.equal(formatTime(Number.POSITIVE_INFINITY), '')
})

test('formatClock : timestamp epoch ms → heure d’horloge (jamais des heures de durée)', () => {
  const ms = new Date(2026, 7, 8, 14, 5).getTime()
  assert.equal(formatClock(ms), '14:05')
  assert.equal(formatClock(Number.NaN), '—')
  assert.equal(formatClock(0), '—')
  assert.equal(formatClock(-1), '—')
})
