// Tests de la priorité multi-sessions et de l'arbitrage des entrées.
//   node --test .github/scripts/test-session-priority.ts

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  activeSessions,
  arbitrateInputProfiles,
  isSearchingSession,
  pickPrioritySession,
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

test('activeSessions : exclut Ended/Failed/GameLost', () => {
  const sessions = [
    session('a', 'GameRunning', 1),
    session('b', 'WaitingForGame', 2),
    session('c', 'Ended', 3),
    session('d', 'GameLost', 4),
  ]
  assert.deepEqual(activeSessions(sessions).map(item => item.gameId), ['a', 'b'])
})
