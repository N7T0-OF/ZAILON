import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateSessionEnd, EXIT_GRACE_MS } from '../../src/lib/sessionEnd.ts'

test('un jeu présent maintient la session en cours', () => {
  const result = evaluateSessionEnd({ running: true, present: true, now: 1_000 })
  assert.equal(result.present, true)
  assert.equal(result.shouldEnd, false)
  assert.equal(result.possibleExitSince, undefined)
})

test('première absence → ouverture de la période PossibleExit, pas de fin immédiate', () => {
  const result = evaluateSessionEnd({ running: true, present: false, now: 1_000 })
  assert.equal(result.present, false)
  assert.equal(result.shouldEnd, false)
  assert.equal(result.possibleExitSince, 1_000)
})

test('absence pendant la grâce → pas encore de fin', () => {
  const result = evaluateSessionEnd({ running: true, present: false, possibleExitSince: 1_000, now: 1_000 + EXIT_GRACE_MS - 1 })
  assert.equal(result.shouldEnd, false)
  assert.equal(result.possibleExitSince, 1_000)
})

test('absence après la grâce → session terminée', () => {
  const result = evaluateSessionEnd({ running: true, present: false, possibleExitSince: 1_000, now: 1_000 + EXIT_GRACE_MS })
  assert.equal(result.shouldEnd, true)
  assert.match(result.reason, /fermé/)
})

test('le retour du jeu pendant la grâce annule la fin', () => {
  const first = evaluateSessionEnd({ running: true, present: false, now: 1_000 })
  assert.equal(first.possibleExitSince, 1_000)
  const second = evaluateSessionEnd({ running: true, present: true, possibleExitSince: first.possibleExitSince, now: 1_000 + 2_000 })
  assert.equal(second.present, true)
  assert.equal(second.shouldEnd, false)
  assert.equal(second.possibleExitSince, undefined)
})

test('une session non en cours ne se termine pas via ce chemin', () => {
  const result = evaluateSessionEnd({ running: false, present: false, now: 1_000 })
  assert.equal(result.shouldEnd, false)
})
