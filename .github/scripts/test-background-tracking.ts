/**
 * Tests du mode discret — notification système de session (spec §120) :
 * logique PURE — même règle que le toast runtime, appliquée quand la fenêtre
 * est cachée (`--background`). Aucune session ne doit être annoncée hors mode
 * discret, ni quand le toast runtime est désactivé, ni pour une fin de session.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  backgroundSessionNotification,
  isTrackedSessionStart,
  shouldNotifyBackgroundSession,
} from '../../src/lib/backgroundTracking.ts'

test('isTrackedSessionStart : uniquement les débuts de suivi (§120)', () => {
  assert.equal(isTrackedSessionStart('started'), true)
  assert.equal(isTrackedSessionStart('detected'), true)
  assert.equal(isTrackedSessionStart('recovered'), true)
  assert.equal(isTrackedSessionStart('ended'), false)
  assert.equal(isTrackedSessionStart(undefined), false)
})

test('shouldNotifyBackgroundSession : mode discret + toast runtime + début (spec §120)', () => {
  assert.equal(shouldNotifyBackgroundSession('started', true, true), true)
  assert.equal(shouldNotifyBackgroundSession('detected', true, true), true)
  assert.equal(shouldNotifyBackgroundSession('recovered', true, true), true)
  // Fenêtre visible → le toast in-app suffit, jamais de bulle système.
  assert.equal(shouldNotifyBackgroundSession('started', false, true), false)
  // Toast runtime désactivé → pas de notification non plus.
  assert.equal(shouldNotifyBackgroundSession('started', true, false), false)
  // Fin de session → pas de bulle « suivi ».
  assert.equal(shouldNotifyBackgroundSession('ended', true, true), false)
})

test('backgroundSessionNotification : contenu de la bulle, puis disparition (§120)', () => {
  const bullet = backgroundSessionNotification('started', 'Cyberpunk 2077')
  assert.deepEqual(bullet, { title: 'ZAILON', message: '✓ Suivi par ZAILON — Cyberpunk 2077' })
  assert.equal(backgroundSessionNotification('ended', 'Cyberpunk 2077'), undefined)
  assert.equal(backgroundSessionNotification(undefined, 'Cyberpunk 2077'), undefined)
})
