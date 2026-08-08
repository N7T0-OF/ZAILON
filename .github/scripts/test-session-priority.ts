// Tests de la priorité multi-sessions et de l'arbitrage des entrées.
//   node --test .github/scripts/test-session-priority.ts

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  activeSessions,
  arbitrateInputProfiles,
  isSearchingSession,
  pickPrioritySession,
  recoveryKind,
} from '../../src/lib/sessionPriority.ts'

const session = (gameId: string, state: string, startedAt: number, lastSeenAt?: number) => ({
  id: `${gameId}-${startedAt}`,
  gameId,
  state,
  startedAt,
  lastSeenAt,
})

test('pickPrioritySession : aucune session → aucun prioritaire', () => {
  assert.equal(pickPrioritySession([]), undefined)
  assert.equal(pickPrioritySession([session('a', 'Ended', 1)]), undefined)
})

test('pickPrioritySession : la session Running la plus récente gagne', () => {
  const sessions = [
    session('cyberpunk', 'GameRunning', 100, 200),
    session('nte', 'GameRunning', 150, 180),
  ]
  assert.equal(pickPrioritySession(sessions), 'cyberpunk')
})

test('pickPrioritySession : épinglée active → prioritaire, sinon Running, sinon active', () => {
  const sessions = [
    session('photoshop', 'GameRunning', 50),
    session('cyberpunk', 'GameRunning', 200),
  ]
  assert.equal(pickPrioritySession(sessions, 'photoshop'), 'photoshop') // épinglée
  assert.equal(pickPrioritySession(sessions, 'inexistant'), 'cyberpunk') // Running récent
  const searching = [session('nte', 'WaitingForGame', 300)]
  assert.equal(pickPrioritySession(searching), 'nte') // active même en recherche
})

test('pickPrioritySession : le premier plan (Alt+Tab) gagne sur Running récent', () => {
  const sessions = [
    session('cyberpunk', 'GameRunning', 200, 250),
    session('nte', 'GameRunning', 100, 150),
  ]
  // NTE au premier plan → prioritaire, même si Cyberpunk est plus récent.
  assert.equal(pickPrioritySession(sessions, undefined, 'nte'), 'nte')
  // Épinglée toujours gagnante sur le premier plan.
  assert.equal(pickPrioritySession(sessions, 'cyberpunk', 'nte'), 'cyberpunk')
  // Premier plan d'une session terminale → ignoré, retour au Running récent.
  const ended = [
    session('cyberpunk', 'GameRunning', 200, 250),
    session('nte', 'Ended', 100, 150),
  ]
  assert.equal(pickPrioritySession(ended, undefined, 'nte'), 'cyberpunk')
})

test('arbitrateInputProfiles : un seul mapping actif à la fois', () => {
  const sessions = [
    session('cyberpunk', 'GameRunning', 200),
    session('nte', 'GameRunning', 100),
    session('photoshop', 'GameRunning', 50),
  ]
  const arbiter = arbitrateInputProfiles(sessions, 'cyberpunk')
  assert.deepEqual(arbiter, { cyberpunk: true, nte: false, photoshop: false })
  // Sans prioritaire → aucun mapping actif (pas de superposition).
  const none = arbitrateInputProfiles(sessions, undefined)
  assert.deepEqual(none, { cyberpunk: false, nte: false, photoshop: false })
})

test('isSearchingSession : recherche vs jeu détecté', () => {
  assert.equal(isSearchingSession('WaitingForGame'), true)
  assert.equal(isSearchingSession('WaitingForElevation'), true)
  assert.equal(isSearchingSession('LauncherStarted'), true)
  assert.equal(isSearchingSession('GameRunning'), false)
  assert.equal(isSearchingSession('Ended'), false)
})

test('recoveryKind : dans la fenêtre de grâce = récupéré, sinon détecté', () => {
  const bootedAt = 1_000_000
  assert.equal(recoveryKind(bootedAt, bootedAt + 5_000), 'recovered')
  assert.equal(recoveryKind(bootedAt, bootedAt + 19_999), 'recovered')
  assert.equal(recoveryKind(bootedAt, bootedAt + 20_000), 'detected') // limite incluse → détecté
  assert.equal(recoveryKind(bootedAt, bootedAt + 3_600_000), 'detected')
  assert.equal(recoveryKind(bootedAt, bootedAt + 5_000, 60_000), 'recovered') // grâce personnalisée
})

test('activeSessions : exclut Ended/Failed/GameLost', () => {
  const sessions = [
    session('a', 'GameRunning', 1),
    session('b', 'WaitingForGame', 2),
    session('c', 'Ended', 3),
    session('d', 'GameLost', 4),
  ]
  assert.deepEqual(activeSessions(sessions).map(item => item.gameId), ['a', 'b'])
})
