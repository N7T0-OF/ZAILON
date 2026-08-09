import { test } from 'node:test'
import assert from 'node:assert/strict'
import { activeSessionsForQuickPanel, modsPreparedFor, quickPanelPerformanceState } from '../../src/lib/quickPanelState.ts'
import type { GameSession } from '../../src/types'

const session = (overrides: Partial<GameSession> = {}): GameSession => ({
  id: 's1',
  gameId: 'g1',
  profileId: 'p1',
  launchStrategy: 'direct',
  launcherProcessIds: [],
  gameProcessIds: [42],
  startedAt: 0,
  state: 'GameRunning',
  runtimeToolsActive: false,
  deploymentActive: false,
  inputProfileActive: false,
  visualProfileActive: false,
  source: 'zailon',
  timeline: [],
  ...overrides,
})

test('mode Performance : explicite par jeu sinon mode global (spec §24)', () => {
  assert.equal(quickPanelPerformanceState({ g1: 'performance' }, 'auto', { downloads: 'normal', scans: 'normal' }, 'g1').mode, 'performance')
  assert.equal(quickPanelPerformanceState({}, 'balanced', { downloads: 'normal', scans: 'normal' }, 'g2').mode, 'balanced')
})

test('politiques de pause réelles (spec §24)', () => {
  const state = quickPanelPerformanceState({}, 'auto', { downloads: 'paused', scans: 'paused' }, 'g1')
  assert.equal(state.downloadsPaused, true)
  assert.equal(state.scansPaused, true)
})

test('scans « réduits » comptent comme pause (politique effective non normale)', () => {
  const state = quickPanelPerformanceState({}, 'auto', { downloads: 'normal', scans: 'reduced' }, 'g1')
  assert.equal(state.scansPaused, true)
  assert.equal(state.downloadsPaused, false)
})

test('mods préparés : session lancée par ZAILON avec déploiement actif (spec §69)', () => {
  assert.equal(modsPreparedFor(session({ source: 'zailon', deploymentActive: true })), true)
})

test('mods NON préparés : session détectée après coup (Steam / launcher / UAC)', () => {
  assert.equal(modsPreparedFor(session({ source: 'steam', deploymentActive: true })), false)
  assert.equal(modsPreparedFor(session({ source: 'detected', deploymentActive: true })), false)
  assert.equal(modsPreparedFor(session({ source: 'recovered', deploymentActive: true })), false)
})

test('mods NON préparés : lancé par ZAILON mais déploiement inactif', () => {
  assert.equal(modsPreparedFor(session({ source: 'zailon', deploymentActive: false })), false)
})

test('multi-session : la session épinglée est prioritaire (spec §50)', () => {
  const sessions = [
    session({ id: 's1', gameId: 'cyberpunk', state: 'GameRunning' }),
    session({ id: 's2', gameId: 'nte', state: 'GameRunning' }),
  ]
  const entries = activeSessionsForQuickPanel(sessions, [{ id: 'cyberpunk', name: 'Cyberpunk 2077' }, { id: 'nte', name: 'Neverness to Everness' }], 'nte', 'cyberpunk')
  assert.equal(entries.length, 2)
  const priority = entries.find(entry => entry.isPriority)
  assert.equal(priority?.gameId, 'nte')
  assert.equal(entries.find(entry => entry.gameId === 'nte')?.pinned, true)
})

test('multi-session : sans pin, la session au premier plan est prioritaire (spec §14, §49)', () => {
  const sessions = [
    session({ id: 's1', gameId: 'cyberpunk', state: 'GameRunning' }),
    session({ id: 's2', gameId: 'nte', state: 'GameRunning' }),
  ]
  const entries = activeSessionsForQuickPanel(sessions, [{ id: 'cyberpunk', name: 'Cyberpunk 2077' }, { id: 'nte', name: 'Neverness to Everness' }], undefined, 'cyberpunk')
  assert.equal(entries.find(entry => entry.isPriority)?.gameId, 'cyberpunk')
})

test('multi-session : les sessions terminales sont exclues (spec §47)', () => {
  const sessions = [
    session({ id: 's1', gameId: 'cyberpunk', state: 'GameRunning' }),
    session({ id: 's2', gameId: 'nte', state: 'Ended' }),
  ]
  const entries = activeSessionsForQuickPanel(sessions, [{ id: 'cyberpunk', name: 'Cyberpunk 2077' }, { id: 'nte', name: 'Neverness to Everness' }], undefined, undefined)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].gameId, 'cyberpunk')
})
